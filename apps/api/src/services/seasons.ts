import {
  scoreList,
  type CreateSeasonEntryInput,
  type RerankSeasonEntryInput,
  type SeasonEntry,
  type SeasonEntryResult,
  type SeasonRankCandidate,
  type SeasonSummary,
  type Tier,
} from "@encore/shared";
import { and, asc, desc, eq, gt, ne, sql, type SQL } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db, type DB } from "../db/client";
import { seasonEntries, titles } from "../db/schema";
import { getTitle } from "./titles";
import { clearWatchedTitle } from "./watchlist-sync";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Executor = DB | Tx;

interface ListKey {
  userId: string;
  titleId: number;
  tier: Tier;
}

const GAP = 1024;
const MIN_GAP = 1e-6;

const tierOrder = sql`CASE ${seasonEntries.tier} WHEN 'liked' THEN 0 WHEN 'fine' THEN 1 ELSE 2 END`;

function inList(key: ListKey, excludeId?: string): SQL {
  return and(
    eq(seasonEntries.userId, key.userId),
    eq(seasonEntries.titleId, key.titleId),
    eq(seasonEntries.tier, key.tier),
    excludeId ? ne(seasonEntries.id, excludeId) : undefined,
  )!;
}

function seasonMeta(seasons: SeasonSummary[], seasonNumber: number) {
  const match = seasons.find((s) => s.seasonNumber === seasonNumber);
  return {
    name: match?.name ?? (seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`),
    episodeCount: match?.episodeCount ?? 0,
  };
}

/** Fractional index for a new slot directly below `aboveEntryId` (null = top). */
async function positionFor(tx: Executor, key: ListKey, aboveEntryId: string | null, excludeId?: string): Promise<number> {
  if (aboveEntryId === null) {
    const [first] = await tx
      .select({ position: seasonEntries.position })
      .from(seasonEntries)
      .where(inList(key, excludeId))
      .orderBy(asc(seasonEntries.position))
      .limit(1);
    return first ? first.position - GAP : 0;
  }

  const [above] = await tx
    .select({ position: seasonEntries.position })
    .from(seasonEntries)
    .where(and(inList(key, excludeId), eq(seasonEntries.id, aboveEntryId)));
  if (!above) throw new HTTPException(409, { message: "Ranking list changed — please compare again" });

  const [next] = await tx
    .select({ position: seasonEntries.position })
    .from(seasonEntries)
    .where(and(inList(key, excludeId), gt(seasonEntries.position, above.position)))
    .orderBy(asc(seasonEntries.position))
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
    UPDATE season_entries AS e SET position = s.rn * ${GAP}
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY position) AS rn FROM season_entries
      WHERE user_id = ${key.userId} AND title_id = ${key.titleId} AND tier = ${key.tier}
    ) AS s
    WHERE e.id = s.id`);
}

/** Rescore one season list with `scoreList` from @encore/shared, in one UPDATE. */
async function recomputeScores(tx: Executor, key: ListKey) {
  const rows = await tx
    .select({ id: seasonEntries.id })
    .from(seasonEntries)
    .where(inList(key))
    .orderBy(asc(seasonEntries.position));
  if (rows.length === 0) return;
  const scores = scoreList(key.tier, rows.map(() => null));
  const values = sql.join(
    rows.map((r, i) => sql`(${r.id}::uuid, ${scores[i]}::real)`),
    sql`, `,
  );
  await tx.execute(sql`
    UPDATE season_entries AS e SET score = v.score
    FROM (VALUES ${values}) AS v(id, score)
    WHERE e.id = v.id`);
}

const columns = {
  id: seasonEntries.id,
  seasonNumber: seasonEntries.seasonNumber,
  tier: seasonEntries.tier,
  score: seasonEntries.score,
  createdAt: seasonEntries.createdAt,
  tmdbId: titles.tmdbId,
  showName: titles.name,
  seasons: titles.seasons,
};

type SeasonRow = {
  id: string;
  seasonNumber: number;
  tier: Tier;
  score: number;
  createdAt: Date;
  tmdbId: number;
  showName: string;
  seasons: SeasonSummary[];
};

function toSeasonEntry(r: SeasonRow): SeasonEntry {
  const meta = seasonMeta(r.seasons, r.seasonNumber);
  return {
    id: r.id,
    tmdbId: r.tmdbId,
    showName: r.showName,
    seasonNumber: r.seasonNumber,
    name: meta.name,
    episodeCount: meta.episodeCount,
    tier: r.tier,
    score: r.score,
    createdAt: r.createdAt.toISOString(),
  };
}

function selectSeasons(tx: Executor) {
  return tx.select(columns).from(seasonEntries).innerJoin(titles, eq(titles.id, seasonEntries.titleId));
}

async function getSeasonOrThrow(tx: Executor, userId: string, id: string): Promise<SeasonEntry> {
  const [row] = await selectSeasons(tx).where(and(eq(seasonEntries.id, id), eq(seasonEntries.userId, userId)));
  if (!row) throw new HTTPException(404, { message: "Season ranking not found" });
  return toSeasonEntry(row);
}

async function withRank(tx: Executor, userId: string, titleId: number, entry: SeasonEntry): Promise<SeasonEntryResult> {
  const ids = await tx
    .select({ id: seasonEntries.id })
    .from(seasonEntries)
    .where(and(eq(seasonEntries.userId, userId), eq(seasonEntries.titleId, titleId)))
    .orderBy(tierOrder, asc(seasonEntries.position));
  return { entry, rank: ids.findIndex((r) => r.id === entry.id) + 1, outOf: ids.length };
}

export async function listSeasonEntries(userId: string, tmdbId: number): Promise<SeasonEntry[]> {
  const rows = await selectSeasons(db)
    .where(and(eq(seasonEntries.userId, userId), eq(titles.tmdbId, tmdbId), eq(titles.mediaType, "tv")))
    .orderBy(desc(seasonEntries.score), tierOrder, asc(seasonEntries.position));
  return rows.map(toSeasonEntry);
}

export async function seasonCandidates(
  userId: string,
  tmdbId: number,
  tier: Tier,
  excludeEntryId?: string,
): Promise<SeasonRankCandidate[]> {
  const rows = await selectSeasons(db)
    .where(
      and(
        eq(seasonEntries.userId, userId),
        eq(titles.tmdbId, tmdbId),
        eq(titles.mediaType, "tv"),
        eq(seasonEntries.tier, tier),
        excludeEntryId ? ne(seasonEntries.id, excludeEntryId) : undefined,
      ),
    )
    .orderBy(asc(seasonEntries.position));
  return rows.map((r) => ({
    entryId: r.id,
    seasonNumber: r.seasonNumber,
    name: seasonMeta(r.seasons, r.seasonNumber).name,
    score: r.score,
  }));
}

export async function createSeasonEntry(userId: string, input: CreateSeasonEntryInput): Promise<SeasonEntryResult> {
  const title = await getTitle("tv", input.tmdbId);
  if (!title.seasons.some((s) => s.seasonNumber === input.seasonNumber)) {
    throw new HTTPException(400, { message: "That season isn't part of this show" });
  }
  const key: ListKey = { userId, titleId: title.id, tier: input.tier };

  return db.transaction(async (tx) => {
    const [dupe] = await tx
      .select({ id: seasonEntries.id })
      .from(seasonEntries)
      .where(
        and(
          eq(seasonEntries.userId, userId),
          eq(seasonEntries.titleId, title.id),
          eq(seasonEntries.seasonNumber, input.seasonNumber),
        ),
      );
    if (dupe) throw new HTTPException(409, { message: "You've already ranked this season — re-rank it instead" });

    const position = await positionFor(tx, key, input.aboveEntryId);
    const [inserted] = await tx
      .insert(seasonEntries)
      .values({
        userId,
        titleId: title.id,
        seasonNumber: input.seasonNumber,
        tier: input.tier,
        position,
        score: 0,
      })
      .returning({ id: seasonEntries.id });
    await recomputeScores(tx, key);
    await clearWatchedTitle(tx, userId, title.id);
    return withRank(tx, userId, title.id, await getSeasonOrThrow(tx, userId, inserted.id));
  });
}

export async function rerankSeasonEntry(userId: string, id: string, input: RerankSeasonEntryInput): Promise<SeasonEntryResult> {
  if (input.aboveEntryId === id) throw new HTTPException(400, { message: "A season can't sit above itself" });
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ titleId: seasonEntries.titleId, tier: seasonEntries.tier })
      .from(seasonEntries)
      .where(and(eq(seasonEntries.id, id), eq(seasonEntries.userId, userId)));
    if (!current) throw new HTTPException(404, { message: "Season ranking not found" });

    const oldKey: ListKey = { userId, titleId: current.titleId, tier: current.tier };
    const newKey: ListKey = { ...oldKey, tier: input.tier };
    const position = await positionFor(tx, newKey, input.aboveEntryId, id);
    await tx.update(seasonEntries).set({ tier: newKey.tier, position }).where(eq(seasonEntries.id, id));
    await recomputeScores(tx, newKey);
    if (oldKey.tier !== newKey.tier) await recomputeScores(tx, oldKey);
    return withRank(tx, userId, current.titleId, await getSeasonOrThrow(tx, userId, id));
  });
}

export async function deleteSeasonEntry(userId: string, id: string) {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ titleId: seasonEntries.titleId, tier: seasonEntries.tier })
      .from(seasonEntries)
      .where(and(eq(seasonEntries.id, id), eq(seasonEntries.userId, userId)));
    if (!current) throw new HTTPException(404, { message: "Season ranking not found" });
    await tx.delete(seasonEntries).where(eq(seasonEntries.id, id));
    await recomputeScores(tx, { userId, titleId: current.titleId, tier: current.tier });
  });
}
