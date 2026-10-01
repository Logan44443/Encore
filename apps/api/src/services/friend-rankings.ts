import {
  genreName,
  type ActivityItem,
  type Comparison,
  type Entry,
  type FriendRanking,
  type FriendsOnTitle,
  type MediaType,
  type SearchResult,
} from "@encore/shared";
import { and, desc, eq, inArray, lt, ne } from "drizzle-orm";
import { db } from "../db/client";
import { friendships, titleEntries, titles, users, watchlistItems } from "../db/schema";
import { toPublicUser } from "../lib/users";
import { withEntryCompanions, withShowCompanions } from "./companions";
import { entryColumns, listEntries, toEntry } from "./entries";
import { recentShowsBy } from "./live";

/** A friend whose rankings you can see: friends, unless their profile is set to "Only me". */
type VisibleFriend = { id: string; username: string; displayName: string; shareReviews: boolean; shareWatchlist: boolean };

export async function visibleFriends(viewerId: string): Promise<VisibleFriend[]> {
  return db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      shareReviews: users.shareReviews,
      shareWatchlist: users.shareWatchlist,
    })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.friendId))
    .where(and(eq(friendships.userId, viewerId), ne(users.profileVisibility, "private")));
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Which friends ranked a title, what they gave it, and which friends want to watch it. */
export async function friendsOnTitle(viewerId: string, mediaType: MediaType, tmdbId: number): Promise<FriendsOnTitle> {
  const empty: FriendsOnTitle = { rankings: [], average: null, wantToWatch: [] };
  const friends = await visibleFriends(viewerId);
  if (!friends.length) return empty;
  const title = await db.query.titles.findFirst({
    where: and(eq(titles.mediaType, mediaType), eq(titles.tmdbId, tmdbId)),
    columns: { id: true },
  });
  if (!title) return empty;
  const byId = new Map(friends.map((f) => [f.id, f]));
  const ids = friends.map((f) => f.id);
  const [entries, watching] = await Promise.all([
    db
      .select({
        userId: titleEntries.userId,
        id: titleEntries.id,
        score: titleEntries.score,
        tier: titleEntries.tier,
        genreId: titleEntries.genreId,
        review: titleEntries.review,
        watchedAt: titleEntries.watchedAt,
      })
      .from(titleEntries)
      .where(and(eq(titleEntries.titleId, title.id), inArray(titleEntries.userId, ids)))
      .orderBy(desc(titleEntries.score)),
    db
      .select({ userId: watchlistItems.userId })
      .from(watchlistItems)
      .where(and(eq(watchlistItems.titleId, title.id), inArray(watchlistItems.userId, ids))),
  ]);
  const rankings: FriendRanking[] = entries.map((e) => {
    const friend = byId.get(e.userId)!;
    return {
      user: toPublicUser(friend),
      entryId: e.id,
      score: e.score,
      tier: e.tier,
      genreName: genreName(mediaType, e.genreId),
      review: friend.shareReviews ? e.review : null,
      watchedAt: e.watchedAt,
    };
  });
  return {
    rankings,
    average: rankings.length ? round1(rankings.reduce((sum, r) => sum + r.score, 0) / rankings.length) : null,
    wantToWatch: watching.flatMap((w) => {
      const f = byId.get(w.userId)!;
      return f.shareWatchlist ? [toPublicUser(f)] : [];
    }),
  };
}

const titleKey = (e: Entry) => `${e.title.mediaType}:${e.title.tmdbId}`;
const LOVED = 8;

/**
 * Taste match: 100 minus ten points per point of average difference between
 * your scores on titles you both ranked (so agreeing within 1.5 on average is 85%).
 */
export function tasteMatch(pairs: { mine: number; theirs: number }[]): number | null {
  if (pairs.length < 3) return null;
  const meanDiff = pairs.reduce((sum, p) => sum + Math.abs(p.mine - p.theirs), 0) / pairs.length;
  return Math.max(0, Math.round(100 - meanDiff * 10));
}

export async function compare(viewerId: string, otherId: string, otherShareReviews: boolean): Promise<Comparison> {
  const [mine, theirs] = await Promise.all([listEntries(viewerId, {}), listEntries(otherId, {})]);
  const mineByKey = new Map(mine.map((e) => [titleKey(e), e]));
  const theirKeys = new Set(theirs.map(titleKey));
  const both = theirs
    .flatMap((t) => {
      const m = mineByKey.get(titleKey(t));
      return m ? [{ title: t.title, mine: m.score, theirs: t.score }] : [];
    })
    .sort((a, b) => Math.abs(b.mine - b.theirs) - Math.abs(a.mine - a.theirs));
  return {
    match: tasteMatch(both),
    both,
    theyLoved: theirs
      .filter((e) => e.score >= LOVED && !mineByKey.has(titleKey(e)))
      .slice(0, 20)
      .map((e) => (otherShareReviews ? e : { ...e, review: null })),
    youLoved: mine.filter((e) => e.score >= LOVED && !theirKeys.has(titleKey(e))).slice(0, 20),
  };
}

