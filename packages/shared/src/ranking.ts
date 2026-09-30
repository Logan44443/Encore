import { TIER_RANGES, type Tier } from "./constants";

/**
 * Score for the item at `index` (0 = best) in a tier list of length `n`.
 * The API mirrors this formula in SQL; keep them in sync.
 */
export function scoreFor(tier: Tier, index: number, n: number): number {
  const { min, max } = TIER_RANGES[tier];
  if (n <= 0) return max;
  return Math.round((min + ((max - min) * (n - index)) / n) * 10) / 10;
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
