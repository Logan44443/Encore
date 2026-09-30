import type { createLiveShowSchema, LiveShow, updateLiveShowSchema } from "@encore/shared";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
import { db, type DB } from "../db/client";
import { liveShowPerformers, liveShows, liveShowSongs, performers, venues } from "../db/schema";
import { performerImage } from "../providers/deezer";
import { clearSeenLive } from "./watchlist-sync";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type CreateShow = z.output<typeof createLiveShowSchema>;
type UpdateShow = z.output<typeof updateLiveShowSchema>;
type Slot = CreateShow["lineup"][number];
type VenueInput = NonNullable<CreateShow["venue"]>;

const withRelations = {
  venue: true as const,
  lineup: {
    orderBy: [asc(liveShowPerformers.position)],
    with: {
      performer: true as const,
      songs: { orderBy: [asc(liveShowSongs.position)] },
    },
  },
};

type ShowRow = typeof liveShows.$inferSelect & {
  venue: typeof venues.$inferSelect | null;
  lineup: (typeof liveShowPerformers.$inferSelect & {
    performer: typeof performers.$inferSelect;
    songs: (typeof liveShowSongs.$inferSelect)[];
  })[];
};

function toLiveShow(r: ShowRow): LiveShow {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    date: r.date,
    venue: r.venue
      ? {
          name: r.venue.name,
          city: r.venue.city,
          region: r.venue.region,
          country: r.venue.country,
          lat: r.venue.lat,
          lng: r.venue.lng,
        }
      : null,
    tourName: r.tourName,
    setlistFmId: r.setlistFmId,
    rating: r.rating,
    liked: r.liked,
    disliked: r.disliked,
    notes: r.notes,
    lineup: r.lineup.map((slot) => ({
      role: slot.role,
      performer: {
        mbid: slot.performer.mbid,
        name: slot.performer.name,
        disambiguation: slot.performer.disambiguation,
        country: slot.performer.country,
        type: slot.performer.type,
        imageUrl: slot.performer.imageUrl,
      },
      songs: slot.songs.map((s) => ({
        position: s.position,
        title: s.title,
        encore: s.encore,
        reaction: s.reaction,
        note: s.note,
      })),
    })),
    createdAt: r.createdAt.toISOString(),
  };
}

/** Fills in missing performer photos before the write transaction (no network inside a tx). */
async function withImages(lineup: Slot[]): Promise<Slot[]> {
  return Promise.all(
    lineup.map(async (slot) =>
      slot.performer.imageUrl
        ? slot
        : { ...slot, performer: { ...slot.performer, imageUrl: await performerImage(slot.performer.name) } },
    ),
  );
}

export async function upsertPerformer(tx: Tx | DB, p: Slot["performer"]): Promise<number> {
  const values = {
    name: p.name,
    disambiguation: p.disambiguation ?? null,
    country: p.country ?? null,
    type: p.type ?? null,
    imageUrl: p.imageUrl ?? null,
  };
  if (p.mbid) {
    const [row] = await tx
      .insert(performers)
      .values({ mbid: p.mbid, ...values })
      .onConflictDoUpdate({
        target: performers.mbid,
        set: { name: p.name, imageUrl: sql`coalesce(excluded.image_url, ${performers.imageUrl})` },
      })
      .returning({ id: performers.id });
    return row.id;
  }
  const [existing] = await tx
    .select({ id: performers.id })
    .from(performers)
    .where(and(isNull(performers.mbid), sql`lower(${performers.name}) = lower(${p.name})`));
  if (existing) return existing.id;
  const [row] = await tx.insert(performers).values(values).returning({ id: performers.id });
  return row.id;
}

async function upsertVenue(tx: Tx, v: VenueInput): Promise<number> {
  const values = {
    name: v.name,
    city: v.city ?? null,
    region: v.region ?? null,
    country: v.country ?? null,
    lat: v.lat ?? null,
    lng: v.lng ?? null,
  };
  if (v.setlistFmId) {
    const [row] = await tx
      .insert(venues)
      .values({ setlistFmId: v.setlistFmId, ...values })
      .onConflictDoUpdate({ target: venues.setlistFmId, set: values })
      .returning({ id: venues.id });
    return row.id;
  }
  const [existing] = await tx
    .select({ id: venues.id })
    .from(venues)
    .where(
      and(
        sql`lower(${venues.name}) = lower(${v.name})`,
        sql`lower(coalesce(${venues.city}, '')) = lower(${v.city ?? ""})`,
      ),
    );
  if (existing) return existing.id;
  const [row] = await tx.insert(venues).values(values).returning({ id: venues.id });
  return row.id;
}

