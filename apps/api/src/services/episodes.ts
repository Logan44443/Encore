import {
  scoreList,
  type CreateEpisodeEntryInput,
  type EpisodeEntry,
  type EpisodeEntryResult,
  type EpisodeRankCandidate,
  type RerankEpisodeEntryInput,
  type Tier,
} from "@encore/shared";
import { and, asc, desc, eq, gt, ne, sql, type SQL } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db, type DB } from "../db/client";
import { episodeEntries, titles } from "../db/schema";
import { catalog } from "../providers/catalog";
import { getTitle } from "./titles";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Executor = DB | Tx;

/** One ranked list: every episode of one show in one tier, across all its seasons. */
interface ListKey {
  userId: string;
  titleId: number;
  tier: Tier;
}

const GAP = 1024;
const MIN_GAP = 1e-6;

const tierOrder = sql`CASE ${episodeEntries.tier} WHEN 'liked' THEN 0 WHEN 'fine' THEN 1 ELSE 2 END`;

function inList(key: ListKey, excludeId?: string): SQL {
  return and(
    eq(episodeEntries.userId, key.userId),
    eq(episodeEntries.titleId, key.titleId),
    eq(episodeEntries.tier, key.tier),
    excludeId ? ne(episodeEntries.id, excludeId) : undefined,
  )!;
}

