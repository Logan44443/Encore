import { scoreFromStars, type CatalogImport, type ImportCounts, type ImportSource, type TitleSummary } from "@encore/shared";
import { and, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { catalogImports, titleEntries, watchlistItems, type StoredUnmatched } from "../db/schema";
import { bestBookMatch, bookTitle, parseGoodreads } from "../lib/goodreads";
import { bestMatch, parseExport } from "../lib/letterboxd";
import { isOffensiveText } from "../lib/moderation";
import { readZip, ZipError } from "../lib/zip";
import { catalog } from "../providers/catalog";
import { workForIsbn } from "../providers/openlibrary";
import { invalidateDiscover } from "./discover";
import { importRatedEntry, saveReview } from "./entries";
import { invalidateFeed } from "./feed";
import { getTitle, toTitleSummary } from "./titles";

type Row = typeof catalogImports.$inferSelect;
type Upload = { name: string; data: Buffer };

/** One film or book from an export, whichever site it came from. */
interface ImportItem {
  key: string;
  name: string;
  year: number | null;
  author: string | null;
  isbns: string[];
  /** Stars, ½ to 5. */
  rating: number | null;
  watchedAt: string | null;
  /** When it was first logged on the other site, used to backdate imported entries. */
  loggedAt: string | null;
  review: string | null;
  /** Watched (or read); otherwise it goes on the watchlist. */
  watched: boolean;
}

/**
 * What differs between importers. Letterboxd brings films matched on TMDB by
 * title and year; Goodreads brings books matched on Open Library by ISBN, then
 * title and author.
 */
interface Source {
  mediaType: "movie" | "book";
  /** Items matched at once. TMDB allows ~50 requests/second; Open Library asks for a few. */
  concurrency: number;
  noun: string;
  parse(uploads: Upload[]): ImportItem[];
  findMatch(item: ImportItem): Promise<number | null>;
}

const MAX_ITEMS = 20_000;
/** Per CSV inside the ZIP. A huge diary with long reviews is a few MB. */
const MAX_CSV_BYTES = 50 * 1024 * 1024;

const SOURCES: Record<ImportSource, Source> = {
  letterboxd: {
    mediaType: "movie",
    concurrency: 4,
    noun: "films",
    parse(uploads) {
      const { films, recognised } = parseExport(exportFiles(uploads));
      if (recognised.length === 0) {
        throw new HTTPException(400, {
          message: "That doesn't look like a Letterboxd export. Choose the ZIP file from Letterboxd's \"Export your data\".",
        });
      }
      return films.map(({ watchlist: _w, ...f }) => ({ ...f, author: null, isbns: [] }));
    },
    findMatch: (film) => retry(async () => bestMatch(film, await catalog.search("movie", film.name))?.tmdbId ?? null),
  },
  goodreads: {
    mediaType: "book",
    concurrency: 2,
    noun: "books",
    parse(uploads) {
      const exports = exportFiles(uploads)
        .map((f) => parseGoodreads(f.text))
        .filter((books) => books !== null);
      if (exports.length === 0) {
        throw new HTTPException(400, {
          message: "That doesn't look like a Goodreads export. Choose the CSV file from Goodreads' \"Export Library\".",
        });
      }
      return exports.flat();
    },
    findMatch: (book) =>
      retry(async () => {
        for (const isbn of book.isbns) {
          const id = await workForIsbn(isbn);
          if (id !== null) return id;
        }
        const query = [bookTitle(book.name), book.author].filter(Boolean).join(" ");
        return bestBookMatch(book, await catalog.search("book", query))?.tmdbId ?? null;
      }),
  },
};

/** Tries a lookup twice, a second apart; null when it keeps failing. */
async function retry(find: () => Promise<number | null>): Promise<number | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await find();
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return null;
}

/** Imports running in this process, by user and source. A "running" row with no job here was cut off by a restart. */
const running = new Set<string>();
const jobKey = (userId: string, source: ImportSource) => `${userId}:${source}`;

const emptyCounts = (): ImportCounts => ({ ranked: 0, alreadyRanked: 0, watchlisted: 0, notRated: 0, unmatched: 0 });

const thisImport = (userId: string, source: ImportSource) => and(eq(catalogImports.userId, userId), eq(catalogImports.source, source));

