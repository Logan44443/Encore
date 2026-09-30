import assert from "node:assert/strict";
import { test } from "node:test";
import {
  answerComparison,
  insertionIndex,
  maxComparisons,
  nextComparisonIndex,
  scoreFor,
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
  assert.equal(scoreFor("liked", 0, 1), 10);
  assert.ok(scoreFor("liked", 9, 10) >= 6.8);
  assert.ok(scoreFor("fine", 0, 5) <= 6.7);
  assert.ok(scoreFor("disliked", 0, 3) <= 3.4);
});
