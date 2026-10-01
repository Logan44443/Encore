import { blockUserSchema, reportSchema, sendFriendRequestSchema, type FriendRequest } from "@encore/shared";
import { and, desc, eq, or } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db/client";
import { blocks, friendRequests, friendships, reports, users } from "../db/schema";
import { requireAuth, type AuthVars } from "../lib/auth";
import { RateLimiter, tooMany } from "../lib/rate-limit";
import { areFriends, blockedEitherWay, cutTies } from "../lib/social";
import { toPublicUser, usernameIs } from "../lib/users";
import { validate } from "../lib/validate";
import { confirmTag, pendingTags, removeTag, removeTagsBetween } from "../services/companions";

/** Stops one account spraying requests at strangers. */
const requestsByAccount = new RateLimiter(30, 60 * 60_000);
const reportsByAccount = new RateLimiter(20, 60 * 60_000);
const MAX_PENDING_SENT = 100;

const idParam = validate("param", z.object({ id: z.uuid() }));
const userIdParam = validate("param", z.object({ userId: z.uuid() }));

const publicColumns = { id: users.id, username: users.username, displayName: users.displayName };

/** Makes two people friends and clears any requests between them. Safe to repeat. */
async function befriend(a: string, b: string) {
  await db.transaction(async (tx) => {
    await tx
      .insert(friendships)
      .values([
        { userId: a, friendId: b },
        { userId: b, friendId: a },
      ])
      .onConflictDoNothing();
    await tx
      .delete(friendRequests)
      .where(
        or(
          and(eq(friendRequests.fromUserId, a), eq(friendRequests.toUserId, b)),
          and(eq(friendRequests.fromUserId, b), eq(friendRequests.toUserId, a)),
        ),
      );
  });
}

export const friendRoutes = new Hono<AuthVars>()
  .use(requireAuth)

  .get("/", async (c) => {
    const rows = await db
      .select(publicColumns)
      .from(friendships)
      .innerJoin(users, eq(users.id, friendships.friendId))
      .where(eq(friendships.userId, c.get("userId")))
      .orderBy(users.displayName);
    return c.json({ friends: rows.map(toPublicUser) });
  })

  .get("/requests", async (c) => {
    const userId = c.get("userId");
    const [incoming, outgoing] = await Promise.all([
      db
        .select({ id: friendRequests.id, createdAt: friendRequests.createdAt, user: publicColumns })
        .from(friendRequests)
        .innerJoin(users, eq(users.id, friendRequests.fromUserId))
        .where(eq(friendRequests.toUserId, userId))
        .orderBy(desc(friendRequests.createdAt)),
      db
        .select({ id: friendRequests.id, createdAt: friendRequests.createdAt, user: publicColumns })
        .from(friendRequests)
        .innerJoin(users, eq(users.id, friendRequests.toUserId))
        .where(eq(friendRequests.fromUserId, userId))
        .orderBy(desc(friendRequests.createdAt)),
    ]);
    const shape = (r: (typeof incoming)[number]): FriendRequest => ({
      id: r.id,
      user: toPublicUser(r.user),
      createdAt: r.createdAt.toISOString(),
    });
    return c.json({ incoming: incoming.map(shape), outgoing: outgoing.map(shape) });
  })

  .post("/requests", validate("json", sendFriendRequestSchema), async (c) => {
    const userId = c.get("userId");
    const wait = requestsByAccount.hit(userId);
    if (wait > 0) tooMany(wait);
    const target = await db.query.users.findFirst({ where: usernameIs(c.req.valid("json").username.replace(/^@/, "")) });
    // Blocked either way looks the same as a username that doesn't exist.
    if (!target || (target.id !== userId && (await blockedEitherWay(userId, target.id)))) {
      throw new HTTPException(404, { message: "User not found" });
    }
    if (target.id === userId) throw new HTTPException(400, { message: "That's you" });
    if (await areFriends(userId, target.id)) return c.json({ relationship: "friend" as const });

    // They already asked you: asking back is a yes.
    const theirs = await db.query.friendRequests.findFirst({
      where: and(eq(friendRequests.fromUserId, target.id), eq(friendRequests.toUserId, userId)),
    });
    if (theirs) {
      await befriend(userId, target.id);
      return c.json({ relationship: "friend" as const });
    }
    if (!target.allowFriendRequests) throw new HTTPException(403, { message: "They aren't taking friend requests" });

    const pending = await db.$count(friendRequests, eq(friendRequests.fromUserId, userId));
    if (pending >= MAX_PENDING_SENT) {
      throw new HTTPException(429, { message: "You have too many requests waiting. Cancel some first." });
    }
    await db.insert(friendRequests).values({ fromUserId: userId, toUserId: target.id }).onConflictDoNothing();
    return c.json({ relationship: "requested" as const }, 201);
  })

  .post("/requests/:id/accept", idParam, async (c) => {
    const userId = c.get("userId");
    const request = await db.query.friendRequests.findFirst({
      where: and(eq(friendRequests.id, c.req.valid("param").id), eq(friendRequests.toUserId, userId)),
    });
    if (!request) throw new HTTPException(404, { message: "Request not found" });
    await befriend(userId, request.fromUserId);
    return c.body(null, 204);
  })

  /** Declines a request sent to you or cancels one you sent. The other person isn't told. */
  .delete("/requests/:id", idParam, async (c) => {
    const userId = c.get("userId");
    await db
      .delete(friendRequests)
      .where(
        and(
          eq(friendRequests.id, c.req.valid("param").id),
          or(eq(friendRequests.toUserId, userId), eq(friendRequests.fromUserId, userId)),
        ),
      );
    return c.body(null, 204);
  })

  .delete("/:userId", userIdParam, async (c) => {
    await cutTies(c.get("userId"), c.req.valid("param").userId);
    return c.body(null, 204);
  });

