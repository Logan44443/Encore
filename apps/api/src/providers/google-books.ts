import { env } from "../env";
import { DAY } from "../lib/cache";
import { swr } from "../lib/swr-cache";

export interface GoogleBooksExtra {
  coverUrl: string | null;
  description: string | null;
  pageCount: number | null;
}

interface Volume {
  volumeInfo?: {
    title?: string;
    description?: string;
    pageCount?: number;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
}

/** Google's thumbnails come as http and with a page-curl effect; ask for https and a flat, larger image. */
const cleanCover = (url: string | undefined) =>
  url ? url.replace(/^http:/, "https:").replace("&edge=curl", "").replace(/zoom=\d/, "zoom=1") : null;

/**
 * Optional fallback for books Open Library knows but has no cover, blurb or page
 * count for. Only runs with GOOGLE_BOOKS_API_KEY set; never throws.
 */
export async function googleBooksFill(title: string, author: string | null): Promise<GoogleBooksExtra | null> {
  const key = env.googleBooksApiKey;
  if (!key) return null;
  const q = [`intitle:${title}`, author ? `inauthor:${author.split(" & ")[0]}` : ""].filter(Boolean).join(" ");
  return swr(`gbooks:${q.toLowerCase()}`, { fresh: 7 * DAY, stale: 30 * DAY }, async () => {
    const url = new URL("https://www.googleapis.com/books/v1/volumes");
    url.searchParams.set("q", q);
    url.searchParams.set("maxResults", "1");
    url.searchParams.set("printType", "books");
    url.searchParams.set("key", key);
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Google Books ${res.status}`);
    const info = ((await res.json()) as { items?: Volume[] }).items?.[0]?.volumeInfo;
    if (!info) return null;
    return {
      coverUrl: cleanCover(info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail),
      // Descriptions can carry simple HTML (<p>, <br>, <i>).
      description: info.description?.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim() || null,
      pageCount: info.pageCount || null,
    };
  }).catch(() => null);
}
