import type { Performer } from "@encore/shared";
import { HTTPException } from "hono/http-exception";
import { env } from "../env";
import { DAY } from "../lib/cache";
import { swr } from "../lib/swr-cache";
import { performerImage, searchDeezerArtists } from "./deezer";

const BASE = "https://musicbrainz.org/ws/2";

// MusicBrainz allows ~1 request/second per client; serialise outgoing calls.
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCall + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

interface MbArtist {
  id: string;
  name: string;
  disambiguation?: string;
  country?: string;
  type?: string;
}

/**
 * MusicBrainz first (canonical ids → setlist.fm import works). If it's down or
 * slow, fall back to Deezer so search still returns real artists with photos
 * (without MBIDs, so setlist import is skipped for those).
 */
export async function searchPerformers(query: string): Promise<Performer[]> {
  try {
    return await searchMusicBrainz(query);
  } catch (err) {
    console.warn(`[musicbrainz] search failed (${(err as Error).message}); falling back to Deezer`);
    try {
      return await searchDeezerArtists(query);
    } catch {
      throw new HTTPException(503, { message: "Artist search is unavailable right now — add the artist manually." });
    }
  }
}

function searchMusicBrainz(query: string): Promise<Performer[]> {
  const key = query.trim().toLowerCase();
  return swr(`mb:search:${key}`, { fresh: DAY, stale: 14 * DAY }, async () => {
    const artists = await throttled(async () => {
      const url = new URL(`${BASE}/artist`);
      url.searchParams.set("query", key);
      url.searchParams.set("limit", "10");
      url.searchParams.set("fmt", "json");
      const res = await fetch(url, {
        headers: { "User-Agent": env.musicBrainzUserAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new HTTPException(502, { message: `MusicBrainz error ${res.status}` });
      return ((await res.json()) as { artists: MbArtist[] }).artists;
    });
    // Photos only for the top hits — they're the ones people pick.
    const images = await Promise.all(artists.map((a, i) => (i < 5 ? performerImage(a.name) : null)));
    return artists.map((a, i) => ({
      mbid: a.id,
      name: a.name,
      disambiguation: a.disambiguation || null,
      country: a.country ?? null,
      type: a.type ?? null,
      imageUrl: images[i],
    }));
  });
}
