import type { Companion, CompanionInput, Entry, LiveShow, PendingTag } from "@encore/shared";
import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { friendships, liveShows, titleEntries, titles, users, venues, watchCompanions } from "../db/schema";
import { toPublicUser } from "../lib/users";
import { toTitleSummary } from "./titles";

/** A "watched with" list after validation: friends to tag and private names. */
export interface ResolvedCompanions {
  friendIds: string[];
  names: string[];
}

export type CompanionTarget = { entryId: string } | { showId: string };

/**
 * Checks a "watched with" list before anything is saved: friends must be your
 * friends and allow tags. Names are kept as typed (deduplicated ignoring case).
 */
export async function resolveCompanions(ownerId: string, inputs: CompanionInput[]): Promise<ResolvedCompanions> {
  const friendIds = [...new Set(inputs.flatMap((c) => ("userId" in c ? [c.userId] : [])))];
  const seen = new Set<string>();
  const names = inputs.flatMap((c) => {
    if (!("name" in c)) return [];
    const name = c.name.trim();
    const key = name.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [name];
  });
  if (friendIds.length) {
    const rows = await db
      .select({ id: users.id, displayName: users.displayName, allowTags: users.allowTags })
      .from(friendships)
      .innerJoin(users, eq(users.id, friendships.friendId))
      .where(and(eq(friendships.userId, ownerId), inArray(friendships.friendId, friendIds)));
    if (rows.length !== friendIds.length) {
      throw new HTTPException(400, { message: "You can only tag your friends. Add other people by name." });
    }
    const closed = rows.find((r) => !r.allowTags);
    if (closed) throw new HTTPException(400, { message: `${closed.displayName} doesn't allow tags. Add them by name instead.` });
  }
  return { friendIds, names };
}

const targetColumn = (t: CompanionTarget) =>
  "entryId" in t ? eq(watchCompanions.titleEntryId, t.entryId) : eq(watchCompanions.liveShowId, t.showId);

/**
 * Replaces the "watched with" list on one entry or show. Friends already tagged
 * keep their confirmed state; new ones start unconfirmed until they say yes,
 * unless they already tagged you on their own log of the same thing.
 */
export async function writeCompanions(ownerId: string, target: CompanionTarget, list: ResolvedCompanions) {
  const ref = "entryId" in target ? { titleEntryId: target.entryId } : { liveShowId: target.showId };
  const existing = await db
    .select({ id: watchCompanions.id, friendId: watchCompanions.friendId })
    .from(watchCompanions)
    .where(targetColumn(target));
  const keep = new Set(list.friendIds);
  const had = new Set(existing.flatMap((r) => (r.friendId ? [r.friendId] : [])));
  const drop = existing.filter((r) => !r.friendId || !keep.has(r.friendId)).map((r) => r.id);
  const added = list.friendIds.filter((id) => !had.has(id));

  await db.transaction(async (tx) => {
    if (drop.length) await tx.delete(watchCompanions).where(inArray(watchCompanions.id, drop));
    const rows = [
      ...added.map((friendId) => ({ ownerId, ...ref, friendId })),
      ...list.names.map((name) => ({ ownerId, ...ref, name })),
    ];
    if (rows.length) await tx.insert(watchCompanions).values(rows);
  });
  for (const friendId of added) await confirmIfMutual(ownerId, friendId, target);
}

/**
 * When both people logged the same title (or a show on the same day) and tagged
 * each other, neither needs to confirm: both tags become confirmed.
 */
async function confirmIfMutual(ownerId: string, friendId: string, target: CompanionTarget) {
  let theirTarget: CompanionTarget | null = null;
  if ("entryId" in target) {
    const mine = await db.query.titleEntries.findFirst({ where: eq(titleEntries.id, target.entryId), columns: { titleId: true } });
    if (!mine) return;
    const theirs = await db.query.titleEntries.findFirst({
      where: and(eq(titleEntries.userId, friendId), eq(titleEntries.titleId, mine.titleId)),
      columns: { id: true },
    });
    if (theirs) theirTarget = { entryId: theirs.id };
  } else {
    const mine = await db.query.liveShows.findFirst({ where: eq(liveShows.id, target.showId), columns: { date: true } });
    if (!mine) return;
    const back = await db
      .select({ showId: liveShows.id })
      .from(liveShows)
      .innerJoin(watchCompanions, eq(watchCompanions.liveShowId, liveShows.id))
      .where(and(eq(liveShows.userId, friendId), eq(liveShows.date, mine.date), eq(watchCompanions.friendId, ownerId)))
      .limit(1);
    if (back[0]) theirTarget = { showId: back[0].showId };
  }
  if (!theirTarget) return;
  const [backTag] = await db
    .select({ id: watchCompanions.id })
    .from(watchCompanions)
    .where(and(targetColumn(theirTarget), eq(watchCompanions.friendId, ownerId)));
  if (!backTag) return;
  await db
    .update(watchCompanions)
    .set({ confirmed: true })
    .where(or(eq(watchCompanions.id, backTag.id), and(targetColumn(target), eq(watchCompanions.friendId, friendId))));
}

/**
 * "Watched with" lists for entries or shows, as `viewerId` may see them. Owners
 * see everything. Anyone else sees only friends who confirmed, plus a tag of
 * themselves; private names are never shown.
 */
