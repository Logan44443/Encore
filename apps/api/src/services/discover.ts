import {
  genresFor,
  TIER_RANGES,
  type CommunityStats,
  type DiscoverResult,
  type GenreRecommendations,
  type GenreSummary,
  type MediaType,
  type SearchResult,
} from "@encore/shared";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { titleEntries, titles } from "../db/schema";
import { TtlCache } from "../lib/cache";
import { catalog } from "../providers/catalog";
import { listEntries } from "./entries";
import { toTitleSummary } from "./titles";

/**
 * Community-driven discovery.
 *
 * Trending ("what people are watching and rating highly right now"):
 *   heat     = Σ exp(-age / 72h) over logs from the last 14 days
 *              → every recent log counts, a log from today counts ~2.7× one from 3 days ago
 *   quality  = Bayesian average score = (C·m + Σscores) / (C + n)
 *              → m is the global mean, C the prior weight, so one 10/10 can't dominate
 *   trending = heat × (0.5 + quality / 10)
 *              → popularity drives the chart, ratings can boost a title up to 3× over a poorly rated one
 * Titles with no recent Encore activity are topped up from TMDB's weekly trending list.
 *
 * Top rated: highest Bayesian average with at least MIN_RATINGS logs, all time.
 */
const WINDOW = sql.raw(`interval '14 days'`);
const DECAY_SECONDS = 72 * 3600;
const PRIOR_WEIGHT = 3;
const MIN_RATINGS = 2;
const LIMIT = 24;

const cache = new TtlCache<DiscoverResult[]>(20);
const CACHE_MS = 2 * 60_000;

/** "Favourites" lists only include titles people, on average, liked. */
const liked = sql`avg(${titleEntries.score}) >= ${TIER_RANGES.liked.min}`;

/** Call after rankings change so charts reflect new activity immediately. */
export function invalidateDiscover() {
  cache.clear();
}

const isRecent = sql`${titleEntries.createdAt} > now() - ${WINDOW}`;

const titleColumns = {
  tmdbId: titles.tmdbId,
  mediaType: titles.mediaType,
  name: titles.name,
  year: titles.year,
  posterUrl: titles.posterUrl,
  overview: titles.overview,
  genres: titles.genres,
};

const statColumns = {
  recentLogs: sql<number>`count(*) filter (where ${isRecent})`.mapWith(Number),
  totalLogs: sql<number>`count(*)`.mapWith(Number),
  sumScore: sql<number>`sum(${titleEntries.score})`.mapWith(Number),
};

const heatColumn = sql<number>`sum(exp(-extract(epoch from (now() - ${titleEntries.createdAt})) / ${DECAY_SECONDS})) filter (where ${isRecent})`.mapWith(
  Number,
);

async function globalMean(type: MediaType): Promise<number> {
  const [row] = await db
    .select({ mean: sql<number | null>`avg(${titleEntries.score})`.mapWith((v) => (v === null ? null : Number(v))) })
    .from(titleEntries)
    .where(eq(titleEntries.mediaType, type));
  return row?.mean ?? 7;
}

const bayes = (sum: number, n: number, mean: number) => (PRIOR_WEIGHT * mean + sum) / (PRIOR_WEIGHT + n);

function toResult(
  row: { tmdbId: number; mediaType: MediaType; name: string; year: number | null; posterUrl: string | null; overview: string; genres: { id: number }[] },
  community: CommunityStats | null,
): DiscoverResult {
  return {
    tmdbId: row.tmdbId,
    mediaType: row.mediaType,
    name: row.name,
    year: row.year,
    posterUrl: row.posterUrl,
    overview: row.overview,
    genreIds: row.genres.map((g) => g.id),
    voteAverage: null,
    community,
  };
}

const stats = (r: { recentLogs: number; totalLogs: number; sumScore: number }): CommunityStats => ({
  recentLogs: r.recentLogs,
  totalLogs: r.totalLogs,
  avgScore: Math.round((r.sumScore / r.totalLogs) * 10) / 10,
});

