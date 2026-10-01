import { createLiveShowSchema, type LiveShow, type updateLiveShowSchema } from "@encore/shared";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
import { db, type DB } from "../db/client";
import { liveShowPerformers, liveShows, liveShowSongs, performers, venues } from "../db/schema";
import { performerImage } from "../providers/deezer";
import { confirmTag, resolveCompanions, tagOnShow, withShowCompanions, writeCompanions } from "./companions";
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
      // Performers are shared by every user, so a client may only fill in a missing
      // photo; it can never rename the artist or replace a photo someone else sees.
      .onConflictDoUpdate({
        target: performers.mbid,
        set: { imageUrl: sql`coalesce(${performers.imageUrl}, excluded.image_url)` },
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
    // Venues are shared too: the first import wins and later requests only fill gaps,
    // so one user can't move or rename a venue on everyone else's shows.
    const [row] = await tx
      .insert(venues)
      .values({ setlistFmId: v.setlistFmId, ...values })
      .onConflictDoUpdate({
        target: venues.setlistFmId,
        set: {
          city: sql`coalesce(${venues.city}, excluded.city)`,
          region: sql`coalesce(${venues.region}, excluded.region)`,
          country: sql`coalesce(${venues.country}, excluded.country)`,
          lat: sql`coalesce(${venues.lat}, excluded.lat)`,
          lng: sql`coalesce(${venues.lng}, excluded.lng)`,
        },
      })
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

/** A show with its "watched with" list, as its owner sees it. */
export async function getOwnLiveShow(id: string, userId: string): Promise<LiveShow> {
  const [show] = await withShowCompanions([await getLiveShow(id, userId)], userId, userId);
  return show;
}

export async function createLiveShow(userId: string, input: CreateShow): Promise<LiveShow> {
  const companions = input.companions ? await resolveCompanions(userId, input.companions) : null;
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
  if (companions) await writeCompanions(userId, { showId: id }, companions);
  return getOwnLiveShow(id, userId);
}

export async function updateLiveShow(userId: string, id: string, input: UpdateShow): Promise<LiveShow> {
  await getLiveShow(id, userId);
  const { lineup, venue, companions: companionInput, ...fields } = input;
  const companions = companionInput ? await resolveCompanions(userId, companionInput) : null;
  const resolvedLineup = lineup ? await withImages(lineup) : undefined;
  await db.transaction(async (tx) => {
    const changes: Record<string, unknown> = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    );
    if (venue !== undefined) changes.venueId = venue ? await upsertVenue(tx, venue) : null;
    if (Object.keys(changes).length > 0) await tx.update(liveShows).set(changes).where(eq(liveShows.id, id));
    if (resolvedLineup) await clearSeenLive(tx, userId, await replaceLineup(tx, id, resolvedLineup), null);
  });
  if (companions) await writeCompanions(userId, { showId: id }, companions);
  return getOwnLiveShow(id, userId);
}

/**
 * "Add to my log" for a friend's show you were tagged in: copies the date, venue,
 * lineup and setlist (not their rating, reactions or notes) into a show of your
 * own, tagged with them, and confirms their tag of you.
 */
export async function copyLiveShow(userId: string, showId: string): Promise<LiveShow> {
  const tag = await tagOnShow(showId, userId);
  if (!tag) throw new HTTPException(404, { message: "Show not found" });
  const source = await getLiveShow(showId);
  const ownerId = tag.ownerId;

  // Already copied (or logged and tagged them back): return that one.
  const mine = await db.query.liveShows.findMany({ where: and(eq(liveShows.userId, userId), eq(liveShows.date, source.date)), columns: { id: true } });
  if (mine.length) {
    const tagged = await Promise.all(mine.map((s) => tagOnShow(s.id, ownerId)));
    const existing = mine.find((_, i) => tagged[i]);
    if (existing) {
      await confirmTag(userId, tag.id);
      return getOwnLiveShow(existing.id, userId);
    }
  }

  const input = createLiveShowSchema.parse({
    kind: source.kind,
    name: source.name,
    date: source.date,
    venue: source.venue,
    tourName: source.tourName,
    setlistFmId: source.setlistFmId,
    lineup: source.lineup.map((slot) => ({
      role: slot.role,
      performer: slot.performer,
      songs: slot.songs.map((song) => ({ title: song.title, encore: song.encore })),
    })),
  });
  const show = await createLiveShow(userId, input);
  await writeCompanions(userId, { showId: show.id }, { friendIds: [ownerId], names: [] });
  await confirmTag(userId, tag.id);
  return getOwnLiveShow(show.id, userId);
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
