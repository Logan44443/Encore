import {
  genreName,
  genresFor,
  TIER_RANGES,
  type CreateEntryInput,
  type Entry,
  type EntryResult,
  type MediaType,
  type RankCandidate,
  type RerankEntryInput,
  type Tier,
  type UpdateEntryInput,
} from "@encore/shared";
import { and, asc, desc, eq, gt, ne, sql, type SQL } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db, type DB } from "../db/client";
import { titleEntries, titles } from "../db/schema";
import { getTitle, toTitleSummary } from "./titles";
import { clearWatchedTitle } from "./watchlist-sync";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Executor = DB | Tx;

interface ListKey {
  userId: string;
  mediaType: MediaType;
  genreId: number;
  tier: Tier;
}

const GAP = 1024;
const MIN_GAP = 1e-6;

const tierOrder = sql`CASE ${titleEntries.tier} WHEN 'liked' THEN 0 WHEN 'fine' THEN 1 ELSE 2 END`;

function inList(key: ListKey, excludeId?: string): SQL {
  return and(
    eq(titleEntries.userId, key.userId),
    eq(titleEntries.mediaType, key.mediaType),
    eq(titleEntries.genreId, key.genreId),
    eq(titleEntries.tier, key.tier),
    excludeId ? ne(titleEntries.id, excludeId) : undefined,
  )!;
}

function assertGenre(mediaType: MediaType, genreId: number) {
  if (!genresFor(mediaType).some((g) => g.id === genreId)) {
    throw new HTTPException(400, { message: "Unknown genre for this media type" });
  }
}

/** Fractional index for a new slot directly below `aboveEntryId` (null = top). */
async function positionFor(tx: Executor, key: ListKey, aboveEntryId: string | null, excludeId?: string): Promise<number> {
  if (aboveEntryId === null) {
    const [first] = await tx
      .select({ position: titleEntries.position })
      .from(titleEntries)
      .where(inList(key, excludeId))
      .orderBy(asc(titleEntries.position))
      .limit(1);
    return first ? first.position - GAP : 0;
  }

  const [above] = await tx
    .select({ position: titleEntries.position })
    .from(titleEntries)
    .where(and(inList(key, excludeId), eq(titleEntries.id, aboveEntryId)));
  if (!above) throw new HTTPException(409, { message: "Ranking list changed — please compare again" });

  const [next] = await tx
    .select({ position: titleEntries.position })
    .from(titleEntries)
    .where(and(inList(key, excludeId), gt(titleEntries.position, above.position)))
    .orderBy(asc(titleEntries.position))
    .limit(1);
  if (!next) return above.position + GAP;
  if (next.position - above.position < MIN_GAP) {
    await renormalize(tx, key);
    return positionFor(tx, key, aboveEntryId, excludeId);
  }
  return (above.position + next.position) / 2;
}

async function renormalize(tx: Executor, key: ListKey) {
  await tx.execute(sql`
    UPDATE title_entries AS e SET position = s.rn * ${GAP}
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY position) AS rn FROM title_entries
      WHERE user_id = ${key.userId} AND media_type = ${key.mediaType} AND genre_id = ${key.genreId} AND tier = ${key.tier}
    ) AS s
    WHERE e.id = s.id`);
}

/** Single-statement rescore of one list; mirrors `scoreFor` in @encore/shared. */
async function recomputeScores(tx: Executor, key: ListKey) {
  const { min, max } = TIER_RANGES[key.tier];
  await tx.execute(sql`
    UPDATE title_entries AS e
    SET score = ROUND((${min}::numeric + (${max}::numeric - ${min}::numeric) * (s.n - s.idx) / s.n), 1)
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY position) - 1 AS idx, COUNT(*) OVER () AS n FROM title_entries
      WHERE user_id = ${key.userId} AND media_type = ${key.mediaType} AND genre_id = ${key.genreId} AND tier = ${key.tier}
    ) AS s
    WHERE e.id = s.id`);
}

const entryColumns = {
  id: titleEntries.id,
  tier: titleEntries.tier,
  genreId: titleEntries.genreId,
  score: titleEntries.score,
  review: titleEntries.review,
  favoriteEpisode: titleEntries.favoriteEpisode,
  leastFavoriteEpisode: titleEntries.leastFavoriteEpisode,
  watchedAt: titleEntries.watchedAt,
  createdAt: titleEntries.createdAt,
  tmdbId: titles.tmdbId,
  mediaType: titles.mediaType,
  name: titles.name,
  year: titles.year,
  posterUrl: titles.posterUrl,
};

type EntryRow = Awaited<ReturnType<typeof selectEntries>>[number];

function toEntry(r: EntryRow): Entry {
  return {
    id: r.id,
    title: toTitleSummary(r),
    tier: r.tier,
    genreId: r.genreId,
    genreName: genreName(r.mediaType, r.genreId),
    score: r.score,
    review: r.review,
    favoriteEpisode: r.favoriteEpisode ?? null,
    leastFavoriteEpisode: r.leastFavoriteEpisode ?? null,
    watchedAt: r.watchedAt,
    createdAt: r.createdAt.toISOString(),
  };
}

function selectEntries(tx: Executor) {
  return tx.select(entryColumns).from(titleEntries).innerJoin(titles, eq(titles.id, titleEntries.titleId));
}

async function getEntryOrThrow(tx: Executor, userId: string, id: string): Promise<Entry> {
  const [row] = await selectEntries(tx).where(and(eq(titleEntries.id, id), eq(titleEntries.userId, userId)));
  if (!row) throw new HTTPException(404, { message: "Entry not found" });
  return toEntry(row);
}