/** Fractional index for a new slot directly below `aboveEntryId` (null = top). */
async function positionFor(tx: Executor, key: ListKey, aboveEntryId: string | null, excludeId?: string): Promise<number> {
  if (aboveEntryId === null) {
    const [first] = await tx
      .select({ position: episodeEntries.position })
      .from(episodeEntries)
      .where(inList(key, excludeId))
      .orderBy(asc(episodeEntries.position))
      .limit(1);
    return first ? first.position - GAP : 0;
  }

  const [above] = await tx
    .select({ position: episodeEntries.position })
    .from(episodeEntries)
    .where(and(inList(key, excludeId), eq(episodeEntries.id, aboveEntryId)));
  if (!above) throw new HTTPException(409, { message: "Ranking list changed — please compare again" });

  const [next] = await tx
    .select({ position: episodeEntries.position })
    .from(episodeEntries)
    .where(and(inList(key, excludeId), gt(episodeEntries.position, above.position)))
    .orderBy(asc(episodeEntries.position))
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
    UPDATE episode_entries AS e SET position = s.rn * ${GAP}
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY position) AS rn FROM episode_entries
      WHERE user_id = ${key.userId} AND title_id = ${key.titleId} AND tier = ${key.tier}
    ) AS s
    WHERE e.id = s.id`);
}

/** Rescore one episode list with `scoreList` from @encore/shared, in one UPDATE. */
async function recomputeScores(tx: Executor, key: ListKey) {
  const rows = await tx
    .select({ id: episodeEntries.id })
    .from(episodeEntries)
    .where(inList(key))
    .orderBy(asc(episodeEntries.position));
  if (rows.length === 0) return;
  const scores = scoreList(key.tier, rows.map(() => null));
  const values = sql.join(
    rows.map((r, i) => sql`(${r.id}::uuid, ${scores[i]}::real)`),
    sql`, `,
  );
  await tx.execute(sql`
    UPDATE episode_entries AS e SET score = v.score
    FROM (VALUES ${values}) AS v(id, score)
    WHERE e.id = v.id`);
}

const columns = {
  id: episodeEntries.id,
  seasonNumber: episodeEntries.seasonNumber,
  episodeNumber: episodeEntries.episodeNumber,
  name: episodeEntries.name,
  stillUrl: episodeEntries.stillUrl,
  tier: episodeEntries.tier,
  score: episodeEntries.score,
  createdAt: episodeEntries.createdAt,
  tmdbId: titles.tmdbId,
  showName: titles.name,
  posterUrl: titles.posterUrl,
};

type EpisodeRow = {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  stillUrl: string | null;
  tier: Tier;
  score: number;
  createdAt: Date;
  tmdbId: number;
  showName: string;
  posterUrl: string | null;
};

function toEpisodeEntry(r: EpisodeRow): EpisodeEntry {
  return { ...r, createdAt: r.createdAt.toISOString() };
}

export function selectEpisodes(tx: Executor) {
  return tx.select(columns).from(episodeEntries).innerJoin(titles, eq(titles.id, episodeEntries.titleId));
}

async function getEpisodeOrThrow(tx: Executor, userId: string, id: string): Promise<EpisodeEntry> {
  const [row] = await selectEpisodes(tx).where(and(eq(episodeEntries.id, id), eq(episodeEntries.userId, userId)));
  if (!row) throw new HTTPException(404, { message: "Episode ranking not found" });
  return toEpisodeEntry(row);
}

async function withRank(tx: Executor, userId: string, titleId: number, entry: EpisodeEntry): Promise<EpisodeEntryResult> {
  const ids = await tx
    .select({ id: episodeEntries.id })
    .from(episodeEntries)
    .where(and(eq(episodeEntries.userId, userId), eq(episodeEntries.titleId, titleId)))
    .orderBy(tierOrder, asc(episodeEntries.position));
  return { entry, rank: ids.findIndex((r) => r.id === entry.id) + 1, outOf: ids.length };
}

/** Your ranked episodes, best first: of one show, or of every show when tmdbId is left out. */
export async function listEpisodeEntries(userId: string, tmdbId?: number): Promise<EpisodeEntry[]> {
  const rows = await selectEpisodes(db)
    .where(
      and(
        eq(episodeEntries.userId, userId),
        eq(titles.mediaType, "tv"),
        tmdbId !== undefined ? eq(titles.tmdbId, tmdbId) : undefined,
      ),
    )
    .orderBy(desc(episodeEntries.score), tierOrder, asc(episodeEntries.position));
  return rows.map(toEpisodeEntry);
}

export async function episodeCandidates(
  userId: string,
  tmdbId: number,
  tier: Tier,
  excludeEntryId?: string,
): Promise<EpisodeRankCandidate[]> {
  const rows = await selectEpisodes(db)
    .where(
      and(
        eq(episodeEntries.userId, userId),
        eq(titles.tmdbId, tmdbId),
        eq(titles.mediaType, "tv"),
        eq(episodeEntries.tier, tier),
        excludeEntryId ? ne(episodeEntries.id, excludeEntryId) : undefined,
      ),
    )
    .orderBy(asc(episodeEntries.position));
  return rows.map((r) => ({
    entryId: r.id,
    seasonNumber: r.seasonNumber,
    episodeNumber: r.episodeNumber,
    name: r.name,
    score: r.score,
  }));
}

export async function createEpisodeEntry(userId: string, input: CreateEpisodeEntryInput): Promise<EpisodeEntryResult> {
  const title = await getTitle("tv", input.tmdbId);
  if (!title.seasons.some((s) => s.seasonNumber === input.seasonNumber)) {
    throw new HTTPException(400, { message: "That season isn't part of this show" });
  }
  const episodes = await catalog.season(input.tmdbId, input.seasonNumber);
  const episode = episodes.find((e) => e.episode === input.episodeNumber);
  if (!episode) throw new HTTPException(400, { message: "That episode isn't part of this season" });
  const key: ListKey = { userId, titleId: title.id, tier: input.tier };

  return db.transaction(async (tx) => {
    const [dupe] = await tx
      .select({ id: episodeEntries.id })
      .from(episodeEntries)
      .where(
        and(
          eq(episodeEntries.userId, userId),
          eq(episodeEntries.titleId, title.id),
          eq(episodeEntries.seasonNumber, input.seasonNumber),
          eq(episodeEntries.episodeNumber, input.episodeNumber),
        ),
      );
    if (dupe) throw new HTTPException(409, { message: "You've already ranked this episode — re-rank it instead" });

    const position = await positionFor(tx, key, input.aboveEntryId);
    const [inserted] = await tx
      .insert(episodeEntries)
      .values({
        userId,
        titleId: title.id,
        seasonNumber: input.seasonNumber,
        episodeNumber: input.episodeNumber,
        name: episode.name || `Episode ${input.episodeNumber}`,
        stillUrl: episode.stillUrl,
        tier: input.tier,
        position,
        score: 0,
      })
      .returning({ id: episodeEntries.id });
    await recomputeScores(tx, key);
    return withRank(tx, userId, title.id, await getEpisodeOrThrow(tx, userId, inserted.id));
  });
}

export async function rerankEpisodeEntry(userId: string, id: string, input: RerankEpisodeEntryInput): Promise<EpisodeEntryResult> {
  if (input.aboveEntryId === id) throw new HTTPException(400, { message: "An episode can't sit above itself" });
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ titleId: episodeEntries.titleId, tier: episodeEntries.tier })
      .from(episodeEntries)
      .where(and(eq(episodeEntries.id, id), eq(episodeEntries.userId, userId)));
    if (!current) throw new HTTPException(404, { message: "Episode ranking not found" });

    const oldKey: ListKey = { userId, titleId: current.titleId, tier: current.tier };
    const newKey: ListKey = { ...oldKey, tier: input.tier };
    const position = await positionFor(tx, newKey, input.aboveEntryId, id);
    await tx.update(episodeEntries).set({ tier: newKey.tier, position }).where(eq(episodeEntries.id, id));
    await recomputeScores(tx, newKey);
    if (oldKey.tier !== newKey.tier) await recomputeScores(tx, oldKey);
    return withRank(tx, userId, current.titleId, await getEpisodeOrThrow(tx, userId, id));
  });
}

export async function deleteEpisodeEntry(userId: string, id: string) {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ titleId: episodeEntries.titleId, tier: episodeEntries.tier })
      .from(episodeEntries)
      .where(and(eq(episodeEntries.id, id), eq(episodeEntries.userId, userId)));
    if (!current) throw new HTTPException(404, { message: "Episode ranking not found" });
    await tx.delete(episodeEntries).where(eq(episodeEntries.id, id));
    await recomputeScores(tx, { userId, titleId: current.titleId, tier: current.tier });
  });
}
