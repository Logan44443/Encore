import { lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { cacheEntries } from "../db/schema";
import { DAY } from "./cache";

export interface Freshness {
  /** Serve without revalidating while younger than this. */
  fresh: number;
  /** Serve instantly (and refresh in the background) while younger than this. */
  stale: number;
}

interface Slot {
  value: unknown;
  fetchedAt: number;
}

const MAX_MEMORY_ENTRIES = 5000;
const memory = new Map<string, Slot>();
const inflight = new Map<string, Promise<unknown>>();

function remember(key: string, slot: Slot) {
  memory.delete(key);
  memory.set(key, slot);
  if (memory.size > MAX_MEMORY_ENTRIES) memory.delete(memory.keys().next().value!);
}

async function readPersisted(key: string): Promise<Slot | null> {
  try {
    const row = await db.query.cacheEntries.findFirst({ where: (c, { eq }) => eq(c.key, key) });
    return row ? { value: row.value, fetchedAt: row.fetchedAt.getTime() } : null;
  } catch {
    return null;
  }
}

async function persist(key: string, slot: Slot) {
  const fetchedAt = new Date(slot.fetchedAt);
  try {
    await db
      .insert(cacheEntries)
      .values({ key, value: slot.value as object, fetchedAt })
      .onConflictDoUpdate({ target: cacheEntries.key, set: { value: sql`excluded.value`, fetchedAt } });
  } catch (err) {
    console.warn(`[cache] could not persist ${key}: ${(err as Error).message}`);
  }
}

function refresh<T>(key: string, load: () => Promise<T>): Promise<T> {
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const promise = load()
    .then((value) => {
      const slot = { value, fetchedAt: Date.now() };
      remember(key, slot);
      void persist(key, slot);
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

/**
 * Stale-while-revalidate cache with two layers: in-process memory, then the
 * `cache_entries` table. Callers get a cached answer instantly whenever one
 * exists within `stale`; anything older than `fresh` is refreshed in the
 * background. Concurrent misses for the same key share one upstream request.
 */
export async function swr<T>(key: string, freshness: Freshness, load: () => Promise<T>): Promise<T> {
  let slot = memory.get(key);
  if (!slot) {
    const persisted = await readPersisted(key);
    if (persisted) {
      slot = persisted;
      remember(key, persisted);
    }
  }

  if (slot) {
    const age = Date.now() - slot.fetchedAt;
    if (age < freshness.fresh) return slot.value as T;
    if (age < freshness.stale) {
      refresh(key, load).catch((err) => console.warn(`[cache] background refresh failed for ${key}: ${err.message}`));
      return slot.value as T;
    }
  }
  return refresh(key, load);
}

/** Drops persisted entries nobody could still serve. */
export async function pruneCache(maxAge = 30 * DAY) {
  await db.delete(cacheEntries).where(lt(cacheEntries.fetchedAt, new Date(Date.now() - maxAge)));
}