async function withRank(tx: Executor, userId: string, entry: Entry): Promise<EntryResult> {
  const ids = await tx
    .select({ id: titleEntries.id })
    .from(titleEntries)
    .where(
      and(
        eq(titleEntries.userId, userId),
        eq(titleEntries.mediaType, entry.title.mediaType),
        eq(titleEntries.genreId, entry.genreId),
      ),
    )
    .orderBy(tierOrder, asc(titleEntries.position));
  return { entry, rank: ids.findIndex((r) => r.id === entry.id) + 1, outOf: ids.length };
}

export async function listEntries(userId: string, filter: { mediaType?: MediaType; genreId?: number; limit?: number }) {
  const rows = await selectEntries(db)
    .where(
      and(
        eq(titleEntries.userId, userId),
        filter.mediaType ? eq(titleEntries.mediaType, filter.mediaType) : undefined,
        filter.genreId !== undefined ? eq(titleEntries.genreId, filter.genreId) : undefined,
      ),
    )
    .orderBy(desc(titleEntries.score), tierOrder, asc(titleEntries.position))
    .limit(filter.limit ?? 1000);
  return rows.map(toEntry);
}

export async function findEntryForTitle(userId: string, mediaType: MediaType, tmdbId: number): Promise<Entry | null> {
  const [row] = await selectEntries(db).where(
    and(eq(titleEntries.userId, userId), eq(titles.mediaType, mediaType), eq(titles.tmdbId, tmdbId)),
  );
  return row ? toEntry(row) : null;
}

export async function rankCandidates(key: ListKey, excludeEntryId?: string): Promise<RankCandidate[]> {
  const rows = await selectEntries(db)
    .where(inList(key, excludeEntryId))
    .orderBy(asc(titleEntries.position));
  return rows.map((r) => ({ entryId: r.id, title: toTitleSummary(r), score: r.score }));
}

export async function createEntry(userId: string, input: CreateEntryInput): Promise<EntryResult> {
  assertGenre(input.mediaType, input.genreId);
  const title = await getTitle(input.mediaType, input.tmdbId);
  const key: ListKey = { userId, mediaType: input.mediaType, genreId: input.genreId, tier: input.tier };

  return db.transaction(async (tx) => {
    const [dupe] = await tx
      .select({ id: titleEntries.id })
      .from(titleEntries)
      .where(and(eq(titleEntries.userId, userId), eq(titleEntries.titleId, title.id)));
    if (dupe) throw new HTTPException(409, { message: "You've already ranked this — re-rank it instead" });

    const position = await positionFor(tx, key, input.aboveEntryId);
    const [inserted] = await tx
      .insert(titleEntries)
      .values({
        userId,
        titleId: title.id,
        mediaType: input.mediaType,
        genreId: input.genreId,
        tier: input.tier,
        position,
        score: 0,
        review: input.review ?? null,
        favoriteEpisode: input.mediaType === "tv" ? (input.favoriteEpisode ?? null) : null,
        leastFavoriteEpisode: input.mediaType === "tv" ? (input.leastFavoriteEpisode ?? null) : null,
        watchedAt: input.watchedAt ?? null,
      })
      .returning({ id: titleEntries.id });
    await recomputeScores(tx, key);
    await clearWatchedTitle(tx, userId, title.id);
    return withRank(tx, userId, await getEntryOrThrow(tx, userId, inserted.id));
  });
}

export async function rerankEntry(userId: string, id: string, input: RerankEntryInput): Promise<EntryResult> {
  if (input.aboveEntryId === id) throw new HTTPException(400, { message: "An entry can't sit above itself" });
  return db.transaction(async (tx) => {
    const current = await getEntryOrThrow(tx, userId, id);
    assertGenre(current.title.mediaType, input.genreId);
    const oldKey: ListKey = { userId, mediaType: current.title.mediaType, genreId: current.genreId, tier: current.tier };
    const newKey: ListKey = { ...oldKey, genreId: input.genreId, tier: input.tier };

    const position = await positionFor(tx, newKey, input.aboveEntryId, id);
    await tx
      .update(titleEntries)
      .set({ genreId: newKey.genreId, tier: newKey.tier, position })
      .where(eq(titleEntries.id, id));
    await recomputeScores(tx, newKey);
    if (oldKey.genreId !== newKey.genreId || oldKey.tier !== newKey.tier) await recomputeScores(tx, oldKey);
    return withRank(tx, userId, await getEntryOrThrow(tx, userId, id));
  });
}

export async function updateEntry(userId: string, id: string, input: UpdateEntryInput): Promise<Entry> {
  const current = await getEntryOrThrow(db, userId, id);
  const isTv = current.title.mediaType === "tv";
  const changes = Object.fromEntries(
    Object.entries({
      review: input.review,
      watchedAt: input.watchedAt,
      favoriteEpisode: isTv ? input.favoriteEpisode : undefined,
      leastFavoriteEpisode: isTv ? input.leastFavoriteEpisode : undefined,
    }).filter(([, v]) => v !== undefined),
  );
  if (Object.keys(changes).length === 0) return current;
  await db.update(titleEntries).set(changes).where(eq(titleEntries.id, id));
  return getEntryOrThrow(db, userId, id);
}

export async function deleteEntry(userId: string, id: string) {
  await db.transaction(async (tx) => {
    const current = await getEntryOrThrow(tx, userId, id);
    await tx.delete(titleEntries).where(eq(titleEntries.id, id));
    await recomputeScores(tx, { userId, mediaType: current.title.mediaType, genreId: current.genreId, tier: current.tier });
  });
}
