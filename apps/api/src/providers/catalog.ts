import {
  genresFor,
  MEDIA_TYPES,
  type Episode,
  type MediaType,
  type Region,
  type SearchResult,
  type Title,
  type WatchProvider,
  type WatchProviders,
} from "@encore/shared";
import { env } from "../env";
import { openLibraryCatalog } from "./openlibrary";
import { seedCatalog } from "./seed-catalog";
import { tmdbCatalog } from "./tmdb";

export interface CatalogProvider {
  kind: "live" | "demo";
  /** Stored on cached titles so switching providers (demo → TMDB) refreshes them. */
  source: "tmdb" | "demo" | "openlibrary";
  search(type: MediaType, query: string): Promise<SearchResult[]>;
  trending(type: MediaType): Promise<SearchResult[]>;
  /** Critically acclaimed titles in a genre, best first. */
  topInGenre(type: MediaType, genreId: number): Promise<SearchResult[]>;
  /** What's popular in a genre right now, most popular first. */
  popularInGenre(type: MediaType, genreId: number): Promise<SearchResult[]>;
  /** Titles similar to the given one ("because you loved…"). */
  similar(type: MediaType, tmdbId: number): Promise<SearchResult[]>;
  details(type: MediaType, tmdbId: number): Promise<Title | null>;
  /** Watch options for every country that has data, keyed by ISO country code. */
  watchProviders(type: MediaType, tmdbId: number): Promise<Record<string, WatchProviders>>;
  /** Countries that have streaming data. */
  regions(): Promise<Region[]>;
  /** Streaming services available in a country (movies and TV combined), most popular first. */
  streamingServices(country: string): Promise<WatchProvider[]>;
  season(tvId: number, season: number): Promise<Episode[]>;
  /** Throws if credentials are rejected. */
  verify(): Promise<void>;
}

/** Movies and TV: TMDB, or the demo catalog without a key. */
const screenCatalog: CatalogProvider = env.tmdbApiKey || env.tmdbReadToken ? tmdbCatalog : seedCatalog;

/** Which provider serves a media type: Open Library for books, the screen catalog for the rest. */
export const providerFor = (type: MediaType): CatalogProvider => (type === "book" ? openLibraryCatalog : screenCatalog);

/**
 * One catalog for every media type. `kind` and `source` describe the movie and TV
 * provider (books are always live); use providerFor(type).source per title.
 */
export const catalog: CatalogProvider = {
  kind: screenCatalog.kind,
  source: screenCatalog.source,
  verify: () => screenCatalog.verify(),
  search: (type, query) => providerFor(type).search(type, query),
  trending: (type) => providerFor(type).trending(type),
  topInGenre: (type, genreId) => providerFor(type).topInGenre(type, genreId),
  popularInGenre: (type, genreId) => providerFor(type).popularInGenre(type, genreId),
  similar: (type, tmdbId) => providerFor(type).similar(type, tmdbId),
  details: (type, tmdbId) => providerFor(type).details(type, tmdbId),
  watchProviders: (type, tmdbId) => providerFor(type).watchProviders(type, tmdbId),
  regions: () => screenCatalog.regions(),
  streamingServices: (country) => screenCatalog.streamingServices(country),
  season: (tvId, season) => screenCatalog.season(tvId, season),
};

export async function checkCatalog() {
  if (catalog.kind === "demo") {
    console.warn(
      "[catalog] No TMDB credentials — serving the built-in demo catalog (46 titles). Set TMDB_API_KEY or TMDB_READ_TOKEN in apps/api/.env for every movie and show.",
    );
    return;
  }
  try {
    await catalog.verify();
    console.log("[catalog] TMDB connected — full movie & TV catalog enabled");
  } catch (err) {
    const message = (err as Error).message;
    if (/HTTP 401/.test(message)) {
      console.error("[catalog] TMDB credentials rejected (401). Check TMDB_API_KEY / TMDB_READ_TOKEN in apps/api/.env.");
      return;
    }
    // Network trouble isn't fatal: cached lists still serve, live calls retry on demand.
    console.warn(`[catalog] TMDB unreachable right now (${message}); serving from cache until it responds.`);
  }
  await warmCatalog();
}

/**
 * Pre-loads the lists every visitor hits (weekly trending + each genre's acclaimed
 * chart) into the cache, a few requests at a time. Entries already fresh in the
 * persistent cache cost one DB read and no TMDB call.
 */
async function warmCatalog() {
  const started = Date.now();
  const jobs: (() => Promise<unknown>)[] = [];
  for (const type of MEDIA_TYPES) {
    jobs.push(() => catalog.trending(type));
    // Book genre lists load on first visit instead, to go easy on Open Library.
    if (type === "book") continue;
    for (const g of genresFor(type)) jobs.push(() => catalog.topInGenre(type, g.id));
  }
  let failed = 0;
  const worker = async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) await job().catch(() => failed++);
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  console.log(`[catalog] cache warm in ${Date.now() - started}ms${failed ? ` (${failed} lists failed)` : ""}`);
}
