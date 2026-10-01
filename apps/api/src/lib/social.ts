import type { Relationship } from "@encore/shared";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { blocks, friendRequests, friendships, users } from "../db/schema";

type Owner = Pick<typeof users.$inferSelect, "id" | "profileVisibility" | "shareReviews" | "allowFriendRequests">;

/** True when either person has blocked the other. Blocks hide people from each other in both directions. */
export async function blockedEitherWay(a: string, b: string): Promise<boolean> {
  const row = await db.query.blocks.findFirst({
    where: or(and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)), and(eq(blocks.blockerId, b), eq(blocks.blockedId, a))),
    columns: { blockerId: true },
  });
  return Boolean(row);
}

/** SQL condition: `userColumn` is not someone `viewerId` blocked or was blocked by. */
export const notBlockedWith = (viewerId: string, userColumn: typeof users.id) => sql`not exists (
  select 1 from ${blocks}
  where (${blocks.blockerId} = ${viewerId} and ${blocks.blockedId} = ${userColumn})
     or (${blocks.blockerId} = ${userColumn} and ${blocks.blockedId} = ${viewerId})
)`;

export async function areFriends(a: string, b: string): Promise<boolean> {
  const row = await db.query.friendships.findFirst({
    where: and(eq(friendships.userId, a), eq(friendships.friendId, b)),
    columns: { userId: true },
  });
  return Boolean(row);
}

/** Where the viewer stands with someone, plus the pending request between them if there is one. */
export async function relationshipBetween(
  viewerId: string,
  otherId: string,
): Promise<{ relationship: Relationship; requestId: string | null }> {
  if (viewerId === otherId) return { relationship: "self", requestId: null };
  if (await areFriends(viewerId, otherId)) return { relationship: "friend", requestId: null };
  const request = await db.query.friendRequests.findFirst({
    where: or(
      and(eq(friendRequests.fromUserId, viewerId), eq(friendRequests.toUserId, otherId)),
      and(eq(friendRequests.fromUserId, otherId), eq(friendRequests.toUserId, viewerId)),
    ),
  });
  if (!request) return { relationship: "none", requestId: null };
  return { relationship: request.fromUserId === viewerId ? "requested" : "incoming", requestId: request.id };
}

/** Whether the viewer may see someone's rankings, scores and live shows. */
export function canViewContent(owner: Owner, relationship: Relationship): boolean {
  if (relationship === "self") return true;
  if (owner.profileVisibility === "public") return true;
  return owner.profileVisibility === "friends" && relationship === "friend";
}

/** Reviews and show notes: the author, and friends when the author shares them. */
export function canViewReviews(owner: Owner, relationship: Relationship): boolean {
  return relationship === "self" || (relationship === "friend" && owner.shareReviews);
}

/** Ends a friendship and any pending requests between two people (unfriend, block). */
export async function cutTies(a: string, b: string) {
  await db.transaction(async (tx) => {
    await tx
      .delete(friendships)
      .where(or(and(eq(friendships.userId, a), eq(friendships.friendId, b)), and(eq(friendships.userId, b), eq(friendships.friendId, a))));
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
