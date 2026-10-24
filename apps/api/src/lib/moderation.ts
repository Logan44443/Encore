import { HTTPException } from "hono/http-exception";

/**
 * Names other people see (usernames, display names) are screened for slurs at
 * sign-up and on change. Deliberately short and unambiguous so ordinary names
 * never trip it; reports and blocks handle everything else.
 */
const BLOCKED = [
  "nigger", "nigga", "faggot", "kike", "chink", "wetback", "tranny", "retard",
  "gook", "raghead", "towelhead", "beaner", "hitler",
];

/** Undo the usual disguises: case, separators, digits standing in for letters. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[0134578@$!|]/g, (ch) => ({ "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", $: "s", "!": "i", "|": "i" })[ch]!)
    .replace(/[^a-z]/g, "");
}

/** Each letter may be stretched ("niiigger"), but doubled letters must stay doubled, so "Nigeria" passes. */
const PATTERNS = BLOCKED.map((w) => new RegExp((w.match(/(.)\1*/g) ?? []).map((run) => `${run}+`).join("")));

export function isOffensiveName(text: string): boolean {
  const n = normalise(text);
  return PATTERNS.some((re) => re.test(n));
}

/**
 * For prose (reviews, show notes) a substring match would misfire: words run together
 * across spaces, and an honest review of a WWII film names Hitler. So prose is checked
 * word by word, against a shorter list without words that are also everyday English
 * ("chink in the armour") or history.
 */
const PROSE_BLOCKED = BLOCKED.filter((w) => w !== "hitler" && w !== "chink");
const PROSE_PATTERNS = PROSE_BLOCKED.map(
  (w) => new RegExp(`^${(w.match(/(.)\1*/g) ?? []).map((run) => `${run}+`).join("")}[sz]?$`),
);

export function isOffensiveText(text: string): boolean {
  return text
    .split(/[\s,;:/()"“”‘’?]+/)
    .map(normalise)
    .some((word) => word.length > 0 && PROSE_PATTERNS.some((re) => re.test(word)));
}

/** Reviews, notes and other free text friends can see. */
export function assertAcceptableText(...texts: (string | undefined | null)[]) {
  if (texts.some((t) => t && isOffensiveText(t))) {
    throw new HTTPException(400, {
      message: "That has language that isn't allowed on Encore. Edit it and try again.",
    });
  }
}

export function assertAcceptableNames(...names: (string | undefined | null)[]) {
  if (names.some((n) => n && isOffensiveName(n))) {
    throw new HTTPException(400, { message: "Pick a different name. That one isn't allowed on Encore." });
  }
}
