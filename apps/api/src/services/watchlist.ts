import type { addWatchlistSchema, MediaType, updateWatchlistSchema, WatchlistItem, WatchlistKind } from "@encore/shared";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
import { db } from "../db/client";
import { performers, titles, watchlistItems } from "../db/schema";
import { performerImage } from "../providers/deezer";
import { upsertPerformer } from "./live";
import { getTitle, toTitleSummary } from "./titles";

type AddInput = z.output<typeof addWatchlistSchema>;
type UpdateInput = z.output<typeof updateWatchlistSchema>;

type Row = typeof watchlistItems.$inferSelect & {
  title: typeof titles.$inferSelect | null;
  performer: typeof performers.$inferSelect | null;
};

function toItem(r: Row): WatchlistItem {
  return {
    id: r.id,
    kind: r.kind,
    note: r.note,
    title: r.title ? toTitleSummary(r.title) : null,
    performer: r.performer
      ? {
          mbid: r.performer.mbid,
          name: r.performer.name,
          disambiguation: r.performer.disambiguation,
          country: r.performer.country,
          type: r.performer.type,
          imageUrl: r.performer.imageUrl,
        }
      : null,
    festival: r.festivalName
      ? { name: r.festivalName, date: r.festivalDate, city: r.festivalCity, country: r.festivalCountry }
      : null,
    createdAt: r.createdAt.toISOString(),
  };
}

async function load(userId: string, where: SQL): Promise<WatchlistItem | null> {
  const row = await db.query.watchlistItems.findFirst({
    where: and(eq(watchlistItems.userId, userId), where),
    with: { title: true, performer: true },
  });
  return row ? toItem(row) : null;
}

export async function listWatchlist(userId: string, kind?: WatchlistKind): Promise<WatchlistItem[]> {
  const rows = await db.query.watchlistItems.findMany({
    where: and(eq(watchlistItems.userId, userId), kind ? eq(watchlistItems.kind, kind) : undefined),
    with: { title: true, performer: true },
    orderBy: [desc(watchlistItems.createdAt)],
  });
  return rows.map(toItem);
}

/** Adds an item, or returns the existing one if it's already on the list. */
export async function addToWatchlist(userId: string, input: AddInput): Promise<WatchlistItem> {
  if (input.kind === "movie" || input.kind === "tv") {
    const title = await getTitle(input.kind as MediaType, input.tmdbId);
    await db
      .insert(watchlistItems)
      .values({ userId, kind: input.kind, titleId: title.id, note: input.note ?? null })
      .onConflictDoNothing();
    return (await load(userId, eq(watchlistItems.titleId, title.id)))!;
  }

  if (input.kind === "performer") {
    const performer = input.performer.imageUrl
      ? input.performer
      : { ...input.performer, imageUrl: await performerImage(input.performer.name) };
    const performerId = await upsertPerformer(db, performer);
    await db
      .insert(watchlistItems)
      .values({ userId, kind: "performer", performerId, note: input.note ?? null })
      .onConflictDoNothing();
    return (await load(userId, eq(watchlistItems.performerId, performerId)))!;
  }

  await db
    .insert(watchlistItems)
    .values({
      userId,
      kind: "festival",
      festivalName: input.name,
      festivalDate: input.date ?? null,
      festivalCity: input.city ?? null,
      festivalCountry: input.country ?? null,
      note: input.note ?? null,
    })
    .onConflictDoNothing();
  return (await load(userId, sql`lower(${watchlistItems.festivalName}) = lower(${input.name})`))!;
}

export async function updateWatchlistItem(userId: string, id: string, input: UpdateInput): Promise<WatchlistItem> {
  const current = await load(userId, eq(watchlistItems.id, id));
  if (!current) throw new HTTPException(404, { message: "Watchlist item not found" });
  const changes = Object.fromEntries(
    Object.entries({
      note: input.note,
      ...(current.kind === "festival"
        ? { festivalName: input.name, festivalDate: input.date, festivalCity: input.city, festivalCountry: input.country }
        : {}),
    }).filter(([, v]) => v !== undefined),
  );
  if (Object.keys(changes).length > 0) {
    await db.update(watchlistItems).set(changes).where(eq(watchlistItems.id, id));
  }
  return (await load(userId, eq(watchlistItems.id, id)))!;
}

export async function removeFromWatchlist(userId: string, id: string) {
  const deleted = await db
    .delete(watchlistItems)
    .where(and(eq(watchlistItems.id, id), eq(watchlistItems.userId, userId)))
    .returning({ id: watchlistItems.id });
  if (deleted.length === 0) throw new HTTPException(404, { message: "Watchlist item not found" });
}

export async function watchlistItemIdForTitle(userId: string, titleId: number): Promise<string | null> {
  const [row] = await db
    .select({ id: watchlistItems.id })
    .from(watchlistItems)
    .where(and(eq(watchlistItems.userId, userId), eq(watchlistItems.titleId, titleId)));
  return row?.id ?? null;
}
