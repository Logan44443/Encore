import type { SearchResult, Title } from "@encore/shared";
import { HTTPException } from "hono/http-exception";
import { env } from "../env";
import { authorLine, bookGenres, coverUrl, workKey, workNumber } from "../lib/books";
import { DAY, HOUR } from "../lib/cache";
import { swr, type Freshness } from "../lib/swr-cache";
import type { CatalogProvider } from "./catalog";
import { googleBooksFill } from "./google-books";

/**
 * Books come from Open Library: free, no key. A book is an Open Library *work*
 * (all editions of one book), and its id is the number in the work key, so
 * "/works/OL45804W" is stored as 45804 in the `tmdbId` column every title shares.
 */
const BASE = "https://openlibrary.org";

const SEARCH: Freshness = { fresh: HOUR, stale: DAY };
const POPULAR: Freshness = { fresh: 6 * HOUR, stale: 3 * DAY };
const CATALOG: Freshness = { fresh: DAY, stale: 14 * DAY };

/** Fields asked of /search.json; anything else makes the response much bigger. */
const FIELDS = "key,title,author_name,author_key,first_publish_year,cover_i,subject,ratings_average,ratings_count,number_of_pages_median";

/**
 * Open Library asks apps to stay around 3 requests a second. Requests that miss
 * the cache wait for a slot, so a big Goodreads import can't flood it.
 */
const MIN_GAP_MS = 350;
let nextSlot = 0;
function slot(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_GAP_MS;
  return at > now ? new Promise((r) => setTimeout(r, at - now)) : Promise.resolve();
}

async function ol<T>(path: string, params: Record<string, string> = {}, freshness = CATALOG): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return swr<T>(`ol:${url.pathname}${url.search}`, freshness, async () => {
    await slot();
    // Open Library asks heavy users to identify themselves.
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": env.musicBrainzUserAgent },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) throw new HTTPException(404, { message: "Book not found" });
    if (!res.ok) throw new HTTPException(502, { message: `Open Library error ${res.status}` });
    return (await res.json()) as T;
  });
}

export interface OlDoc {
  key: string;
  title?: string;
  author_name?: string[];
  author_key?: string[];
  first_publish_year?: number;
  cover_i?: number;
  subject?: string[];
  ratings_average?: number;
  ratings_count?: number;
  number_of_pages_median?: number;
}

interface OlWork {
  key: string;
  title?: string;
  type?: { key: string };
  location?: string;
  description?: string | { value: string };
  covers?: number[];
  subjects?: string[];
  first_publish_date?: string;
  authors?: { author?: { key: string } }[];
}

/** The Open Library subject each genre's lists are drawn from. */
const GENRE_SUBJECT: Record<number, string> = {
  1001: "fiction",
  1002: "fantasy",
  1003: "science fiction",
  1004: "mystery",
  1005: "romance",
  1006: "horror",
  1007: "historical fiction",
  1008: "young adult fiction",
  1009: "juvenile fiction",
  1010: "classic literature",
  1011: "graphic novels",
  1012: "poetry",
  1013: "biography",
  1014: "history",
  1015: "science",
  1016: "self-help",
  1017: "business",
  1018: "philosophy",
  1019: "nonfiction",
};

/** Ratings are 1–5 stars on Open Library; Encore shows 0–10. */
const tenPoint = (stars: number | undefined) => (stars ? Math.round(stars * 20) / 10 : null);

export function docToResult(d: OlDoc): SearchResult | null {
  const id = workNumber(d.key);
  if (id === null || !d.title) return null;
  return {
    tmdbId: id,
    mediaType: "book",
    name: d.title,
    year: d.first_publish_year ?? null,
    posterUrl: coverUrl(d.cover_i),
    author: authorLine(d.author_name),
    overview: "",
    genreIds: d.subject ? bookGenres(d.subject).map((g) => g.id) : [],
    voteAverage: tenPoint(d.ratings_average),
  };
}

const results = (docs: OlDoc[]) => docs.map(docToResult).filter((r): r is SearchResult => r !== null);

export function searchDocs(params: Record<string, string>, freshness = SEARCH): Promise<OlDoc[]> {
  return ol<{ docs: OlDoc[] }>("/search.json", { fields: FIELDS, ...params }, freshness).then((d) => d.docs ?? []);
}

/** Descriptions often end with a "----------" block of links back to sources. */
function cleanDescription(d: OlWork["description"]): string {
  const text = typeof d === "string" ? d : (d?.value ?? "");
  return text
    .split(/\n-{3,}/)[0]
    .replace(/\[([^\]]+)\]\[\d+\]/g, "$1")
    .replace(/\(\[source\]\[\d+\]\)/gi, "")
    .replace(/\r/g, "")
    .trim();
}

async function work(id: number): Promise<OlWork> {
  const w = await ol<OlWork>(`${workKey(id)}.json`);
  // Merged works leave a redirect behind.
  if (w.type?.key === "/type/redirect" && w.location) return ol<OlWork>(`${w.location}.json`);
  return w;
}