async function replaceLineup(tx: Tx, showId: string, lineup: Slot[]): Promise<number[]> {
  await tx.delete(liveShowPerformers).where(eq(liveShowPerformers.showId, showId));
  const hasHeadliner = lineup.some((s) => s.role === "headliner");
  const performerIds: number[] = [];
  for (const [i, slot] of lineup.entries()) {
    const performerId = await upsertPerformer(tx, slot.performer);
    performerIds.push(performerId);
    const [row] = await tx
      .insert(liveShowPerformers)
      .values({ showId, performerId, role: !hasHeadliner && i === 0 ? "headliner" : slot.role, position: i + 1 })
      .returning({ id: liveShowPerformers.id });
    if (slot.songs.length > 0) {
      await tx.insert(liveShowSongs).values(
        slot.songs.map((s, j) => ({
          slotId: row.id,
          position: j + 1,
          title: s.title,
          encore: s.encore,
          reaction: s.reaction,
          note: s.note ?? null,
        })),
      );
    }
  }
  return performerIds;
}

export async function getLiveShow(id: string, userId?: string): Promise<LiveShow> {
  const row = await db.query.liveShows.findFirst({
    where: userId ? and(eq(liveShows.id, id), eq(liveShows.userId, userId)) : eq(liveShows.id, id),
    with: withRelations,
  });
  if (!row) throw new HTTPException(404, { message: "Show not found" });
  return toLiveShow(row as ShowRow);
}

export async function listLiveShows(userId: string, limit = 500): Promise<LiveShow[]> {
  const rows = await db.query.liveShows.findMany({
    where: eq(liveShows.userId, userId),
    with: withRelations,
    orderBy: (s, { desc }) => [desc(s.date), desc(s.createdAt)],
    limit,
  });
  return (rows as ShowRow[]).map(toLiveShow);
}

export async function createLiveShow(userId: string, input: CreateShow): Promise<LiveShow> {
  const lineup = await withImages(input.lineup);
  const id = await db.transaction(async (tx) => {
    const venueId = input.venue ? await upsertVenue(tx, input.venue) : null;
    const [row] = await tx
      .insert(liveShows)
      .values({
        userId,
        kind: input.kind,
        name: input.name ?? null,
        date: input.date,
        venueId,
        tourName: input.tourName ?? null,
        setlistFmId: input.setlistFmId ?? null,
        rating: input.rating ?? null,
        liked: input.liked ?? null,
        disliked: input.disliked ?? null,
        notes: input.notes ?? null,
      })
      .returning({ id: liveShows.id });
    const performerIds = await replaceLineup(tx, row.id, lineup);
    await clearSeenLive(tx, userId, performerIds, input.kind === "festival" ? (input.name ?? null) : null);
    return row.id;
  });
  return getLiveShow(id);
}

export async function updateLiveShow(userId: string, id: string, input: UpdateShow): Promise<LiveShow> {
  await getLiveShow(id, userId);
  const { lineup, venue, ...fields } = input;
  const resolvedLineup = lineup ? await withImages(lineup) : undefined;
  await db.transaction(async (tx) => {
    const changes: Record<string, unknown> = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    );
    if (venue !== undefined) changes.venueId = venue ? await upsertVenue(tx, venue) : null;
    if (Object.keys(changes).length > 0) await tx.update(liveShows).set(changes).where(eq(liveShows.id, id));
    if (resolvedLineup) await clearSeenLive(tx, userId, await replaceLineup(tx, id, resolvedLineup), null);
  });
  return getLiveShow(id);
}

export async function deleteLiveShow(userId: string, id: string) {
  const deleted = await db
    .delete(liveShows)
    .where(and(eq(liveShows.id, id), eq(liveShows.userId, userId)))
    .returning({ id: liveShows.id });
  if (deleted.length === 0) throw new HTTPException(404, { message: "Show not found" });
}

export async function liveStats(userId: string) {
  const [row] = await db
    .select({
      liveShows: sql<number>`count(distinct ${liveShows.id})`.mapWith(Number),
      performers: sql<number>`count(distinct ${liveShowPerformers.performerId})`.mapWith(Number),
      cities: sql<number>`count(distinct lower(${venues.city}))`.mapWith(Number),
    })
    .from(liveShows)
    .leftJoin(liveShowPerformers, eq(liveShowPerformers.showId, liveShows.id))
    .leftJoin(venues, eq(venues.id, liveShows.venueId))
    .where(eq(liveShows.userId, userId));
  return row;
}
