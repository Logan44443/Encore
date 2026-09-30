import {
  genreName,
  TIER_RANGES,
  type DiscoverResult,
  type Entry,
  type Feed,
  type FeedItem,
  type FeedReason,
  type MediaType,
  type SearchResult,
} from "@encore/shared";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db/client";
import { dismissedTitles, titleEntries, titles } from "../db/schema";
import { TtlCache } from "../lib/cache";
import { catalog } from "../providers/catalog";
import { statsFor, topRated, trending } from "./discover";
import { listEntries } from "./entries";
import { listWatchlist } from "./watchlist";

/**
 * "Recommended for you": one ranked feed across movies and TV.
 *
 * Candidates come from four sources, each adding points:
 *   similar   — catalog "more like this" for your top liked titles   3 × seed score / 10
 *   taste     — liked by users who liked ≥ 2 of the same titles      2 × overlap / best overlap
 *   genre     — acclaimed titles in your strongest genres            1.2 × genre affinity
 *   watchlist — saved but not yet ranked (at most 3 in the feed)     1.5
 * Boosts: genre affinity of the title, community score, recent release.
 * Penalty: shares genres with titles you marked "not interested".
 * Anything ranked or dismissed is never shown. The list is then mixed so the
 * same reason and media type don't run back-to-back.
 */
const FEED_SIZE = 30;
const SEEDS = 8;
const MIN_LIKED = 3;
const MIN_OVERLAP = 2;
const MAX_WATCHLIST = 3;
const MAX_PER_SEED = 4;

const cache = new TtlCache<Feed>(500);
const CACHE_MS = 15 * 60_000;

export function invalidateFeed(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
}

type Key = `${MediaType}:${number}`;
const keyOf = (t: { mediaType: MediaType; tmdbId: number }): Key => `${t.mediaType}:${t.tmdbId}`;

interface Candidate {
  title: SearchResult;
  points: number;
  best: { reason: FeedReason; points: number; group: string };
}

export function getFeed(userId: string): Promise<Feed> {
  return cache.wrap(userId, CACHE_MS, () => buildFeed(userId));
}

