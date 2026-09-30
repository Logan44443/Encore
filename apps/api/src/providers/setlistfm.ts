import type { SetlistSummary } from "@encore/shared";
import { HTTPException } from "hono/http-exception";
import { env } from "../env";
import { DAY, HOUR } from "../lib/cache";
import { swr } from "../lib/swr-cache";

const BASE = "https://api.setlist.fm/rest/1.0";

export const setlistFmEnabled = Boolean(env.setlistFmApiKey);

interface FmSetlist {
  id: string;
  eventDate: string; // dd-MM-yyyy
  tour?: { name: string };
  venue?: {
    id?: string;
    name?: string;
    city?: {
      name?: string;
      state?: string;
      coords?: { lat?: number; long?: number };
      country?: { name?: string };
    };
  };
  sets?: { set?: { encore?: number; song?: { name: string; tape?: boolean }[] }[] };
}

const toIso = (d: string) => {
  const [dd, mm, yyyy] = d.split("-");
  return `${yyyy}-${mm}-${dd}`;
};
const toFm = (iso: string) => {
  const [yyyy, mm, dd] = iso.split("-");
  return `${dd}-${mm}-${yyyy}`;
};

function toSummary(s: FmSetlist): SetlistSummary {
  const v = s.venue;
  return {
    id: s.id,
    eventDate: toIso(s.eventDate),
    venue: v?.name
      ? {
          setlistFmId: v.id ?? null,
          name: v.name,
          city: v.city?.name ?? null,
          region: v.city?.state ?? null,
          country: v.city?.country?.name ?? null,
          lat: v.city?.coords?.lat ?? null,
          lng: v.city?.coords?.long ?? null,
        }
      : null,
    tourName: s.tour?.name ?? null,
    songs: (s.sets?.set ?? []).flatMap((set) =>
      (set.song ?? [])
        .filter((song) => song.name && !song.tape)
        .map((song) => ({ title: song.name, encore: Boolean(set.encore) })),
    ),
  };
}

/** Setlists for a performer, optionally narrowed to a specific date (YYYY-MM-DD). */
export async function performerSetlists(mbid: string, opts: { date?: string; page?: number }): Promise<SetlistSummary[]> {
  if (!env.setlistFmApiKey) return [];
  const url = new URL(`${BASE}/search/setlists`);
  url.searchParams.set("artistMbid", mbid);
  url.searchParams.set("p", String(opts.page ?? 1));
  if (opts.date) url.searchParams.set("date", toFm(opts.date));

  return swr(`setlistfm:${url.search}`, { fresh: 6 * HOUR, stale: 7 * DAY }, async () => {
    const res = await fetch(url, {
      headers: { "x-api-key": env.setlistFmApiKey!, Accept: "application/json" },
    });
    if (res.status === 404) return [];
    if (!res.ok) throw new HTTPException(502, { message: `setlist.fm error ${res.status}` });
    const data = (await res.json()) as { setlist?: FmSetlist[] };
    return (data.setlist ?? []).map(toSummary);
  });
}
