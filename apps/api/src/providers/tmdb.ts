import type { Episode, Genre, MediaType, Region, SearchResult, Title, WatchProvider, WatchProviders } from "@encore/shared";
import { HTTPException } from "hono/http-exception";
import { env } from "../env";
import { DAY, HOUR } from "../lib/cache";
import { swr, type Freshness } from "../lib/swr-cache";
import type { CatalogProvider } from "./catalog";

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

/** How long each kind of TMDB response is served from cache (see lib/swr-cache). */
const SEARCH: Freshness = { fresh: HOUR, stale: DAY };
const POPULAR: Freshness = { fresh: 3 * HOUR, stale: 3 * DAY };
const CATALOG: Freshness = { fresh: DAY, stale: 14 * DAY };

async function tmdb<T>(path: string, params: Record<string, string> = {}, freshness = CATALOG): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const cacheKey = `tmdb:${url.pathname}${url.search}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (env.tmdbReadToken) headers.Authorization = `Bearer ${env.tmdbReadToken}`;
  else if (env.tmdbApiKey) url.searchParams.set("api_key", env.tmdbApiKey);

  return swr<T>(cacheKey, freshness, async () => {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    if (res.status === 404) throw new HTTPException(404, { message: "Title not found" });
    if (!res.ok) throw new HTTPException(502, { message: `TMDB error ${res.status}` });
    return (await res.json()) as T;
  });
}

const img = (path: string | null | undefined, size: string) => (path ? `${IMG}/${size}${path}` : null);
const yearOf = (d: string | null | undefined) => (d ? Number(d.slice(0, 4)) || null : null);

interface TmdbListItem {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
  genre_ids?: number[];
  media_type?: string;
  vote_average?: number;
}

interface TmdbProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority: number;
}

interface TmdbWatchCountry {
  link?: string;
  flatrate?: TmdbProvider[];
  free?: TmdbProvider[];
  ads?: TmdbProvider[];
  rent?: TmdbProvider[];
  buy?: TmdbProvider[];
}

function toProviders(list: TmdbProvider[] | undefined): WatchProvider[] {
  const seen = new Set<number>();
  return [...(list ?? [])]
    .sort((a, b) => a.display_priority - b.display_priority)
    .filter((p) => !seen.has(p.provider_id) && seen.add(p.provider_id))
    .map((p) => ({ id: p.provider_id, name: p.provider_name, logoUrl: img(p.logo_path, "w92") }));
}

function toSearchResult(type: MediaType, r: TmdbListItem): SearchResult {
  return {
    tmdbId: r.id,
    mediaType: type,
    name: r.title ?? r.name ?? "Untitled",
    year: yearOf(r.release_date ?? r.first_air_date),
    posterUrl: img(r.poster_path, "w342"),
    overview: r.overview ?? "",
    genreIds: r.genre_ids ?? [],
    voteAverage: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
  };
}

/** Minimum vote counts so obscure titles with a handful of 10/10s don't top genre charts. */
const MIN_VOTES: Record<MediaType, string> = { movie: "1500", tv: "300" };
/** Lower bar for "popular now" so new releases qualify, but still skips unreleased/empty pages. */
const POPULAR_MIN_VOTES: Record<MediaType, string> = { movie: "100", tv: "50" };

export const tmdbCatalog: CatalogProvider = {
  kind: "live",
  source: "tmdb",

  async verify() {
    const url = new URL(BASE + "/configuration");
    const headers: Record<string, string> = { Accept: "application/json" };
    if (env.tmdbReadToken) headers.Authorization = `Bearer ${env.tmdbReadToken}`;
    else if (env.tmdbApiKey) url.searchParams.set("api_key", env.tmdbApiKey);
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  },

  async topInGenre(type, genreId) {
    const pages = await Promise.all(
      ["1", "2"].map((page) =>
        tmdb<{ results: TmdbListItem[] }>(
          `/discover/${type}`,
          {
            with_genres: String(genreId),
            sort_by: "vote_average.desc",
            "vote_count.gte": MIN_VOTES[type],
            include_adult: "false",
            page,
          },
          CATALOG,
        ),
      ),
    );
    return pages.flatMap((p) => p.results).map((r) => toSearchResult(type, r));
  },

  async popularInGenre(type, genreId) {
    const data = await tmdb<{ results: TmdbListItem[] }>(
      `/discover/${type}`,
      {
        with_genres: String(genreId),
        sort_by: "popularity.desc",
        "vote_count.gte": POPULAR_MIN_VOTES[type],
        include_adult: "false",
      },
      CATALOG,
    );
    return data.results.map((r) => toSearchResult(type, r));
  },

  async similar(type, tmdbId) {
    const data = await tmdb<{ results: TmdbListItem[] }>(`/${type}/${tmdbId}/recommendations`, {}, CATALOG);
    return data.results.map((r) => toSearchResult(type, r));
  },

  async search(type, query) {
    const data = await tmdb<{ results: TmdbListItem[] }>(
      `/search/${type}`,
      { query, include_adult: "false" },
      SEARCH,
    );
    return data.results.map((r) => toSearchResult(type, r));
  },

  async trending(type) {
    const data = await tmdb<{ results: TmdbListItem[] }>(`/trending/${type}/week`, {}, POPULAR);
    return data.results.map((r) => toSearchResult(type, r));
  },

  async details(type, tmdbId) {
    const d = await tmdb<
      TmdbListItem & {
        backdrop_path?: string | null;
        genres: Genre[];
        seasons?: { season_number: number; name: string; episode_count: number }[];
      }
    >(`/${type}/${tmdbId}`);
    return {
      ...toSearchResult(type, d),
      backdropUrl: img(d.backdrop_path, "w1280"),
      genres: d.genres.map((g) => ({ id: g.id, name: g.name })),
      seasons: (d.seasons ?? [])
        .filter((s) => s.episode_count > 0)
        .map((s) => ({ seasonNumber: s.season_number, name: s.name, episodeCount: s.episode_count })),
    } satisfies Title;
  },

  async watchProviders(type, tmdbId) {
    const d = await tmdb<{ results: Record<string, TmdbWatchCountry> }>(`/${type}/${tmdbId}/watch/providers`, {}, POPULAR);
    const out: Record<string, WatchProviders> = {};
    for (const [country, r] of Object.entries(d.results ?? {})) {
      out[country] = {
        country,
        link: r.link ?? null,
        stream: toProviders(r.flatrate),
        free: toProviders([...(r.free ?? []), ...(r.ads ?? [])]),
        rent: toProviders(r.rent),
        buy: toProviders(r.buy),
      };
    }
    return out;
  },

  async regions() {
    const d = await tmdb<{ results: { iso_3166_1: string; english_name: string }[] }>(
      "/watch/providers/regions",
      { language: "en-US" },
      CATALOG,
    );
    return d.results
      .map((r): Region => ({ code: r.iso_3166_1, name: r.english_name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async streamingServices(country) {
    type Row = TmdbProvider & { display_priorities?: Record<string, number> };
    const lists = await Promise.all(
      (["movie", "tv"] as const).map((type) =>
        tmdb<{ results: Row[] }>(`/watch/providers/${type}`, { watch_region: country, language: "en-US" }, CATALOG),
      ),
    );
    // Order by the country's own ranking (Netflix before niche services), falling back to the global one.
    const rows = lists
      .flatMap((l) => l.results ?? [])
      .map((r) => ({ ...r, display_priority: r.display_priorities?.[country] ?? r.display_priority }));
    return toProviders(rows);
  },

  async season(tvId, season) {
    const d = await tmdb<{
      episodes: { season_number: number; episode_number: number; name: string; air_date: string | null; still_path: string | null }[];
    }>(`/tv/${tvId}/season/${season}`);
    return d.episodes.map(
      (e): Episode => ({
        season: e.season_number,
        episode: e.episode_number,
        name: e.name,
        airDate: e.air_date,
        stillUrl: img(e.still_path, "w300"),
      }),
    );
  },
};