/** Community stats for arbitrary titles (used to annotate TMDB results). */
export async function statsFor(type: MediaType, tmdbIds: number[]): Promise<Map<number, CommunityStats>> {
  if (tmdbIds.length === 0) return new Map();
  const rows = await db
    .select({ tmdbId: titles.tmdbId, ...statColumns })
    .from(titleEntries)
    .innerJoin(titles, eq(titles.id, titleEntries.titleId))
    .where(and(eq(titleEntries.mediaType, type), inArray(titles.tmdbId, tmdbIds)))
    .groupBy(titles.tmdbId);
  return new Map(rows.map((r) => [r.tmdbId, stats(r)]));
}

export function trending(type: MediaType): Promise<DiscoverResult[]> {
  return cache.wrap(`trending:${type}`, CACHE_MS, async () => {
    const [mean, rows, external] = await Promise.all([
      globalMean(type),
      db
        .select({ ...titleColumns, ...statColumns, heat: heatColumn })
        .from(titleEntries)
        .innerJoin(titles, eq(titles.id, titleEntries.titleId))
        .where(eq(titleEntries.mediaType, type))
        .groupBy(titles.id)
        .having(sql`count(*) filter (where ${isRecent}) > 0`),
      catalog.trending(type).catch((): SearchResult[] => []),
    ]);

    const community = rows
      .map((r) => ({ r, score: r.heat * (0.5 + bayes(r.sumScore, r.totalLogs, mean) / 10) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, LIMIT)
      .map(({ r }) => toResult(r, stats(r)));

    const seen = new Set(community.map((c) => c.tmdbId));
    const fill = external.filter((t) => !seen.has(t.tmdbId)).slice(0, Math.max(0, LIMIT - community.length));
    const fillStats = await statsFor(type, fill.map((t) => t.tmdbId));
    return [...community, ...fill.map((t) => ({ ...t, community: fillStats.get(t.tmdbId) ?? null }))];
  });
}

export function topRated(type: MediaType): Promise<DiscoverResult[]> {
  return cache.wrap(`top:${type}`, CACHE_MS, async () => {
    const mean = await globalMean(type);
    const n = sql`count(*)`;
    const rows = await db
      .select({ ...titleColumns, ...statColumns })
      .from(titleEntries)
      .innerJoin(titles, eq(titles.id, titleEntries.titleId))
      .where(eq(titleEntries.mediaType, type))
      .groupBy(titles.id)
      .having(and(sql`${n} >= ${MIN_RATINGS}`, liked))
      .orderBy(desc(sql`(${PRIOR_WEIGHT} * ${mean}::numeric + sum(${titleEntries.score})) / (${PRIOR_WEIGHT} + ${n})`))
      .limit(LIMIT);
    return rows.map((r) => toResult(r, stats(r)));
  });
}

/** Every genre for the media type, with how much you and the community have ranked in it. */
export async function genreSummaries(type: MediaType, userId: string | null): Promise<GenreSummary[]> {
  const rows = await db
    .select({
      genreId: titleEntries.genreId,
      communityCount: sql<number>`count(*)`.mapWith(Number),
      yourCount: userId
        ? sql<number>`count(*) filter (where ${titleEntries.userId} = ${userId})`.mapWith(Number)
        : sql<number>`0`.mapWith(Number),
    })
    .from(titleEntries)
    .where(eq(titleEntries.mediaType, type))
    .groupBy(titleEntries.genreId);
  const counts = new Map(rows.map((r) => [r.genreId, r]));
  return genresFor(type)
    .map((g) => ({ ...g, yourCount: counts.get(g.id)?.yourCount ?? 0, communityCount: counts.get(g.id)?.communityCount ?? 0 }))
    .sort((a, b) => b.yourCount - a.yourCount || b.communityCount - a.communityCount);
}

const PICKS = 18;

/**
 * Genre recommendations:
 *   trending        — same heat × quality formula as the main chart, limited to the genre,
 *                     topped up with the provider's most popular titles in the genre
 *   community       — Bayesian-ranked community favourites in the genre
 *   becauseYouLoved — provider recommendations seeded from your top-scored title in the genre
 *   acclaimed       — the provider's best-reviewed titles in the genre
 * Anything you've already ranked is filtered out of every list.
 */
export async function genreRecommendations(
  type: MediaType,
  genreId: number,
  userId: string | null,
): Promise<GenreRecommendations> {
  const genre = genresFor(type).find((g) => g.id === genreId)!;

  const [mean, rankedRows, yourTop] = await Promise.all([
    globalMean(type),
    userId
      ? db
          .select({ tmdbId: titles.tmdbId })
          .from(titleEntries)
          .innerJoin(titles, eq(titles.id, titleEntries.titleId))
          .where(and(eq(titleEntries.userId, userId), eq(titleEntries.mediaType, type)))
      : Promise.resolve([]),
    userId ? listEntries(userId, { mediaType: type, genreId, limit: 5 }) : Promise.resolve([]),
  ]);
  const ranked = new Set(rankedRows.map((r) => r.tmdbId));
  const unseen = <T extends { tmdbId: number }>(list: T[]) => list.filter((t) => !ranked.has(t.tmdbId));

  const inGenre = or(
    eq(titleEntries.genreId, genreId),
    sql`${titles.genres} @> ${JSON.stringify([{ id: genreId }])}::jsonb`,
  );
  const n = sql`count(*)`;
  const seed = yourTop.find((e) => e.tier === "liked");

  const [communityRows, acclaimedRaw, similarRaw, hotRows, popularRaw] = await Promise.all([
    db
      .select({ ...titleColumns, ...statColumns })
      .from(titleEntries)
      .innerJoin(titles, eq(titles.id, titleEntries.titleId))
      .where(and(eq(titleEntries.mediaType, type), inGenre))
      .groupBy(titles.id)
      .having(liked)
      .orderBy(desc(sql`(${PRIOR_WEIGHT} * ${mean}::numeric + sum(${titleEntries.score})) / (${PRIOR_WEIGHT} + ${n})`))
      .limit(PICKS + ranked.size),
    catalog.topInGenre(type, genreId).catch((): SearchResult[] => []),
    seed ? catalog.similar(type, seed.title.tmdbId).catch((): SearchResult[] => []) : Promise.resolve([]),
    db
      .select({ ...titleColumns, ...statColumns, heat: heatColumn })
      .from(titleEntries)
      .innerJoin(titles, eq(titles.id, titleEntries.titleId))
      .where(and(eq(titleEntries.mediaType, type), inGenre))
      .groupBy(titles.id)
      .having(sql`count(*) filter (where ${isRecent}) > 0`),
    catalog.popularInGenre(type, genreId).catch((): SearchResult[] => []),
  ]);

  const community = unseen(communityRows.map((r) => toResult(r, stats(r)))).slice(0, PICKS);
  const acclaimed = unseen(acclaimedRaw).slice(0, PICKS);
  const similarInGenre = unseen(similarRaw).filter((t) => t.genreIds.includes(genreId));
  const similar = (similarInGenre.length >= 6 ? similarInGenre : unseen(similarRaw)).slice(0, 12);

  const hot = unseen(
    hotRows
      .map((r) => ({ r, score: r.heat * (0.5 + bayes(r.sumScore, r.totalLogs, mean) / 10) }))
      .sort((a, b) => b.score - a.score)
      .map(({ r }) => toResult(r, stats(r))),
  ).slice(0, PICKS);
  const hotIds = new Set(hot.map((t) => t.tmdbId));
  const popular = unseen(popularRaw)
    .filter((t) => !hotIds.has(t.tmdbId))
    .slice(0, Math.max(0, PICKS - hot.length));

  const annotate = await statsFor(type, [...acclaimed, ...similar, ...popular].map((t) => t.tmdbId));
  const withStats = (list: SearchResult[]): DiscoverResult[] =>
    list.map((t) => ({ ...t, community: annotate.get(t.tmdbId) ?? null }));

  return {
    genre,
    trending: [...hot, ...withStats(popular)],
    forYou: [],
    community,
    becauseYouLoved: seed && similar.length ? { title: seed.title, score: seed.score, results: withStats(similar) } : null,
    acclaimed: withStats(acclaimed),
    yourTop,
  };
}
