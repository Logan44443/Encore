import assert from "node:assert/strict";
import { test } from "node:test";
import {
  answerComparison,
  insertionIndex,
  maxComparisons,
  nextComparisonIndex,
  scoreList,
  startComparison,
} from "./ranking";

function rank(list: number[], value: number) {
  let state = startComparison(list.length);
  let idx: number | null;
  while ((idx = nextComparisonIndex(state)) !== null) {
    state = answerComparison(state, value > list[idx] ? "new" : "existing");
  }
  return { index: insertionIndex(state), asked: state.asked };
}

test("binary insertion finds the correct slot in a best→worst list", () => {
  const list = [90, 80, 70, 60, 50, 40, 30];
  assert.equal(rank(list, 95).index, 0);
  assert.equal(rank(list, 65).index, 3);
  assert.equal(rank(list, 10).index, 7);
  assert.equal(rank([], 50).index, 0);
});

test("question count is logarithmic", () => {
  const list = Array.from({ length: 100 }, (_, i) => 1000 - i);
  const { asked } = rank(list, 500);
  assert.ok(asked <= maxComparisons(list.length));
});

test("scores stay inside tier ranges", () => {
  const ten = Array<null>(10).fill(null);
  assert.ok(scoreList("liked", ten).every((x) => x >= 6.8 && x <= 10));
  assert.ok(scoreList("fine", ten).every((x) => x >= 3.5 && x <= 6.7));
  assert.ok(scoreList("disliked", ten).every((x) => x >= 0 && x <= 3.4));
});

test("a lone title with no score set sits mid-tier, not at the top", () => {
  assert.deepEqual(scoreList("liked", [null]), [8.4]);
  assert.deepEqual(scoreList("liked", [null, null, null]), [9.2, 8.4, 7.6]);
});

test("set scores stay put and the rest fill in around them", () => {
  assert.deepEqual(scoreList("liked", [7.5]), [7.5]);
  assert.deepEqual(scoreList("liked", [9, 7.5]), [9, 7.5]);
  // One title ranked above a set 8.0 lands halfway to the top of the tier.
  assert.deepEqual(scoreList("liked", [null, 8]), [9, 8]);
  // Two titles between set scores of 9.4 and 7.0 split the gap evenly.
  assert.deepEqual(scoreList("liked", [9.4, null, null, 7]), [9.4, 8.6, 7.8, 7]);
  // Below the lowest set score, titles spread toward the bottom of the tier.
  assert.deepEqual(scoreList("liked", [8, null]), [8, 7.4]);
});

test("a set score out of order is clamped under the one above", () => {
  assert.deepEqual(scoreList("liked", [8, 9]), [8, 8]);
  assert.deepEqual(scoreList("fine", [9]), [6.7]);
});
