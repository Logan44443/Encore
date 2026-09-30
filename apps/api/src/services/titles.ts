import type { MediaType, Title, TitleSummary } from "@encore/shared";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { titles } from "../db/schema";
import { DAY } from "../lib/cache";
import { catalog } from "../providers/catalog";

export type TitleRow = typeof titles.$inferSelect;

const REFRESH_AFTER = 7 * DAY;

/**
 * Returns the title from our DB, refreshing from the catalog provider when stale,
 * missing, or produced by a different provider (e.g. demo data after a TMDB key is added).
 */
export async function getTitle(mediaType: MediaType, tmdbId: number): Promise<TitleRow> {
  const existing = await db.query.titles.findFirst({
    where: and(eq(titles.tmdbId, tmdbId), eq(titles.mediaType, mediaType)),
  });
  if (existing && existing.source === catalog.source && Date.now() - existing.fetchedAt.getTime() < REFRESH_AFTER) {
    return existing;
  }

  let fresh: Title | null;
  try {
    fresh = await catalog.details(mediaType, tmdbId);
  } catch (err) {
    if (existing) return existing;
    throw err;
  }
  if (!fresh) {
    if (existing) return existing;
    throw new HTTPException(404, { message: "Title not found" });
  }

  const values = {
    tmdbId,
    mediaType,
    name: fresh.name,
    year: fresh.year,
    overview: fresh.overview,
    posterUrl: fresh.posterUrl,
    backdropUrl: fresh.backdropUrl,
    genres: fresh.genres,
    seasons: fresh.seasons,
    source: catalog.source,
    fetchedAt: new Date(),
  };
  const [row] = await db
    .insert(titles)
    .values(values)
    .onConflictDoUpdate({ target: [titles.tmdbId, titles.mediaType], set: values })
    .returning();
  return row;
}

export function toTitleSummary(row: Pick<TitleRow, "tmdbId" | "mediaType" | "name" | "year" | "posterUrl">): TitleSummary {
  return { tmdbId: row.tmdbId, mediaType: row.mediaType, name: row.name, year: row.year, posterUrl: row.posterUrl };
}

export function toTitle(row: TitleRow): Title {
  return {
    ...toTitleSummary(row),
    overview: row.overview,
    backdropUrl: row.backdropUrl,
    genres: row.genres,
    seasons: row.seasons,
  };
}