function toImport(row: Row): CatalogImport {
  return {
    status: row.status,
    done: row.done,
    total: row.total,
    error: row.error,
    counts: row.counts,
    unmatched: row.unmatched.map(({ review: _r, loggedAt: _l, ...u }) => u),
    notRated: row.notRated,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

async function loadRow(userId: string, source: ImportSource): Promise<Row | null> {
  const [row] = await db.select().from(catalogImports).where(thisImport(userId, source));
  return row ?? null;
}

export async function getImport(userId: string, source: ImportSource): Promise<CatalogImport | null> {
  const row = await loadRow(userId, source);
  if (!row) return null;
  if (row.status === "running" && !running.has(jobKey(userId, source))) {
    const [failed] = await db
      .update(catalogImports)
      .set({ status: "failed", error: "The import was interrupted. Import the file again; anything already added stays as it is.", finishedAt: new Date() })
      .where(thisImport(userId, source))
      .returning();
    return toImport(failed);
  }
  return toImport(row);
}

/** CSV text from each upload: the CSVs inside a ZIP, or the file itself. */
function exportFiles(uploads: Upload[]): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = [];
  for (const upload of uploads) {
    const isZip = upload.data.length >= 4 && upload.data.readUInt32LE(0) === 0x04034b50;
    if (!isZip) {
      out.push({ name: upload.name, text: upload.data.toString("utf8") });
      continue;
    }
    try {
      for (const [name, data] of readZip(upload.data, (n) => n.toLowerCase().endsWith(".csv"), MAX_CSV_BYTES)) {
        out.push({ name, text: data.toString("utf8") });
      }
    } catch (err) {
      if (err instanceof ZipError) throw new HTTPException(400, { message: `Couldn't open ${upload.name}: ${err.message}` });
      throw err;
    }
  }
  return out;
}

/** Validates the export, records a running import, and processes it in the background. */
export async function startImport(userId: string, source: ImportSource, uploads: Upload[]): Promise<CatalogImport> {
  const job = jobKey(userId, source);
  if (running.has(job)) throw new HTTPException(409, { message: "An import is already running. It'll finish in a few minutes." });

  const { noun } = SOURCES[source];
  const items = SOURCES[source].parse(uploads);
  if (items.length === 0) throw new HTTPException(400, { message: `There are no ${noun} in that export yet.` });
  if (items.length > MAX_ITEMS) throw new HTTPException(400, { message: `That export has more than ${MAX_ITEMS} ${noun}.` });

  // Imported reviews get the same language check as ones typed in the app; the rating still comes across.
  for (const item of items) if (item.review && isOffensiveText(item.review)) item.review = null;

  // Rated items first, so the rankings fill in before the long tail.
  items.sort((a, b) => Number(b.rating !== null) - Number(a.rating !== null));

  const fresh = {
    status: "running" as const,
    done: 0,
    total: items.length,
    error: null,
    counts: emptyCounts(),
    unmatched: [],
    notRated: [],
    startedAt: new Date(),
    finishedAt: null,
  };
  running.add(job);
  try {
    const [row] = await db
      .insert(catalogImports)
      .values({ userId, source, ...fresh })
      .onConflictDoUpdate({ target: [catalogImports.userId, catalogImports.source], set: fresh })
      .returning();
    void run(userId, source, items).finally(() => running.delete(job));
    return toImport(row);
  } catch (err) {
    running.delete(job);
    throw err;
  }
}

async function run(userId: string, source: ImportSource, items: ImportItem[]) {
  const { mediaType, concurrency, findMatch } = SOURCES[source];
  const counts = emptyCounts();
  const unmatched: StoredUnmatched[] = [];
  const notRated: TitleSummary[] = [];
  let done = 0;
  let savedAt = Date.now();
  const queue = [...items];

  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const match = await findMatch(item);
      if (match === null) {
        unmatched.push(toUnmatched(item));
        counts.unmatched++;
      } else {
        try {
          tally(counts, notRated, await applyItem(userId, mediaType, item, match));
        } catch (err) {
          console.warn(`[${source}] couldn't import "${item.name}" (${item.year}):`, (err as Error).message);
          unmatched.push(toUnmatched(item));
          counts.unmatched++;
        }
      }
      done++;
      if (Date.now() - savedAt > 1500) {
        savedAt = Date.now();
        await db.update(catalogImports).set({ done, counts: { ...counts } }).where(thisImport(userId, source));
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: concurrency }, worker));
    await db
      .update(catalogImports)
      .set({ status: "done", done, counts, unmatched, notRated, finishedAt: new Date() })
      .where(thisImport(userId, source));
  } catch (err) {
    console.error(`[${source}] import failed`, err);
    await db
      .update(catalogImports)
      .set({
        status: "failed",
        done,
        counts,
        unmatched,
        notRated,
        error: "Something went wrong partway through. Import the file again; anything already added stays as it is.",
        finishedAt: new Date(),
      })
      .where(thisImport(userId, source))
      .catch(() => undefined);
  } finally {
    invalidateDiscover();
    invalidateFeed(userId);
  }
}