async function buildFeed(userId: string): Promise<Feed> {
  const [entries, dismissed, watchlist] = await Promise.all([
    listEntries(userId, {}),
    db.select().from(dismissedTitles).where(eq(dismissedTitles.userId, userId)),
    listWatchlist(userId),
  ]);

  const excluded = new Set<Key>([
    ...entries.map((e) => keyOf(e.title)),
    ...dismissed.map((d) => keyOf({ mediaType: d.mediaType, tmdbId: d.tmdbId })),
  ]);
  const liked = entries.filter((e) => e.tier === "liked");

  if (liked.length < MIN_LIKED) return { items: await popularFeed(excluded), personalized: false };

  const affinity = genreAffinity(entries);
  const dismissedGenres = dismissed.map((d) => new Set(d.genreIds));
  const pool = new Map<Key, Candidate>();

  const add = (title: SearchResult, points: number, reason: FeedReason, group: string) => {
    const key = keyOf(title);
    if (excluded.has(key)) return;
    const c = pool.get(key);
    if (!c) {
      pool.set(key, { title, points, best: { reason, points, group } });
      return;
    }
    c.points += points;
    if (points > c.best.points) c.best = { reason, points, group };
    if (!c.title.posterUrl && title.posterUrl) c.title = title;
  };

  const seeds = liked.slice(0, SEEDS);
  const [similarLists, tasteRows, genreLists] = await Promise.all([
    Promise.all(seeds.map((s) => catalog.similar(s.title.mediaType, s.title.tmdbId).catch((): SearchResult[] => []))),
    tastePicks(userId, liked),
    Promise.all(
      topGenres(affinity, 4).map(async (g) => ({
        ...g,
        results: await catalog.topInGenre(g.mediaType, g.genreId).catch((): SearchResult[] => []),
      })),
    ),
  ]);

  seeds.forEach((seed, i) => {
    for (const t of similarLists[i]) {
      add(t, 3 * (seed.score / 10), { kind: "similar", seed: seed.title }, `seed:${keyOf(seed.title)}`);
    }
  });

  const bestOverlap = Math.max(1, ...tasteRows.map((r) => r.weight));
  for (const r of tasteRows) {
    add(r.title, 2 * (r.weight / bestOverlap), { kind: "taste", fans: r.fans }, "taste");
  }

  for (const g of genreLists) {
    const name = genreName(g.mediaType, g.genreId);
    for (const t of g.results.slice(0, 12)) {
      add(t, 1.2 * g.weight, { kind: "genre", genreName: name }, `genre:${g.mediaType}:${g.genreId}`);
    }
  }

  let watchlistAdded = 0;
  for (const item of watchlist) {
    if (!item.title || watchlistAdded >= MAX_WATCHLIST) continue;
    const t: SearchResult = { ...item.title, overview: "", genreIds: [], voteAverage: null };
    if (excluded.has(keyOf(t))) continue;
    add(t, 1.5, { kind: "watchlist" }, "watchlist");
    watchlistAdded++;
  }

  const currentYear = new Date().getFullYear();
  const scored = [...pool.values()].map((c) => {
    const g = c.title.genreIds;
    const fit = g.length ? g.reduce((sum, id) => sum + (affinity.get(`${c.title.mediaType}:${id}`) ?? 0), 0) / g.length : 0;
    const recent = c.title.year && c.title.year >= currentYear - 2 ? 0.3 : 0;
    const similarToDismissed = dismissedGenres.filter((set) => g.filter((id) => set.has(id)).length >= 2).length;
    return { ...c, points: c.points + fit + recent - 0.3 * Math.min(3, similarToDismissed) };
  });

  const withStats = await annotate(scored.map((c) => c.title));
  const ranked = scored
    .map((c) => {
      const community = withStats.get(keyOf(c.title))?.community ?? null;
      const quality = community ? 0.5 * ((community.avgScore - 5) / 5) : 0;
      return { ...c, title: withStats.get(keyOf(c.title)) ?? { ...c.title, community: null }, points: c.points + quality };
    })
    .sort((a, b) => b.points - a.points);

  const items = mix(ranked);
  if (items.length < FEED_SIZE) {
    const have = new Set(items.map((i) => keyOf(i.title)));
    const fill = (await popularFeed(new Set([...excluded, ...have]))).slice(0, FEED_SIZE - items.length);
    items.push(...fill);
  }
  return { items, personalized: true };
}

/** Per (media type, genre): how much you like it, 0–1. Scores above 5 count for, below count against. */
function genreAffinity(entries: Entry[]): Map<string, number> {
  const raw = new Map<string, number>();
  for (const e of entries) {
    const key = `${e.title.mediaType}:${e.genreId}`;
    raw.set(key, (raw.get(key) ?? 0) + (e.score - 5));
  }
  const max = Math.max(1, ...raw.values());
  return new Map([...raw].filter(([, v]) => v > 0).map(([k, v]) => [k, v / max]));
}

function topGenres(affinity: Map<string, number>, n: number) {
  return [...affinity]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, weight]) => {
      const [mediaType, id] = k.split(":");
      return { mediaType: mediaType as MediaType, genreId: Number(id), weight };
    });
}

