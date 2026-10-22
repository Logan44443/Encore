import assert from "node:assert/strict";
import { test } from "node:test";
import {
  answerComparison,
  averageScore,
  combineScores,
  insertionIndex,
  maxComparisons,
  nextComparisonIndex,
  scoreFromStars,
  scoreList,
  startComparison,
  tierForScore,
} from "./ranking";
import { TIER_RANGES } from "./constants";

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

test("roll-ups: averages, direct ranking wins, tiers from scores", () => {
  assert.equal(averageScore([]), null);
  assert.equal(averageScore([8, 9, 7.5]), 8.2);
  assert.equal(combineScores(null, null), null);
  assert.equal(combineScores(null, 7.6), 7.6);
  assert.equal(combineScores(9.1, null), 9.1);
  assert.equal(combineScores(9.1, 7.6), 9.1);
  assert.equal(tierForScore(6.8), "liked");
  assert.equal(tierForScore(6.7), "fine");
  assert.equal(tierForScore(3.4), "disliked");
});

test("scoreFromStars doubles Letterboxd stars and keeps every score inside its tier", () => {
  assert.deepEqual(scoreFromStars(5), { tier: "liked", score: 10 });
  assert.deepEqual(scoreFromStars(3.5), { tier: "liked", score: 7 });
  assert.deepEqual(scoreFromStars(3), { tier: "fine", score: 6 });
  assert.deepEqual(scoreFromStars(2), { tier: "fine", score: 4 });
  assert.deepEqual(scoreFromStars(1.5), { tier: "disliked", score: 3 });
  assert.deepEqual(scoreFromStars(0.5), { tier: "disliked", score: 1 });
  for (let stars = 0.5; stars <= 5; stars += 0.5) {
    const { tier, score } = scoreFromStars(stars);
    assert.ok(score >= TIER_RANGES[tier].min && score <= TIER_RANGES[tier].max, `${stars}★ → ${score} outside ${tier}`);
  }
});
