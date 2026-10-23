import { normalizeTitle, parseCsv, plainReview } from "./letterboxd";

/**
 * Reading Goodreads' library export (My Books → Import and export → Export
 * Library): one CSV, one row per book, with "Exclusive Shelf" saying read,
 * currently-reading or to-read.
 */

export interface GoodreadsBook {
  /** Goodreads' Book Id, stable within the export. */
  key: string;
  name: string;
  author: string | null;
  year: number | null;
  /** ISBN-13 first, then ISBN-10; either may be missing. */
  isbns: string[];
  /** 1 to 5 stars, or null when it wasn't rated. */
  rating: number | null;
  watchedAt: string | null;
  /** When it was added on Goodreads, used to backdate imported entries. */
  loggedAt: string | null;
  review: string | null;
  /** True for read books; the rest (to-read, currently reading) go on the watchlist. */
  watched: boolean;
}

/** Goodreads writes ISBNs as ="0439023483" so spreadsheets keep the leading zero. */
function isbn(value: string | undefined): string | null {
  const v = (value ?? "").replace(/[="\s-]/g, "");
  return /^(\d{9}[\dXx]|\d{13})$/.test(v) ? v.toUpperCase() : null;
}

/** "2019/05/21" (or 2019-05-21) → "2019-05-21". */
function date(value: string | undefined): string | null {
  const m = /^(\d{4})[/-](\d{2})[/-](\d{2})$/.exec(value?.trim() ?? "");
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function year(...values: (string | undefined)[]): number | null {
  for (const v of values) {
    const n = Number(v?.trim());
    if (v?.trim() && Number.isInteger(n) && n > 0 && n <= new Date().getFullYear() + 1) return n;
  }
  return null;
}

/** Null when the file isn't a Goodreads library export. */
export function parseGoodreads(text: string): GoodreadsBook[] | null {
  const [header, ...rows] = parseCsv(text);
  const cols = (header ?? []).map((h) => h.trim());
  if (!["Book Id", "Title", "Author", "Exclusive Shelf"].every((c) => cols.includes(c))) return null;
  const col = (row: string[], name: string) => {
    const i = cols.indexOf(name);
    return i < 0 ? undefined : row[i];
  };

  const books: GoodreadsBook[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const name = col(row, "Title")?.trim();
    const key = col(row, "Book Id")?.trim() || name;
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    const stars = Number(col(row, "My Rating"));
    const rating = Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : null;
    const watchedAt = date(col(row, "Date Read"));
    const shelf = col(row, "Exclusive Shelf")?.trim().toLowerCase();
    books.push({
      key,
      name,
      author: col(row, "Author")?.trim() || null,
      year: year(col(row, "Original Publication Year"), col(row, "Year Published")),
      isbns: [isbn(col(row, "ISBN13")), isbn(col(row, "ISBN"))].filter((i): i is string => i !== null),
      rating,
      watchedAt,
      loggedAt: date(col(row, "Date Added")),
      review: plainReview(col(row, "My Review") ?? ""),
      // Custom exclusive shelves: rated or dated books count as read.
      watched: shelf === "read" || (shelf !== "to-read" && shelf !== "currently-reading" && (rating !== null || watchedAt !== null)),
    });
  }
  return books;
}

/** Goodreads titles carry the series, "Catching Fire (The Hunger Games, #2)"; Open Library's don't. */
export function bookTitle(name: string): string {
  return name.replace(/\s*\([^()]*#\s*[\d.]+[^()]*\)\s*$/, "").trim();
}

/** Title without series or subtitle, normalised for comparing. */
const titleKey = (name: string) => normalizeTitle(bookTitle(name).split(/[:;]/)[0]);

/**
 * The search result that is clearly this book: the same title (series and
 * subtitle aside) by an author with the same surname. Open Library's own order
 * breaks ties, which puts the main work first. Null when it's a guess.
 */
export function bestBookMatch<T extends { name: string; author?: string | null }>(
  book: { name: string; author: string | null },
  results: T[],
): T | null {
  const want = titleKey(book.name);
  if (!want) return null;
  const sameTitle = results.filter((r) => titleKey(r.name) === want);
  const surname = normalizeTitle(book.author ?? "").split(" ").pop();
  if (!surname) return sameTitle.length === 1 ? sameTitle[0] : null;
  return sameTitle.find((r) => normalizeTitle(r.author ?? "").split(" ").includes(surname)) ?? null;
}