/** Titles liked by people who liked at least MIN_OVERLAP of the same titles you did. */
async function tastePicks(userId: string, liked: Entry[]) {
  const likedIds = await db
    .select({ titleId: titleEntries.titleId })
    .from(titleEntries)
    .where(and(eq(titleEntries.userId, userId), eq(titleEntries.tier, "liked")));
  if (likedIds.length === 0) return [];

  const overlap = sql<number>`count(*)`.mapWith(Number);
  const neighbours = await db
    .select({ userId: titleEntries.userId, overlap })
    .from(titleEntries)
    .where(
      and(
        ne(titleEntries.userId, userId),
        eq(titleEntries.tier, "liked"),
        inArray(
          titleEntries.titleId,
          likedIds.map((r) => r.titleId),
        ),
      ),
    )
    .groupBy(titleEntries.userId)
    .having(sql`count(*) >= ${MIN_OVERLAP}`)
    .orderBy(desc(overlap))
    .limit(50);
  if (neighbours.length === 0) return [];

  const weightOf = new Map(neighbours.map((n) => [n.userId, n.overlap]));
  const rows = await db
    .select({
      userId: titleEntries.userId,
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
    .where(
      and(
        inArray(
          titleEntries.userId,
          neighbours.map((n) => n.userId),
        ),
        sql`${titleEntries.score} >= ${TIER_RANGES.liked.min}`,
      ),
    );

  const likedKeys = new Set(liked.map((e) => keyOf(e.title)));
  const byTitle = new Map<Key, { title: SearchResult; weight: number; fans: number }>();
  for (const r of rows) {
    const key = keyOf(r);
    if (likedKeys.has(key)) continue;
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
      fans: 0,
    };
    hit.weight += weightOf.get(r.userId) ?? 1;
    hit.fans += 1;
    byTitle.set(key, hit);
  }
  return [...byTitle.values()].sort((a, b) => b.weight - a.weight).slice(0, 40);
}

async function annotate(list: SearchResult[]): Promise<Map<Key, DiscoverResult>> {
  const out = new Map<Key, DiscoverResult>();
  for (const type of ["movie", "tv"] as const) {
    const ofType = list.filter((t) => t.mediaType === type);
    const stats = await statsFor(
      type,
      ofType.map((t) => t.tmdbId),
    );
    for (const t of ofType) out.set(keyOf(t), { ...t, community: stats.get(t.tmdbId) ?? null });
  }
  return out;
}

/**
 * Greedy mix of a best-first list. Each pick is the best remaining candidate that
 * (a) doesn't make three of the same media type in a row, when the other type is
 * still available, and (b) preferably has a different reason than the previous
 * pick, looking a few places ahead so quality still wins. No seed contributes
 * more than MAX_PER_SEED titles.
 */
function mix(ranked: (Candidate & { title: DiscoverResult })[]): FeedItem[] {
  type C = (typeof ranked)[number];
  const pool = [...ranked];
  const out: FeedItem[] = [];
  const perGroup = new Map<string, number>();
  let lastGroup: string | null = null;

  const allowed = (c: C) => !c.best.group.startsWith("seed:") || (perGroup.get(c.best.group) ?? 0) < MAX_PER_SEED;

  while (out.length < FEED_SIZE && pool.length) {
    const [a, b] = out.slice(-2);
    const runType = a && b && a.title.mediaType === b.title.mediaType ? a.title.mediaType : null;
    const typeOk = (c: C) => !runType || c.title.mediaType !== runType;
    const candidates = pool.some((c) => allowed(c) && typeOk(c))
      ? pool.filter((c) => allowed(c) && typeOk(c))
      : pool.filter(allowed);
    if (candidates.length === 0) break;

    const pick = candidates.slice(0, 6).find((c) => c.best.group !== lastGroup) ?? candidates[0];
    pool.splice(pool.indexOf(pick), 1);
    perGroup.set(pick.best.group, (perGroup.get(pick.best.group) ?? 0) + 1);
    lastGroup = pick.best.group;
    out.push({ title: pick.title, reason: pick.best.reason });
  }
  return out;
}

/** Cold start and top-up: community top rated plus trending, movies and TV interleaved. */
async function popularFeed(excluded: Set<Key>): Promise<FeedItem[]> {
  const [movieTop, tvTop, movieTrend, tvTrend] = await Promise.all([
    topRated("movie"),
    topRated("tv"),
    trending("movie"),
    trending("tv"),
  ]);
  const lists = [movieTop, tvTop, movieTrend, tvTrend];
  const seen = new Set<Key>(excluded);
  const out: FeedItem[] = [];
  for (let i = 0; out.length < FEED_SIZE && lists.some((l) => i < l.length); i++) {
    for (const list of lists) {
      const t = list[i];
      if (!t || seen.has(keyOf(t))) continue;
      seen.add(keyOf(t));
      out.push({ title: t, reason: { kind: "popular" } });
      if (out.length >= FEED_SIZE) break;
    }
  }
  return out;
}

export async function dismissTitle(userId: string, input: { mediaType: MediaType; tmdbId: number; genreIds: number[] }) {
  await db
    .insert(dismissedTitles)
    .values({ userId, ...input })
    .onConflictDoNothing();
  invalidateFeed(userId);
}

export async function undismissTitle(userId: string, mediaType: MediaType, tmdbId: number) {
  await db
    .delete(dismissedTitles)
    .where(and(eq(dismissedTitles.userId, userId), eq(dismissedTitles.mediaType, mediaType), eq(dismissedTitles.tmdbId, tmdbId)));
  invalidateFeed(userId);
}