const ACTIVITY_PAGE = 30;

/** Friends' latest rankings and shows, newest first. */
export async function friendActivity(viewerId: string, before: Date | null): Promise<ActivityItem[]> {
  const friends = await visibleFriends(viewerId);
  if (!friends.length) return [];
  const byId = new Map(friends.map((f) => [f.id, f]));
  const ids = friends.map((f) => f.id);
  const [entryRows, shows] = await Promise.all([
    db
      .select({ ...entryColumns, ownerId: titleEntries.userId })
      .from(titleEntries)
      .innerJoin(titles, eq(titles.id, titleEntries.titleId))
      .where(and(inArray(titleEntries.userId, ids), before ? lt(titleEntries.createdAt, before) : undefined))
      .orderBy(desc(titleEntries.createdAt))
      .limit(ACTIVITY_PAGE),
    recentShowsBy(ids, before, ACTIVITY_PAGE),
  ]);
  const ownerOf = new Map(entryRows.map((r) => [r.id, r.ownerId]));

  const entries = await withEntryCompanions(
    entryRows.map((r) => {
      const e = toEntry(r);
      return byId.get(ownerOf.get(e.id)!)!.shareReviews ? e : { ...e, review: null };
    }),
    viewerId,
    null,
  );
  const showList = await withShowCompanions(
    shows.map(({ userId, show }) =>
      byId.get(userId)!.shareReviews ? show : { ...show, liked: null, disliked: null, notes: null, lineup: show.lineup.map((l) => ({ ...l, songs: l.songs.map((x) => ({ ...x, note: null })) })) },
    ),
    viewerId,
    null,
  );
  const showOwner = new Map(shows.map((s) => [s.show.id, s.userId]));

  const items: ActivityItem[] = [
    ...entries.map((entry): ActivityItem => ({
      kind: "entry",
      user: toPublicUser(byId.get(ownerOf.get(entry.id)!)!),
      entry,
      at: entry.createdAt,
    })),
    ...showList.map((show): ActivityItem => ({
      kind: "show",
      user: toPublicUser(byId.get(showOwner.get(show.id)!)!),
      show,
      at: show.createdAt,
    })),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, ACTIVITY_PAGE);
}

/**
 * Feed candidates from friends: titles friends you can see scored LOVED or more,
 * weighted by how closely their taste matches yours.
 */
export async function friendPicks(viewerId: string, mine: Entry[]) {
  const friends = await visibleFriends(viewerId);
  if (!friends.length) return [];
  const mineByKey = new Map(mine.map((e) => [titleKey(e), e.score]));
  const ids = friends.map((f) => f.id);
  const rows = await db
    .select({
      userId: titleEntries.userId,
      score: titleEntries.score,
      tmdbId: titles.tmdbId,
      mediaType: titles.mediaType,
      name: titles.name,
      year: titles.year,
      posterUrl: titles.posterUrl,
      overview: titles.overview,
      genres: titles.genres,
    })
    .from(titleEntries)
    .innerJoin(titles, eq(titles.id, titleEntries.titleId))
    .where(inArray(titleEntries.userId, ids));

  // Taste match per friend, from the titles you both ranked.
  const pairs = new Map<string, { mine: number; theirs: number }[]>();
  for (const r of rows) {
    const m = mineByKey.get(`${r.mediaType}:${r.tmdbId}`);
    if (m === undefined) continue;
    pairs.set(r.userId, [...(pairs.get(r.userId) ?? []), { mine: m, theirs: r.score }]);
  }
  const weight = new Map(friends.map((f) => [f.id, (tasteMatch(pairs.get(f.id) ?? []) ?? 60) / 100]));
  const nameOf = new Map(friends.map((f) => [f.id, f.displayName]));

  const byTitle = new Map<string, { title: SearchResult; weight: number; fans: { name: string; weight: number }[] }>();
  for (const r of rows) {
    const key = `${r.mediaType}:${r.tmdbId}`;
    if (r.score < LOVED || mineByKey.has(key)) continue;
    const w = weight.get(r.userId)! * (r.score / 10);
    const hit = byTitle.get(key) ?? {
      title: {
        tmdbId: r.tmdbId,
        mediaType: r.mediaType,
        name: r.name,
        year: r.year,
        posterUrl: r.posterUrl,
        overview: r.overview,
        genreIds: r.genres.map((g) => g.id),
        voteAverage: null,
      },
      weight: 0,
      fans: [],
    };
    hit.weight += w;
    hit.fans.push({ name: nameOf.get(r.userId)!, weight: w });
    byTitle.set(key, hit);
  }
  return [...byTitle.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 30)
    .map((t) => ({ title: t.title, weight: t.weight, names: t.fans.sort((a, b) => b.weight - a.weight).map((f) => f.name) }));
}
