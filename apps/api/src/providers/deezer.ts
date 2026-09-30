import type { Performer } from "@encore/shared";
import { DAY } from "../lib/cache";
import { swr } from "../lib/swr-cache";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "");

const hasPhoto = (url: string | undefined) => (url && !url.includes("/artist//") ? url : null);

/** Keyless artist search, used when MusicBrainz is unavailable. */
export function searchDeezerArtists(query: string): Promise<Performer[]> {
  const key = normalize(query);
  return swr(`deezer:search:${key}`, { fresh: DAY, stale: 7 * DAY }, async () => {
    const res = await fetch(`https://api.deezer.com/search/artist?limit=10&q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Deezer ${res.status}`);
    const data = (await res.json()) as { data?: { name: string; picture_xl?: string; picture_big?: string }[] };
    return (data.data ?? []).map((a) => ({
      mbid: null,
      name: a.name,
      disambiguation: null,
      country: null,
      type: null,
      imageUrl: hasPhoto(a.picture_xl ?? a.picture_big),
    }));
  });
}

/**
 * Artist photo from Deezer's public (keyless) API. Only accepts an exact
 * normalised name match so we never attach the wrong face to a performer.
 */
export function performerImage(name: string): Promise<string | null> {
  const key = normalize(name);
  if (!key) return Promise.resolve(null);
  // Network failures throw (and aren't cached); "no photo" is a real answer and is.
  return swr(`deezer:artist:${key}`, { fresh: 7 * DAY, stale: 30 * DAY }, async () => {
    const res = await fetch(`https://api.deezer.com/search/artist?limit=5&q=${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) throw new Error(`Deezer ${res.status}`);
    const data = (await res.json()) as { data?: { name: string; picture_xl?: string; picture_big?: string }[] };
    const hit = data.data?.find((a) => normalize(a.name) === key);
    // Deezer serves a generic silhouette for artists without a photo.
    return hasPhoto(hit?.picture_xl ?? hit?.picture_big);
  }).catch(() => null);
}