async function companionsFor(kind: "entry" | "show", ids: string[], viewerId: string, ownerId: string) {
  const byTarget = new Map<string, Companion[]>();
  if (!ids.length) return byTarget;
  const column = kind === "entry" ? watchCompanions.titleEntryId : watchCompanions.liveShowId;
  const isOwner = viewerId === ownerId;
  const rows = await db
    .select({
      id: watchCompanions.id,
      target: column,
      name: watchCompanions.name,
      confirmed: watchCompanions.confirmed,
      user: { id: users.id, username: users.username, displayName: users.displayName },
    })
    .from(watchCompanions)
    .leftJoin(users, eq(users.id, watchCompanions.friendId))
    .where(
      and(
        inArray(column, ids),
        isOwner ? undefined : and(isNotNull(watchCompanions.friendId), or(eq(watchCompanions.confirmed, true), eq(watchCompanions.friendId, viewerId))),
      ),
    )
    .orderBy(watchCompanions.createdAt);
  for (const r of rows) {
    if (!r.target) continue;
    const list = byTarget.get(r.target) ?? [];
    list.push({ id: r.id, user: r.user?.id ? toPublicUser(r.user) : null, name: r.name, confirmed: r.confirmed });
    byTarget.set(r.target, list);
  }
  return byTarget;
}

export async function withEntryCompanions(entries: Entry[], viewerId: string, ownerId: string): Promise<Entry[]> {
  const map = await companionsFor("entry", entries.map((e) => e.id), viewerId, ownerId);
  return entries.map((e) => ({ ...e, companions: map.get(e.id) ?? [] }));
}

export async function withShowCompanions(shows: LiveShow[], viewerId: string, ownerId: string): Promise<LiveShow[]> {
  const map = await companionsFor("show", shows.map((s) => s.id), viewerId, ownerId);
  return shows.map((s) => ({ ...s, companions: map.get(s.id) ?? [] }));
}

const owners = alias(users, "owners");

/** Tags from friends waiting for `userId` to confirm, newest first. */
export async function pendingTags(userId: string): Promise<PendingTag[]> {
  const rows = await db
    .select({
      id: watchCompanions.id,
      createdAt: watchCompanions.createdAt,
      by: { id: owners.id, username: owners.username, displayName: owners.displayName },
      watchedAt: titleEntries.watchedAt,
      title: { tmdbId: titles.tmdbId, mediaType: titles.mediaType, name: titles.name, year: titles.year, posterUrl: titles.posterUrl },
      show: { id: liveShows.id, name: liveShows.name, date: liveShows.date, kind: liveShows.kind },
      venue: venues.name,
    })
    .from(watchCompanions)
    .innerJoin(owners, eq(owners.id, watchCompanions.ownerId))
    .leftJoin(titleEntries, eq(titleEntries.id, watchCompanions.titleEntryId))
    .leftJoin(titles, eq(titles.id, titleEntries.titleId))
    .leftJoin(liveShows, eq(liveShows.id, watchCompanions.liveShowId))
    .leftJoin(venues, eq(venues.id, liveShows.venueId))
    .where(and(eq(watchCompanions.friendId, userId), eq(watchCompanions.confirmed, false)))
    .orderBy(desc(watchCompanions.createdAt))
    .limit(100);
  const showNames = await headlinerNames(rows.flatMap((r) => (r.show?.id && !r.show.name ? [r.show.id] : [])));
  return rows.map((r) => ({
    id: r.id,
    by: toPublicUser(r.by),
    title: r.title?.tmdbId ? toTitleSummary(r.title) : null,
    show: r.show?.id
      ? { id: r.show.id, name: r.show.name ?? showNames.get(r.show.id) ?? "Live show", date: r.show.date, venue: r.venue }
      : null,
    date: r.show?.id ? r.show.date : (r.watchedAt ?? null),
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Headliner name per show, for shows logged without a name of their own. */
async function headlinerNames(showIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!showIds.length) return out;
  const shows = await db.query.liveShows.findMany({
    where: inArray(liveShows.id, showIds),
    columns: { id: true },
    with: { lineup: { with: { performer: { columns: { name: true } } } } },
  });
  for (const s of shows) {
    const slot = s.lineup.find((l) => l.role === "headliner") ?? s.lineup[0];
    if (slot) out.set(s.id, slot.performer.name);
  }
  return out;
}

export async function confirmTag(userId: string, id: string) {
  const rows = await db
    .update(watchCompanions)
    .set({ confirmed: true })
    .where(and(eq(watchCompanions.id, id), eq(watchCompanions.friendId, userId)))
    .returning({ id: watchCompanions.id });
  if (!rows.length) throw new HTTPException(404, { message: "Tag not found" });
}

/** The owner can remove anyone from their list; a tagged friend can remove themselves. */
export async function removeTag(userId: string, id: string) {
  await db
    .delete(watchCompanions)
    .where(and(eq(watchCompanions.id, id), or(eq(watchCompanions.ownerId, userId), eq(watchCompanions.friendId, userId))));
}

/** The tag of `friendId` on someone's show, if there is one. */
export async function tagOnShow(showId: string, friendId: string) {
  return db.query.watchCompanions.findFirst({
    where: and(eq(watchCompanions.liveShowId, showId), eq(watchCompanions.friendId, friendId)),
  });
}

/** Removes every tag between two people, both ways (used when one blocks the other). */
export async function removeTagsBetween(a: string, b: string) {
  await db
    .delete(watchCompanions)
    .where(
      or(
        and(eq(watchCompanions.ownerId, a), eq(watchCompanions.friendId, b)),
        and(eq(watchCompanions.ownerId, b), eq(watchCompanions.friendId, a)),
      ),
    );
}
