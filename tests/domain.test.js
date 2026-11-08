import test from "node:test";
import assert from "node:assert/strict";
import { CutCoverage, OperationHistory, INPUT_EVENTS } from "../src/domain.js";

test("short strokes accumulate, repeated strokes do not inflate coverage", () => {
  const cut = new CutCoverage();
  for (let i = 0; i < 32; i++) cut.add(i / 96);
  cut.endStroke();
  const first = cut.fraction;
  for (let i = 0; i < 32; i++) cut.add(i / 96);
  assert.equal(cut.fraction, first);
  assert.equal(first, 1 / 3);
  cut.endStroke();
  for (let i = 32; i < 88; i++) cut.add(i / 96);
  assert.equal(cut.complete, true);
});
test("endpoint clicks and large jumps cannot cut the middle", () => {
  const cut = new CutCoverage();
  cut.add(0);
  cut.add(1);
  assert.equal(cut.fraction, 2 / 96);
  assert.equal(cut.complete, false);
});
test("invalid contact and releasing break stroke interpolation", () => {
  const cut = new CutCoverage();
  cut.add(0);
  cut.add(0.01, false);
  cut.add(0.06);
  assert.equal(cut.fraction, 2 / 96);
  cut.endStroke();
  cut.add(0.1);
  assert.equal(cut.fraction, 3 / 96);
  cut.add(NaN);
  cut.add(-0.1);
  cut.add(1.1);
  assert.equal(cut.fraction, 3 / 96);
});
test("the supported seam requires at least ninety percent", () => {
  const cut = new CutCoverage(100);
  for (let i = 0; i < 89; i++) cut.add((i + 0.1) / 100);
  assert.equal(cut.complete, false);
  cut.add(0.891);
  assert.equal(cut.complete, true);
});
test("snapshots restore cut coverage without linking separate operations", () => {
  const cut = new CutCoverage();
  cut.add(0.1);
  const snap = cut.snapshot();
  cut.add(0.5);
  cut.restore(snap);
  assert.equal(cut.fraction, 1 / 96);
  assert.equal(cut.last, null);
  cut.reset();
  assert.equal(cut.fraction, 0);
});
test("undo snapshots are isolated and bounded", () => {
  const history = new OperationHistory(2),
    snapshot = { pieces: { skin: { bend: 0.2 } } };
  history.push(snapshot);
  snapshot.pieces.skin.bend = 0.9;
  assert.equal(history.pop().pieces.skin.bend, 0.2);
  history.push({ n: 1 });
  history.push({ n: 2 });
  history.push({ n: 3 });
  assert.equal(history.size, 2);
  assert.equal(history.pop().n, 3);
  assert.equal(history.pop().n, 2);
  assert.equal(history.pop(), null);
});
test("the six integration event names remain unchanged", () => {
  assert.deepEqual(INPUT_EVENTS, [
    "input:move",
    "input:pinchstart",
    "input:pinchend",
    "input:cutstart",
    "input:cutend",
    "input:zoom",
  ]);
});
