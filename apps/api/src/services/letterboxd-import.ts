import {
  scoreFromStars,
  type LetterboxdImport,
  type LetterboxdImportCounts,
  type TitleSummary,
} from "@encore/shared";
import { and, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { letterboxdImports, titleEntries, watchlistItems } from "../db/schema";
import { bestMatch, parseExport, type LetterboxdFilm } from "../lib/letterboxd";
import { readZip, ZipError } from "../lib/zip";
import { catalog } from "../providers/catalog";
import { invalidateDiscover } from "./discover";
import { importRatedEntry } from "./entries";
import { invalidateFeed } from "./feed";
import { getTitle, toTitleSummary } from "./titles";

type Row = typeof letterboxdImports.$inferSelect;
type StoredUnmatched = Row["unmatched"][number];

/** Films matched at once; TMDB allows ~50 requests/second and each film costs two. */
const CONCURRENCY = 4;
const MAX_FILMS = 20_000;
/** Per CSV inside the ZIP. A huge diary with long reviews is a few MB. */
const MAX_CSV_BYTES = 50 * 1024 * 1024;

/** Imports running in this process. A "running" row with no job here was cut off by a restart. */
const running = new Set<string>();

const emptyCounts = (): LetterboxdImportCounts => ({ ranked: 0, alreadyRanked: 0, watchlisted: 0, notRated: 0, unmatched: 0 });

function toImport(row: Row): LetterboxdImport {
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

async function loadRow(userId: string): Promise<Row | null> {
  const [row] = await db.select().from(letterboxdImports).where(eq(letterboxdImports.userId, userId));
  return row ?? null;
}

export async function getLetterboxdImport(userId: string): Promise<LetterboxdImport | null> {
  const row = await loadRow(userId);
  if (!row) return null;
  if (row.status === "running" && !running.has(userId)) {
    const [failed] = await db
      .update(letterboxdImports)
      .set({ status: "failed", error: "The import was interrupted. Import the file again; anything already added stays as it is.", finishedAt: new Date() })
      .where(eq(letterboxdImports.userId, userId))
      .returning();
    return toImport(failed);
  }
  return toImport(row);
}

/** CSV text from each upload: the CSVs inside a ZIP, or the file itself. */
function exportFiles(uploads: { name: string; data: Buffer }[]): { name: string; text: string }[] {
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
export async function startLetterboxdImport(userId: string, uploads: { name: string; data: Buffer }[]): Promise<LetterboxdImport> {
  if (running.has(userId)) throw new HTTPException(409, { message: "An import is already running. It'll finish in a minute or two." });

  const { films, recognised } = parseExport(exportFiles(uploads));
  if (recognised.length === 0) {
    throw new HTTPException(400, {
      message: "That doesn't look like a Letterboxd export. Choose the ZIP file from Letterboxd's \"Export your data\".",
    });
  }
  if (films.length === 0) throw new HTTPException(400, { message: "There are no films in that export yet." });
  if (films.length > MAX_FILMS) throw new HTTPException(400, { message: `That export has more than ${MAX_FILMS} films.` });

  // Rated films first, so the rankings fill in before the long tail.
  films.sort((a, b) => Number(b.rating !== null) - Number(a.rating !== null));

  const fresh = {
    status: "running" as const,
    done: 0,
    total: films.length,
    error: null,
    counts: emptyCounts(),
    unmatched: [],
    notRated: [],
    startedAt: new Date(),
    finishedAt: null,
  };
  running.add(userId);
  try {
    const [row] = await db
      .insert(letterboxdImports)
      .values({ userId, ...fresh })
      .onConflictDoUpdate({ target: letterboxdImports.userId, set: fresh })
      .returning();
    void run(userId, films).finally(() => running.delete(userId));
    return toImport(row);
  } catch (err) {
    running.delete(userId);
    throw err;
  }
}

async function run(userId: string, films: LetterboxdFilm[]) {
  const counts = emptyCounts();
  const unmatched: StoredUnmatched[] = [];
  const notRated: TitleSummary[] = [];
  let done = 0;
  let savedAt = Date.now();
  const queue = [...films];

  const worker = async () => {
    for (let film = queue.shift(); film; film = queue.shift()) {
      const match = await findMatch(film);
      if (match === null) {
        unmatched.push(toUnmatched(film));
        counts.unmatched++;
      } else {
        try {
          tally(counts, notRated, await applyFilm(userId, film, match));
        } catch (err) {
          console.warn(`[letterboxd] couldn't import "${film.name}" (${film.year}):`, (err as Error).message);
          unmatched.push(toUnmatched(film));
          counts.unmatched++;
        }
      }
      done++;
      if (Date.now() - savedAt > 1500) {
        savedAt = Date.now();
        await db.update(letterboxdImports).set({ done, counts: { ...counts } }).where(eq(letterboxdImports.userId, userId));
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    await db
      .update(letterboxdImports)
      .set({ status: "done", done, counts, unmatched, notRated, finishedAt: new Date() })
      .where(eq(letterboxdImports.userId, userId));
  } catch (err) {
    console.error("[letterboxd] import failed", err);
    await db
      .update(letterboxdImports)
      .set({
        status: "failed",
        done,
        counts,
        unmatched,
        notRated,
        error: "Something went wrong partway through. Import the file again; anything already added stays as it is.",
        finishedAt: new Date(),
      })
      .where(eq(letterboxdImports.userId, userId))
      .catch(() => undefined);
  } finally {
    invalidateDiscover();
    invalidateFeed(userId);
  }
}

/** The TMDB id of this film, or null when search finds no confident match (or keeps failing). */
async function findMatch(film: LetterboxdFilm): Promise<number | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return bestMatch(film, await catalog.search("movie", film.name))?.tmdbId ?? null;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return null;
}

function toUnmatched(film: LetterboxdFilm): StoredUnmatched {
  return {
    key: film.key,
    name: film.name,
    year: film.year,
    rating: film.rating,
    watchedAt: film.watchedAt,
    kind: film.watched ? "watched" : "watchlist",
    review: film.review,
    loggedAt: film.loggedAt,
  };
}

type Outcome =
  | { kind: "ranked" | "alreadyRanked" | "watchlisted" | "skipped" }
  | { kind: "notRated"; title: TitleSummary };

function tally(counts: LetterboxdImportCounts, notRated: TitleSummary[], outcome: Outcome) {
  if (outcome.kind === "skipped") return;
  counts[outcome.kind]++;
  if (outcome.kind === "notRated") notRated.push(outcome.title);
}

const noonUtc = (day: string | null) => (day ? new Date(`${day}T12:00:00Z`) : null);

/**
 * Brings one film into Encore. Safe to repeat: a film you've already ranked keeps
 * its ranking (only an empty watched date or review gets filled in), and the
 * watchlist ignores films already on it or already ranked.
 */
async function applyFilm(
  userId: string,
  film: Pick<LetterboxdFilm, "watched" | "rating" | "watchedAt" | "loggedAt" | "review">,
  tmdbId: number,
): Promise<Outcome> {
  const title = await getTitle("movie", tmdbId);
  const [existing] = await db
    .select({ id: titleEntries.id })
    .from(titleEntries)
    .where(and(eq(titleEntries.userId, userId), eq(titleEntries.titleId, title.id)));

  if (!film.watched) {
    if (existing) return { kind: "skipped" };
    const added = await db
      .insert(watchlistItems)
      .values({ userId, kind: "movie", titleId: title.id, ...(film.loggedAt ? { createdAt: noonUtc(film.loggedAt)! } : {}) })
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
      await db
        .update(titleEntries)
        .set({
          watchedAt: sql`coalesce(${titleEntries.watchedAt}, ${film.watchedAt}::date)`,
          review: sql`coalesce(${titleEntries.review}, ${film.review})`,
        })
        .where(and(eq(titleEntries.userId, userId), eq(titleEntries.titleId, title.id)));
    }
    return { kind: "alreadyRanked" };
  }
  return { kind: "notRated", title: toTitleSummary(title) };
}

/** Imports an unmatched film as the title the user picked, or drops it from the list when `tmdbId` is left out. */
export async function fixLetterboxdFilm(userId: string, key: string, tmdbId: number | undefined): Promise<LetterboxdImport> {
  if (running.has(userId)) throw new HTTPException(409, { message: "Wait for the import to finish first." });
  const row = await loadRow(userId);
  const item = row?.unmatched.find((u) => u.key === key);
  if (!row || !item) throw new HTTPException(404, { message: "That film isn't waiting to be matched any more." });

  const outcome: Outcome = tmdbId === undefined ? { kind: "skipped" } : await applyFilm(userId, { ...item, watched: item.kind === "watched" }, tmdbId);

  // Locked so two quick fixes can't overwrite each other's changes to the lists.
  const updated = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(letterboxdImports).where(eq(letterboxdImports.userId, userId)).for("update");
    if (!current) throw new HTTPException(404, { message: "That film isn't waiting to be matched any more." });
    const unmatched = current.unmatched.filter((u) => u.key !== key);
    const counts = { ...current.counts, unmatched: unmatched.length };
    const notRated = [...current.notRated];
    tally(counts, notRated, outcome);
    const [saved] = await tx
      .update(letterboxdImports)
      .set({ unmatched, counts, notRated })
      .where(eq(letterboxdImports.userId, userId))
      .returning();
    return saved;
  });
  if (outcome.kind !== "skipped") {
    invalidateDiscover();
    invalidateFeed(userId);
  }
  return toImport(updated);
}
