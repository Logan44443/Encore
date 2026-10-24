import assert from "node:assert/strict";
import { test } from "node:test";
import { isOffensiveName, isOffensiveText } from "./moderation";

test("slurs in reviews are caught, including stretched and leet spellings", () => {
  assert.equal(isOffensiveText("what a bunch of faggots"), true);
  assert.equal(isOffensiveText("the villain is a total r3t4rd."), true);
  assert.equal(isOffensiveText("Ka-ike? no: k.i.k.e"), true);
  assert.equal(isOffensiveText("niiiggerrr"), true);
});

test("ordinary prose isn't flagged", () => {
  assert.equal(isOffensiveText("Shot on location in Nigeria, then Scunthorpe."), false);
  assert.equal(isOffensiveText("A chilling look at Hitler's last days in the bunker."), false);
  assert.equal(isOffensiveText("The one chink in its armour is the pacing."), false);
  assert.equal(isOffensiveText("Flame retardant suits, retarded pacing aside, great stunts"), false);
  assert.equal(isOffensiveText("I'd give it 4/5, sauce and spice 10/10"), false);
});

test("words run together across spaces only count for names", () => {
  assert.equal(isOffensiveText("hit lerner"), false);
  assert.equal(isOffensiveName("hit ler"), true);
});
