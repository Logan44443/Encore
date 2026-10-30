import { TIER_RANGES, type Tier } from "./constants";

/**
 * Scores for one ranked list, best → worst. `userScores[i]` is the score you set
 * yourself for that title (or null). Those titles keep their score; every other
 * title is spaced evenly between the nearest set scores above and below it, with
 * the tier's top and bottom as the outer bounds. With nothing set, a lone title
 * lands mid-tier and a long list approaches the edges without piling up on them.
 */
export function scoreList(tier: Tier, userScores: readonly (number | null)[]): number[] {
  const { min, max } = TIER_RANGES[tier];
  const n = userScores.length;
  const out: number[] = new Array(n);
  let prevIdx = -1;
  let prevScore = max;
  for (let i = 0; i <= n; i++) {
    const own = i < n ? userScores[i] : min;
    if (own === null) continue;
    // Clamp so a set score can never outrank the one above it.
    const anchor = Math.min(prevScore, Math.max(min, own));
    const gap = i - prevIdx;
    for (let j = prevIdx + 1; j < i; j++) out[j] = round1(prevScore - ((prevScore - anchor) * (j - prevIdx)) / gap);
    if (i < n) out[i] = round1(anchor);
    prevIdx = i;
    prevScore = anchor;
  }
  return out;
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/**
 * Binary-insertion state for Beli-style pairwise ranking. The client runs this
 * locally (no round-trips per question), then sends the final neighbour to the API.
 * `lo`/`hi` bound the insertion index into a list sorted best → worst.
 */
export interface ComparisonState {
  lo: number;
  hi: number;
  asked: number;
}

export type ComparisonAnswer = "new" | "existing" | "tie";

export function startComparison(listLength: number): ComparisonState {
  return { lo: 0, hi: listLength, asked: 0 };
}

/** A comparison that only asks about the items from `lo` up to (not including) `hi`; the rest are known to be above or below. */
export function startComparisonBetween(lo: number, hi: number): ComparisonState {
  return { lo, hi: Math.max(lo, hi), asked: 0 };
}

export function isComparisonDone(state: ComparisonState): boolean {
  return state.lo >= state.hi;
}

/** Index of the existing item to compare against next, or null when finished. */
export function nextComparisonIndex(state: ComparisonState): number | null {
  if (isComparisonDone(state)) return null;
  return Math.floor((state.lo + state.hi) / 2);
}

export function answerComparison(state: ComparisonState, answer: ComparisonAnswer): ComparisonState {
  const mid = nextComparisonIndex(state);
  if (mid === null) return state;
  const asked = state.asked + 1;
  switch (answer) {
    case "new":
      return { lo: state.lo, hi: mid, asked };
    case "existing":
      return { lo: mid + 1, hi: state.hi, asked };
    case "tie":
      return { lo: mid, hi: mid, asked };
  }
}

/** Final insertion index once the comparison is done. */
export function insertionIndex(state: ComparisonState): number {
  return state.lo;
}

export function maxComparisons(listLength: number): number {
  return listLength <= 0 ? 0 : Math.ceil(Math.log2(listLength + 1));
}

/**
 * How a score you gave something directly combines with the score rolled up
 * from its parts (a season's ranked episodes, a show's seasons):
 * - "direct": your own ranking wins; the roll-up only fills in what you haven't ranked.
 * - "parts": once there's a roll-up, it replaces your direct ranking.
 * - "blend": halfway between the two.
 */
export const ROLLUP_RULE: "direct" | "parts" | "blend" = "direct";

/** Mean of some scores to one decimal, or null when there are none. */
export function averageScore(scores: readonly number[]): number | null {
  if (scores.length === 0) return null;
  return round1(scores.reduce((sum, s) => sum + s, 0) / scores.length);
}

/** The score to show for something you may have ranked directly and/or through its parts. */
export function combineScores(direct: number | null, rolledUp: number | null): number | null {
  if (direct === null) return rolledUp;
  if (rolledUp === null) return direct;
  switch (ROLLUP_RULE) {
    case "direct":
      return direct;
    case "parts":
      return rolledUp;
    case "blend":
      return round1((direct + rolledUp) / 2);
  }
}

/** The reaction tier a score falls in, for colouring rolled-up scores. */
export function tierForScore(score: number): Tier {
  if (score >= TIER_RANGES.liked.min) return "liked";
  if (score >= TIER_RANGES.fine.min) return "fine";
  return "disliked";
}

/**
 * A Letterboxd or Goodreads star rating (½ to 5 stars) as an Encore reaction and
 * a first guess at a score: the stars doubled onto the 0–10 scale, in the tier
 * that score falls in. So 3½★ and up is "liked", 2–3★ is "fine", and 1½★ or less
 * is "didn't like it". The guess only decides where an imported title starts in
 * its list; its real score comes from its place there, like any other ranking.
 */
export function scoreFromStars(stars: number): { tier: Tier; score: number } {
  const score = round1(Math.min(10, Math.max(0.5, stars) * 2));
  return { tier: tierForScore(score), score };
}

/**
 * Where an imported title rated `stars` can go in a list (best → worst) without
 * comparing it to anything you rated more or fewer stars: below the last title
 * with more stars, above the first with fewer. `listStars` holds each title's
 * imported stars, or null for one you ranked in Encore, which it's always
 * compared against. If you've since moved titles out of star order, the range
 * closes up rather than turning inside out.
 */
export function starBounds(stars: number, listStars: readonly (number | null)[]): { lo: number; hi: number } {
  let lo = 0;
  listStars.forEach((s, i) => {
    if (s !== null && s > stars) lo = i + 1;
  });
  const below = listStars.findIndex((s) => s !== null && s < stars);
  const hi = below < 0 ? listStars.length : below;
  return { lo, hi: Math.max(lo, hi) };
}
