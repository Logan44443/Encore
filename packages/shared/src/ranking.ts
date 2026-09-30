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
