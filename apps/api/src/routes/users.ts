import { mediaTypeSchema, type Entry, type LiveShow, type Person, type Profile } from "@encore/shared";
import { and, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db/client";
import { friendRequests, friendships, titleEntries, users, watchCompanions } from "../db/schema";
import { requireAuth, type AuthVars } from "../lib/auth";
import { RateLimiter, tooMany } from "../lib/rate-limit";
import { blockedEitherWay, canViewContent, canViewReviews, notBlockedWith, relationshipBetween } from "../lib/social";
import { toPublicUser, usernameIs } from "../lib/users";
import { validate } from "../lib/validate";
import { withEntryCompanions, withShowCompanions } from "../services/companions";
import { listEntries } from "../services/entries";
import { listLiveShows, liveStats } from "../services/live";

/**
 * Reviews and show notes are only for their author, and for friends when the
 * author shares them (Settings > Privacy). Everyone else gets them stripped.
 */
const withoutReview = (e: Entry): Entry => ({ ...e, review: null });
const withoutNotes = (s: LiveShow): LiveShow => ({
  ...s,
  liked: null,
  disliked: null,
  notes: null,
  lineup: s.lineup.map((slot) => ({ ...slot, songs: slot.songs.map((song) => ({ ...song, note: null })) })),
});

const usernameParam = validate("param", z.object({ username: z.string().max(64) }));

/** Searching is cheap to abuse for scraping usernames, so cap it per account. */
const searchByAccount = new RateLimiter(60, 60_000);

/**
 * Looks up someone for the signed-in viewer. People who blocked the viewer (or
 * whom the viewer blocked) are a plain 404, the same as a username that doesn't exist.
 */
async function findVisibleUser(viewerId: string, username: string) {
  const user = await db.query.users.findFirst({ where: usernameIs(username) });
  if (!user || (user.id !== viewerId && (await blockedEitherWay(viewerId, user.id)))) {
    throw new HTTPException(404, { message: "User not found" });
  }
  const rel = await relationshipBetween(viewerId, user.id);
  return { user, ...rel, canView: canViewContent(user, rel.relationship), reviews: canViewReviews(user, rel.relationship) };
}

/** Like findVisibleUser, but a 403 when their privacy settings hide their rankings from you. */
async function findViewableUser(viewerId: string, username: string) {
  const found = await findVisibleUser(viewerId, username);
  if (!found.canView) throw new HTTPException(403, { message: "This profile is private" });
  return found;
}

const EMPTY_STATS = { movies: 0, series: 0, liveShows: 0, performers: 0, cities: 0 };

export const userRoutes = new Hono<AuthVars>()
  .use(requireAuth)

  .get("/search", validate("query", z.object({ q: z.string().trim().min(1).max(60) })), async (c) => {
    const viewerId = c.get("userId");
    const wait = searchByAccount.hit(viewerId);
    if (wait > 0) tooMany(wait);
    const q = c.req.valid("query").q.replace(/^@/, "");
    if (q.length < 2) return c.json({ users: [] as Person[] });
    const pattern = q.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    const isFriend = sql`exists (select 1 from ${friendships} where ${friendships.userId} = ${viewerId} and ${friendships.friendId} = ${users.id})`;
    const rows = await db
      .select({ id: users.id, username: users.username, displayName: users.displayName })
      .from(users)
      .where(
        and(
          ne(users.id, viewerId),
          or(ilike(users.username, `${pattern}%`), ilike(users.displayName, `%${pattern}%`)),
          or(eq(users.searchable, true), isFriend),
          notBlockedWith(viewerId, users.id),
        ),
      )
      // Exact username first, then username prefix matches, then name matches.
      .orderBy(
        sql`lower(${users.username}) = lower(${q}) desc`,
        sql`lower(${users.username}) like lower(${`${pattern}%`}) desc`,
        users.username,
      )
      .limit(20);
    if (!rows.length) return c.json({ users: [] as Person[] });

    const ids = rows.map((r) => r.id);
    const [friendRows, requestRows] = await Promise.all([
      db.select({ id: friendships.friendId }).from(friendships).where(and(eq(friendships.userId, viewerId), inArray(friendships.friendId, ids))),
      db
        .select({ from: friendRequests.fromUserId, to: friendRequests.toUserId })
        .from(friendRequests)
        .where(
          or(
            and(eq(friendRequests.fromUserId, viewerId), inArray(friendRequests.toUserId, ids)),
            and(eq(friendRequests.toUserId, viewerId), inArray(friendRequests.fromUserId, ids)),
          ),
        ),
    ]);
    const friends = new Set(friendRows.map((r) => r.id));
    const sent = new Set(requestRows.filter((r) => r.from === viewerId).map((r) => r.to));
    const received = new Set(requestRows.filter((r) => r.to === viewerId).map((r) => r.from));
    const people: Person[] = rows.map((r) => ({
      ...toPublicUser(r),
      relationship: friends.has(r.id) ? "friend" : sent.has(r.id) ? "requested" : received.has(r.id) ? "incoming" : "none",
    }));
    return c.json({ users: people });
  })

  .get("/:username", usernameParam, async (c) => {
    const viewerId = c.get("userId");
    const { user, relationship, requestId, canView, reviews } = await findVisibleUser(viewerId, c.req.valid("param").username);
    const base = {
      user: toPublicUser(user),
      relationship,
      requestId,
      canView,
      canRequest: relationship === "none" && user.allowFriendRequests,
    };
    if (!canView) {
      const profile: Profile = { ...base, stats: EMPTY_STATS, topMovies: [], topShows: [], recentLiveShows: [] };
      return c.json(profile);
    }
    const [[entryStats], live, topMovies, topShows, recentLiveShows] = await Promise.all([
      db
        .select({
          movies: sql<number>`count(*) filter (where ${titleEntries.mediaType} = 'movie')`.mapWith(Number),
          series: sql<number>`count(*) filter (where ${titleEntries.mediaType} = 'tv')`.mapWith(Number),
        })
        .from(titleEntries)
        .where(eq(titleEntries.userId, user.id)),
      liveStats(user.id),
      listEntries(user.id, { mediaType: "movie", limit: 10 }),
      listEntries(user.id, { mediaType: "tv", limit: 10 }),
      listLiveShows(user.id, 6),
    ]);
    const profile: Profile = {
      ...base,
      stats: { ...entryStats, ...live },
      topMovies: await withEntryCompanions(reviews ? topMovies : topMovies.map(withoutReview), viewerId, user.id),
      topShows: await withEntryCompanions(reviews ? topShows : topShows.map(withoutReview), viewerId, user.id),
      recentLiveShows: await withShowCompanions(reviews ? recentLiveShows : recentLiveShows.map(withoutNotes), viewerId, user.id),
    };
    return c.json(profile);
  })

  .get("/:username/entries", usernameParam, validate("query", z.object({ mediaType: mediaTypeSchema.optional() })), async (c) => {
    const viewerId = c.get("userId");
    const { user, reviews } = await findViewableUser(viewerId, c.req.valid("param").username);
    const entries = await listEntries(user.id, c.req.valid("query"));
    return c.json({ entries: await withEntryCompanions(reviews ? entries : entries.map(withoutReview), viewerId, user.id) });
  })

  .get("/:username/live", usernameParam, async (c) => {
    const viewerId = c.get("userId");
    const { user, reviews } = await findViewableUser(viewerId, c.req.valid("param").username);
    const shows = await listLiveShows(user.id);
    return c.json({ shows: await withShowCompanions(reviews ? shows : shows.map(withoutNotes), viewerId, user.id) });
  })

  /**
   * What the two of you watched together: your logs where you tagged them, and
   * theirs where they tagged you (when you can see their profile). A title you
   * both logged shows once, as your entry.
   */
  .get("/:username/together", usernameParam, async (c) => {
    const viewerId = c.get("userId");
    const { user, canView, reviews } = await findVisibleUser(viewerId, c.req.valid("param").username);
    if (user.id === viewerId) return c.json({ entries: [] as Entry[], shows: [] as LiveShow[] });
    const tags = await db
      .select({ ownerId: watchCompanions.ownerId, entryId: watchCompanions.titleEntryId, showId: watchCompanions.liveShowId })
      .from(watchCompanions)
      .where(
        or(
          and(eq(watchCompanions.ownerId, viewerId), eq(watchCompanions.friendId, user.id)),
          canView ? and(eq(watchCompanions.ownerId, user.id), eq(watchCompanions.friendId, viewerId)) : undefined,
        ),
      );
    const ids = (owner: string, key: "entryId" | "showId") =>
      new Set(tags.flatMap((t) => (t.ownerId === owner && t[key] ? [t[key]] : [])));
    const [myEntryIds, theirEntryIds, myShowIds, theirShowIds] = [
      ids(viewerId, "entryId"),
      ids(user.id, "entryId"),
      ids(viewerId, "showId"),
      ids(user.id, "showId"),
    ];
    const [myEntries, theirEntries, myShows, theirShows] = await Promise.all([
      myEntryIds.size ? listEntries(viewerId, {}) : [],
      theirEntryIds.size ? listEntries(user.id, {}) : [],
      myShowIds.size ? listLiveShows(viewerId) : [],
      theirShowIds.size ? listLiveShows(user.id) : [],
    ]);
    const mine = myEntries.filter((e) => myEntryIds.has(e.id));
    const titleKey = (e: Entry) => `${e.title.mediaType}:${e.title.tmdbId}`;
    const mineKeys = new Set(mine.map(titleKey));
    const theirs = theirEntries
      .filter((e) => theirEntryIds.has(e.id) && !mineKeys.has(titleKey(e)))
      .map((e) => (reviews ? e : withoutReview(e)));
    const myShowList = myShows.filter((s) => myShowIds.has(s.id));
    const myDates = new Set(myShowList.map((s) => s.date));
    const theirShowList = theirShows
      .filter((s) => theirShowIds.has(s.id) && !myDates.has(s.date))
      .map((s) => (reviews ? s : withoutNotes(s)));
    const entries = [
      ...(await withEntryCompanions(mine, viewerId, viewerId)),
      ...(await withEntryCompanions(theirs, viewerId, user.id)),
    ].sort((a, b) => (b.watchedAt ?? b.createdAt).localeCompare(a.watchedAt ?? a.createdAt));
    const shows = [
      ...(await withShowCompanions(myShowList, viewerId, viewerId)),
      ...(await withShowCompanions(theirShowList, viewerId, user.id)),
    ].sort((a, b) => b.date.localeCompare(a.date));
    return c.json({ entries, shows });
  });
