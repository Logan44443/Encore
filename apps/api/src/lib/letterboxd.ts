/**
 * Reading Letterboxd's data export (Settings → Data → Export your data). The ZIP
 * holds ratings.csv, diary.csv, watched.csv, watchlist.csv and reviews.csv, plus
 * folders (lists/, likes/, deleted/) we ignore. Every CSV identifies a film by
 * Name + Year; diary and review rows have their own URIs, so the film key is
 * the normalised name and year rather than the Letterboxd URI.
 */

export interface LetterboxdFilm {
  key: string;
  name: string;
  year: number | null;
  /** Stars, ½ to 5. ratings.csv wins; otherwise the latest rated diary entry. */
  rating: number | null;
  /** Latest "Watched Date" from the diary or reviews. */
  watchedAt: string | null;
  /** When it was first logged on Letterboxd, used to backdate imported entries. */
  loggedAt: string | null;
  review: string | null;
  watched: boolean;
  watchlist: boolean;
}

type Kind = "ratings" | "diary" | "reviews" | "watched" | "watchlist";

/** RFC 4180 CSV: quoted fields may hold commas, doubled quotes and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

/** Which export file this is, from its header row and (for the two with identical headers) its name. */
function kindOf(fileName: string, header: string[]): Kind | null {
  const path = fileName.toLowerCase();
  if (/(^|\/)(lists|likes|deleted|orphaned)\//.test(path)) return null;
  const has = (col: string) => header.includes(col);
  if (!has("Name") || !has("Year")) return null;
  if (has("Review")) return "reviews";
  if (has("Watched Date")) return "diary";
  if (has("Rating")) return "ratings";
  const base = path.split("/").pop() ?? "";
  if (base.startsWith("watchlist")) return "watchlist";
  if (base.startsWith("watched")) return "watched";
  return null;
}

export function filmKey(name: string, year: number | null): string {
  return `${normalizeTitle(name)}|${year ?? ""}`;
}

/** Lowercase, accents and punctuation dropped, "&" read as "and", for comparing titles. */
export function normalizeTitle(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function date(value: string | undefined): string | null {
  const v = value?.trim() ?? "";
  return DATE.test(v) ? v : null;
}

function stars(value: string | undefined): number | null {
  const n = Number(value?.trim());
  if (!value?.trim() || !Number.isFinite(n) || n <= 0) return null;
  return Math.min(5, Math.round(n * 2) / 2);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** Letterboxd reviews carry a little HTML (<i>, <b>, <br />); keep the text and line breaks. */
export function plainReview(html: string): string | null {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_, e: string) => ENTITIES[e])
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text ? text.slice(0, 5000) : null;
}

const later = (a: string | null, b: string | null) => (a && (!b || a > b) ? a : b);
const earlier = (a: string | null, b: string | null) => (a && (!b || a < b) ? a : b);

/**
 * Merges every recognised CSV into one record per film. Returns the films and the
 * export files that were recognised, so an upload of the wrong file can be explained.
 */
export function parseExport(files: { name: string; text: string }[]): { films: LetterboxdFilm[]; recognised: Kind[] } {
  const films = new Map<string, LetterboxdFilm & { ratedFrom: "ratings" | "diary" | null; ratedOn: string | null; reviewOn: string | null }>();
  const recognised: Kind[] = [];

  for (const file of files) {
    const [header, ...rows] = parseCsv(file.text);
    if (!header) continue;
    const cols = header.map((h) => h.trim());
    const kind = kindOf(file.name, cols);
    if (!kind) continue;
    recognised.push(kind);
    const col = (row: string[], name: string) => {
      const i = cols.indexOf(name);
      return i < 0 ? undefined : row[i];
    };

    for (const row of rows) {
      const name = col(row, "Name")?.trim();
      if (!name) continue;
      const yearNum = Number(col(row, "Year"));
      const year = Number.isInteger(yearNum) && yearNum > 1800 ? yearNum : null;
      const key = filmKey(name, year);
      let film = films.get(key);
      if (!film) {
        film = { key, name, year, rating: null, watchedAt: null, loggedAt: null, review: null, watched: false, watchlist: false, ratedFrom: null, ratedOn: null, reviewOn: null };
        films.set(key, film);
      }
      const logged = date(col(row, "Date"));
      const watchedOn = date(col(row, "Watched Date")) ?? logged;

      film.loggedAt = earlier(logged, film.loggedAt);
      if (kind === "watchlist") {
        film.watchlist = true;
        continue;
      }
      film.watched = true;
      if (kind === "diary" || kind === "reviews") film.watchedAt = later(watchedOn, film.watchedAt);

      const rating = stars(col(row, "Rating"));
      if (rating !== null) {
        if (kind === "ratings") {
          film.rating = rating;
          film.ratedFrom = "ratings";
        } else if (film.ratedFrom !== "ratings" && (!film.ratedOn || (watchedOn && watchedOn >= film.ratedOn))) {
          film.rating = rating;
          film.ratedFrom = "diary";
          film.ratedOn = watchedOn;
        }
      }

      if (kind === "reviews") {
        const review = plainReview(col(row, "Review") ?? "");
        if (review && (!film.reviewOn || (watchedOn && watchedOn >= film.reviewOn))) {
          film.review = review;
          film.reviewOn = watchedOn;
        }
      }
    }
  }

  return {
    films: [...films.values()].map(({ ratedFrom: _f, ratedOn: _o, reviewOn: _r, ...film }) => ({
      ...film,
      // Watched counts over wanting to watch: a film you've seen doesn't belong on the watchlist.
      watchlist: film.watchlist && !film.watched,
    })),
    recognised,
  };
}

/**
 * The search result that is clearly this film, or null when it's a guess. Same
 * title and year wins; a year off by one is allowed (festival vs. release dates
 * differ); otherwise a lone result from the right year whose title contains, or
 * is contained in, the Letterboxd one.
 */
export function bestMatch<T extends { name: string; year: number | null }>(
  film: { name: string; year: number | null },
  results: T[],
): T | null {
  const name = normalizeTitle(film.name);
  const sameName = results.filter((r) => normalizeTitle(r.name) === name);
  if (film.year === null) return sameName.length === 1 ? sameName[0] : null;

  const exact = sameName.find((r) => r.year === film.year);
  if (exact) return exact;
  const close = sameName.filter((r) => r.year !== null && Math.abs(r.year - film.year!) === 1);
  if (close.length === 1) return close[0];

  const sameYear = results.filter((r) => r.year === film.year);
  if (sameYear.length === 1) {
    const other = normalizeTitle(sameYear[0].name);
    if (other && name && (other.includes(name) || name.includes(other))) return sameYear[0];
  }
  return null;
}