function toUnmatched(item: ImportItem): StoredUnmatched {
  return {
    key: item.key,
    name: item.name,
    year: item.year,
    ...(item.author ? { author: item.author } : {}),
    rating: item.rating,
    watchedAt: item.watchedAt,
    kind: item.watched ? "watched" : "watchlist",
    review: item.review,
    loggedAt: item.loggedAt,
  };
}

type Outcome =
  | { kind: "ranked" | "alreadyRanked" | "watchlisted" | "skipped" }
  | { kind: "notRated"; title: TitleSummary };

function tally(counts: ImportCounts, notRated: TitleSummary[], outcome: Outcome) {
  if (outcome.kind === "skipped") return;
  counts[outcome.kind]++;
  if (outcome.kind === "notRated") notRated.push(outcome.title);
}

const noonUtc = (day: string | null) => (day ? new Date(`${day}T12:00:00Z`) : null);

/**
 * Brings one film or book into Encore. Safe to repeat: something you've already
 * ranked keeps its ranking (only an empty watched date or review gets filled in),
 * and the watchlist ignores titles already on it or already ranked.
 */
async function applyItem(
  userId: string,
  mediaType: "movie" | "book",
  film: Pick<ImportItem, "watched" | "rating" | "watchedAt" | "loggedAt" | "review">,
  tmdbId: number,
): Promise<Outcome> {
  const title = await getTitle(mediaType, tmdbId);
  const [existing] = await db
    .select({ id: titleEntries.id })
    .from(titleEntries)
    .where(and(eq(titleEntries.userId, userId), eq(titleEntries.titleId, title.id)));

  if (!film.watched) {
    if (existing) return { kind: "skipped" };
    const added = await db
      .insert(watchlistItems)
      .values({ userId, kind: mediaType, titleId: title.id, ...(film.loggedAt ? { createdAt: noonUtc(film.loggedAt)! } : {}) })
      .onConflictDoNothing()
      .returning({ id: watchlistItems.id });
    return { kind: added.length > 0 ? "watchlisted" : "skipped" };
  }

  if (!existing && film.rating !== null) {
    const { tier, score } = scoreFromStars(film.rating);
    const when = noonUtc(film.watchedAt ?? film.loggedAt);
    const added = await importRatedEntry(userId, title, {
      tier,
      score,
      watchedAt: film.watchedAt,
      review: film.review,
      createdAt: when && when.getTime() < Date.now() ? when : null,
    });
    if (added) return { kind: "ranked" };
  }

  if (existing || film.rating !== null) {
    if (film.watchedAt || film.review) {
      await db.transaction(async (tx) => {
        const [entry] = await tx
          .update(titleEntries)
          .set({ watchedAt: sql`coalesce(${titleEntries.watchedAt}, ${film.watchedAt}::date)` })
          .where(and(eq(titleEntries.userId, userId), eq(titleEntries.titleId, title.id)))
          .returning({ id: titleEntries.id });
        if (entry) await saveReview(tx, userId, entry.id, film.review, { onlyIfMissing: true });
      });
    }
    return { kind: "alreadyRanked" };
  }
  return { kind: "notRated", title: toTitleSummary(title) };
}

/** Imports an unmatched item as the title the user picked, or drops it from the list when `tmdbId` is left out. */
export async function fixImportItem(userId: string, source: ImportSource, key: string, tmdbId: number | undefined): Promise<CatalogImport> {
  if (running.has(jobKey(userId, source))) throw new HTTPException(409, { message: "Wait for the import to finish first." });
  const row = await loadRow(userId, source);
  const item = row?.unmatched.find((u) => u.key === key);
  const gone = `That ${source === "goodreads" ? "book" : "film"} isn't waiting to be matched any more.`;
  if (!row || !item) throw new HTTPException(404, { message: gone });

  const outcome: Outcome =
    tmdbId === undefined
      ? { kind: "skipped" }
      : await applyItem(userId, SOURCES[source].mediaType, { ...item, watched: item.kind === "watched" }, tmdbId);

  // Locked so two quick fixes can't overwrite each other's changes to the lists.
  const updated = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(catalogImports).where(thisImport(userId, source)).for("update");
    if (!current) throw new HTTPException(404, { message: gone });
    const unmatched = current.unmatched.filter((u) => u.key !== key);
    const counts = { ...current.counts, unmatched: unmatched.length };
    const notRated = [...current.notRated];
    tally(counts, notRated, outcome);
    const [saved] = await tx
      .update(catalogImports)
      .set({ unmatched, counts, notRated })
      .where(thisImport(userId, source))
      .returning();
    return saved;
  });
  if (outcome.kind !== "skipped") {
    invalidateDiscover();
    invalidateFeed(userId);
  }
  return toImport(updated);
}