async function details(id: number): Promise<Title | null> {
  const [w, doc] = await Promise.all([
    work(id),
    searchDocs({ q: `key:${workKey(id)}`, limit: "1" }, CATALOG)
      .then((docs) => docs[0] ?? null)
      .catch(() => null),
  ]);
  const authors = doc?.author_name?.length
    ? doc.author_name
    : await Promise.all(
        (w.authors ?? [])
          .slice(0, 3)
          .map((a) => a.author?.key)
          .filter((k): k is string => Boolean(k))
          .map((k) => ol<{ name?: string }>(`${k}.json`).then((a) => a.name ?? "").catch(() => "")),
      );
  const year = doc?.first_publish_year ?? (Number(/\d{4}/.exec(w.first_publish_date ?? "")?.[0]) || null);
  const title: Title = {
    tmdbId: id,
    mediaType: "book",
    name: w.title ?? doc?.title ?? "Untitled",
    year,
    posterUrl: coverUrl(w.covers?.find((c) => c > 0)) ?? coverUrl(doc?.cover_i),
    author: authorLine(authors),
    overview: cleanDescription(w.description),
    backdropUrl: null,
    genres: bookGenres([...(w.subjects ?? []), ...(doc?.subject ?? [])]),
    seasons: [],
    pageCount: doc?.number_of_pages_median ?? null,
  };
  // Optional: Google Books fills in a missing cover, blurb or page count.
  if (!title.posterUrl || !title.overview || !title.pageCount) {
    const extra = await googleBooksFill(title.name, title.author ?? null);
    if (extra) {
      title.posterUrl ??= extra.coverUrl;
      title.overview ||= extra.description ?? "";
      title.pageCount ??= extra.pageCount;
    }
  }
  return title;
}

/** Most-read books on a subject ("popular"), or best rated with enough ratings to trust ("acclaimed"). */
async function genreList(genreId: number, sort: "readinglog" | "rating"): Promise<SearchResult[]> {
  const subject = GENRE_SUBJECT[genreId];
  if (!subject) return [];
  const docs = await searchDocs({ q: `subject:"${subject}"`, sort, limit: "40" }, POPULAR);
  const trusted = sort === "rating" ? docs.filter((d) => (d.ratings_count ?? 0) >= 25) : docs;
  return results(trusted.filter((d) => d.cover_i));
}

/** Every method takes a media type to fit CatalogProvider; this one only ever sees "book". */
export const openLibraryCatalog: CatalogProvider = {
  kind: "live",
  source: "openlibrary",

  async verify() {},

  async search(_type, query) {
    return results(await searchDocs({ q: query, limit: "30" }));
  },

  async trending() {
    const data = await ol<{ works: OlDoc[] }>("/trending/weekly.json", { limit: "40" }, POPULAR);
    return results((data.works ?? []).filter((d) => d.cover_i));
  },

  topInGenre: (_type, genreId) => genreList(genreId, "rating"),
  popularInGenre: (_type, genreId) => genreList(genreId, "readinglog"),

  /** No "more like this" on Open Library: other books by the same author, then the best of its main genre. */
  async similar(_type, id) {
    const [w, doc] = await Promise.all([
      work(id),
      searchDocs({ q: `key:${workKey(id)}`, limit: "1" }, CATALOG).then((d) => d[0] ?? null),
    ]);
    const authorKey = doc?.author_key?.[0] ?? w.authors?.[0]?.author?.key?.split("/").pop();
    const genre = bookGenres([...(w.subjects ?? []), ...(doc?.subject ?? [])])[0];
    const [byAuthor, inGenre] = await Promise.all([
      authorKey
        ? searchDocs({ q: `author_key:${authorKey}`, sort: "readinglog", limit: "12" }, CATALOG).then(results)
        : Promise.resolve([]),
      genre ? genreList(genre.id, "rating") : Promise.resolve([]),
    ]);
    const seen = new Set<number>([id]);
    return [...byAuthor.filter((r) => r.posterUrl).slice(0, 6), ...inGenre].filter((r) => !seen.has(r.tmdbId) && seen.add(r.tmdbId));
  },

  details: (_type, id) => details(id),

  // Books have no streaming, seasons or regions.
  async watchProviders() {
    return {};
  },
  async regions() {
    return [];
  },
  async streamingServices() {
    return [];
  },
  async season() {
    return [];
  },
};

/**
 * The Open Library work for an ISBN (10 or 13 digits), for imports. Null when
 * Open Library doesn't know the ISBN.
 */
export async function workForIsbn(isbn: string): Promise<number | null> {
  const clean = isbn.replace(/[^0-9Xx]/g, "");
  if (clean.length !== 10 && clean.length !== 13) return null;
  const docs = await searchDocs({ q: `isbn:${clean}`, limit: "1" }, CATALOG).catch(() => []);
  return docs[0] ? workNumber(docs[0].key) : null;
}