/** Block and report (App Store guideline 1.2: apps with content from other users must offer both). */
export const safetyRoutes = new Hono<AuthVars>()
  // Mounted at the root, so auth goes on each route: a bare .use() here would cover the whole API.
  .get("/blocks", requireAuth, async (c) => {
    const rows = await db
      .select(publicColumns)
      .from(blocks)
      .innerJoin(users, eq(users.id, blocks.blockedId))
      .where(eq(blocks.blockerId, c.get("userId")))
      .orderBy(desc(blocks.createdAt));
    return c.json({ users: rows.map(toPublicUser) });
  })

  .post("/blocks", requireAuth, validate("json", blockUserSchema), async (c) => {
    const userId = c.get("userId");
    const { userId: blockedId } = c.req.valid("json");
    if (blockedId === userId) throw new HTTPException(400, { message: "You can't block yourself" });
    const target = await db.query.users.findFirst({ where: eq(users.id, blockedId), columns: { id: true } });
    if (!target) throw new HTTPException(404, { message: "User not found" });
    await db.insert(blocks).values({ blockerId: userId, blockedId }).onConflictDoNothing();
    await cutTies(userId, blockedId);
    await removeTagsBetween(userId, blockedId);
    return c.body(null, 204);
  })

  .delete("/blocks/:userId", requireAuth, userIdParam, async (c) => {
    await db.delete(blocks).where(and(eq(blocks.blockerId, c.get("userId")), eq(blocks.blockedId, c.req.valid("param").userId)));
    return c.body(null, 204);
  })

  /** Stored for review. Reports are checked by hand: `npm run reports -w @encore/api`. */
  .post("/reports", requireAuth, validate("json", reportSchema), async (c) => {
    const userId = c.get("userId");
    const wait = reportsByAccount.hit(userId);
    if (wait > 0) tooMany(wait);
    const body = c.req.valid("json");
    if (body.userId === userId) throw new HTTPException(400, { message: "You can't report yourself" });
    const target = await db.query.users.findFirst({ where: eq(users.id, body.userId), columns: { id: true, username: true } });
    if (!target) throw new HTTPException(404, { message: "User not found" });
    await db.insert(reports).values({
      reporterId: userId,
      targetUserId: target.id,
      targetUsername: target.username,
      kind: body.kind,
      targetId: body.kind === "user" ? null : (body.targetId ?? null),
      reason: body.reason,
      details: body.details || null,
    });
    console.warn(`[reports] ${body.kind} report on @${target.username} (${body.reason})`);
    if (body.block) {
      await db.insert(blocks).values({ blockerId: userId, blockedId: target.id }).onConflictDoNothing();
      await cutTies(userId, target.id);
      await removeTagsBetween(userId, target.id);
    }
    return c.body(null, 204);
  });

/** "Watched with" tags: the ones waiting for you, confirming them, removing them. */
export const companionRoutes = new Hono<AuthVars>()
  .use(requireAuth)
  .get("/pending", async (c) => c.json({ tags: await pendingTags(c.get("userId")) }))
  .post("/:id/confirm", idParam, async (c) => {
    await confirmTag(c.get("userId"), c.req.valid("param").id);
    return c.body(null, 204);
  })
  .delete("/:id", idParam, async (c) => {
    await removeTag(c.get("userId"), c.req.valid("param").id);
    return c.body(null, 204);
  });
