import {
  ROLLUP_RULE,
  averageScore,
  combineScores,
  genreName,
  genresFor,
  type Entry,
  type SeasonEntry,
  type SeasonScore,
  type ShowScore,
  type TvRankings,
} from "@encore/shared";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { titles } from "../db/schema";
import { listEpisodeEntries } from "./episodes";
import { findEntryForTitle, listEntries } from "./entries";
import { listSeasonEntries, seasonMeta } from "./seasons";
import { toTitleSummary, type TitleRow } from "./titles";

const byScore = <T extends { score: number }>(a: T, b: T) => b.score - a.score;

/** Whether the shown score is the direct ranking (true) or the roll-up from parts. */
function directWins(direct: number | null, rolledUp: number | null): boolean {
  return direct !== null && (ROLLUP_RULE !== "parts" || rolledUp === null);
}

/**
 * Your TV rankings at all three levels. Episode scores roll up into their
 * season, and season scores (not specials) into their show; a direct ranking
 * of a season or show combines with its roll-up per ROLLUP_RULE.
 */
export async function tvRankings(userId: string, tmdbId?: number): Promise<TvRankings> {
  const [showEntries, seasonEntries, episodes] = await Promise.all([
    tmdbId === undefined
      ? listEntries(userId, { mediaType: "tv" })
      : findEntryForTitle(userId, "tv", tmdbId).then((e) => (e ? [e] : [])),
    listSeasonEntries(userId, tmdbId),
    listEpisodeEntries(userId, tmdbId),
  ]);

  const tmdbIds = [...new Set([...showEntries.map((e) => e.title.tmdbId), ...seasonEntries.map((s) => s.tmdbId), ...episodes.map((e) => e.tmdbId)])];
  const titleRows: TitleRow[] =
    tmdbIds.length === 0
      ? []
      : await db.select().from(titles).where(and(eq(titles.mediaType, "tv"), inArray(titles.tmdbId, tmdbIds)));
  const titleBy = new Map(titleRows.map((t) => [t.tmdbId, t]));

  // Seasons: direct rankings plus every season that has ranked episodes.
  const seasonKey = (tmdb: number, n: number) => `${tmdb}:${n}`;
  const slots = new Map<string, { tmdbId: number; seasonNumber: number; entry: SeasonEntry | null; episodeScores: number[] }>();
  const slot = (tmdb: number, n: number) => {
    const key = seasonKey(tmdb, n);
    let s = slots.get(key);
    if (!s) slots.set(key, (s = { tmdbId: tmdb, seasonNumber: n, entry: null, episodeScores: [] }));
    return s;
  };
  for (const s of seasonEntries) slot(s.tmdbId, s.seasonNumber).entry = s;
  for (const e of episodes) slot(e.tmdbId, e.seasonNumber).episodeScores.push(e.score);

  const seasons: SeasonScore[] = [];
  for (const s of slots.values()) {
    const title = titleBy.get(s.tmdbId);
    if (!title) continue;
    const direct = s.entry?.score ?? null;
    const episodeAverage = averageScore(s.episodeScores);
    const score = combineScores(direct, episodeAverage);
    if (score === null) continue;
    const meta = seasonMeta(title.seasons, s.seasonNumber);
    seasons.push({
      tmdbId: s.tmdbId,
      showName: title.name,
      posterUrl: title.posterUrl,
      seasonNumber: s.seasonNumber,
      name: meta.name,
      episodeCount: meta.episodeCount,
      score,
      source: directWins(direct, episodeAverage) ? "ranked" : "episodes",
      entry: s.entry,
      episodeAverage,
      rankedEpisodes: s.episodeScores.length,
    });
  }
  seasons.sort(byScore);

  // Shows: direct rankings plus every show with a scored (non-special) season.
  const entryBy = new Map<number, Entry>(showEntries.map((e) => [e.title.tmdbId, e]));
  const shows: ShowScore[] = [];
  for (const tmdb of tmdbIds) {
    const title = titleBy.get(tmdb);
    if (!title) continue;
    const entry = entryBy.get(tmdb) ?? null;
    const seasonScores = seasons.filter((s) => s.tmdbId === tmdb && s.seasonNumber > 0).map((s) => s.score);
    const seasonAverage = averageScore(seasonScores);
    const score = combineScores(entry?.score ?? null, seasonAverage);
    if (score === null) continue;
    // Unranked shows have no genre picked, so use the first catalog genre Encore knows.
    const genre = title.genres.find((g) => genresFor("tv").some((k) => k.id === g.id));
    shows.push({
      title: entry?.title ?? toTitleSummary(title),
      genreId: entry?.genreId ?? genre?.id ?? -1,
      genreName: entry?.genreName ?? (genre ? genreName("tv", genre.id) : "Other"),
      score,
      source: directWins(entry?.score ?? null, seasonAverage) ? "ranked" : "seasons",
      entry,
      seasonAverage,
      rankedSeasons: seasonScores.length,
    });
  }
  shows.sort(byScore);

  return { shows, seasons, episodes };
}
