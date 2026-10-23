import { BOOK_GENRES, type Genre } from "@encore/shared";

/** Pure helpers for Open Library data, kept apart from the provider so tests need no network or database. */

const COVERS = "https://covers.openlibrary.org/b/id";

/** "/works/OL45804W" → 45804; null for anything that isn't a work key. */
export function workNumber(key: string): number | null {
  const m = /OL(\d+)W$/.exec(key);
  return m ? Number(m[1]) : null;
}

export const workKey = (id: number) => `/works/OL${id}W`;

export const coverUrl = (coverId: number | null | undefined) => (coverId && coverId > 0 ? `${COVERS}/${coverId}-L.jpg` : null);

/** "Ursula K. Le Guin", or "Neil Gaiman & Terry Pratchett"; at most two names, then "and others". */
export function authorLine(names: string[] | undefined): string | null {
  const unique = [...new Set((names ?? []).map((n) => n.trim()).filter(Boolean))];
  if (unique.length === 0) return null;
  if (unique.length <= 2) return unique.join(" & ");
  return `${unique[0]} & others`;
}

/**
 * Open Library subjects are free text ("Fiction, science fiction, general",
 * "Magic -- Fiction"), so each genre is a pattern. Earlier rules win ties.
 * Nonfiction genres skip any subject that mentions fiction, so "History --
 * Fiction" stays out of History.
 */
const RULES: { id: number; test: RegExp; fiction?: boolean; nonfiction?: boolean }[] = [
  { id: 1011, test: /\b(comic|comics|graphic novels?|manga)\b/ },
  { id: 1012, test: /\bpoe(try|ms)\b/ },
  { id: 1008, test: /\byoung adult\b/ },
  { id: 1009, test: /\b(juvenile|children'?s|picture books?)\b/ },
  { id: 1003, test: /\b(science fiction|sci-fi|dystopia|dystopian|space opera)\b/ },
  { id: 1002, test: /\b(fantasy|fantasy fiction|epic fantasy)\b/ },
  { id: 1006, test: /\b(horror|ghost stories|vampires?)\b/ },
  { id: 1004, test: /\b(mystery|mysteries|thrillers?|detective|crime fiction|suspense)\b/ },
  { id: 1005, test: /\b(romance|love stories)\b/ },
  { id: 1007, test: /\b(historical fiction|fiction, historical)\b/ },
  { id: 1010, test: /\bclassics?( literature)?\b/ },
  { id: 1013, test: /\b(biography|biographies|memoirs?|autobiography)\b/, nonfiction: true },
  { id: 1015, test: /^(science|nature|physics|biology|astronomy|evolution|popular science|natural history)\b/, nonfiction: true },
  { id: 1016, test: /\b(self-help|self help|personal development|success|motivation)\b/, nonfiction: true },
  { id: 1017, test: /^(business|economics|management|finance|entrepreneurship)\b/, nonfiction: true },
  { id: 1018, test: /^(philosophy|religion|spirituality|christianity|buddhism|ethics)\b/, nonfiction: true },
  { id: 1014, test: /^(history|world war|military history)\b/, nonfiction: true },
];
const FICTION = 1001;
const NONFICTION = 1019;

const byId = new Map(BOOK_GENRES.map((g) => [g.id, g]));

/**
 * Encore genres for a book's subjects, best match first (at most three, plus
 * Fiction or Nonfiction last so there's always a broad list to rank it in).
 */
export function bookGenres(subjects: string[] | undefined): Genre[] {
  const list = (subjects ?? []).slice(0, 60).map((s) => s.toLowerCase());
  const isFiction = list.some((s) => /\b(fiction|novels?)\b/.test(s) && !/\bnon-?fiction\b/.test(s));
  const hits = new Map<number, number>();
  for (const subject of list) {
    const mentionsFiction = /\bfiction\b/.test(subject);
    for (const rule of RULES) {
      if (rule.nonfiction && mentionsFiction) continue;
      if (rule.test.test(subject)) hits.set(rule.id, (hits.get(rule.id) ?? 0) + 1);
    }
  }
  const order = RULES.map((r) => r.id);
  const ids = [...hits]
    .sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))
    .slice(0, 3)
    .map(([id]) => id);
  ids.push(isFiction || ids.some((id) => !RULES.find((r) => r.id === id)?.nonfiction) ? FICTION : NONFICTION);
  return ids.map((id) => byId.get(id)!);
}

