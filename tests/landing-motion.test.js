import test from "node:test";
import assert from "node:assert/strict";
import { landingFrame } from "../src/landing-motion.js";

test("scroll continuously shrinks the onion and completes two turns", () => {
  let previous = landingFrame(0);
  for (let i = 1; i <= 1000; i++) {
    const next = landingFrame(i / 1000);
    assert(next.height <= previous.height && next.height > 0);
    assert(next.rotation >= previous.rotation);
    assert(Math.abs(next.panels.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    previous = next;
  }
  assert(
    Math.abs(
      landingFrame(1).rotation - landingFrame(0).rotation - Math.PI * 4,
    ) < 1e-9,
  );
});
test("reverse scroll restores the exact pose and sections remain bounded", () => {
  const pose = landingFrame(0.37);
  landingFrame(0.98);
  assert.deepEqual(landingFrame(0.37), pose);
  assert.deepEqual(landingFrame(-1), landingFrame(0));
  assert.deepEqual(landingFrame(9), landingFrame(1));
  assert.equal(landingFrame(0.5).active, 1);
  assert.equal(landingFrame(1).active, 2);
});
test("reduced motion freezes the model while keeping all content reachable", () => {
  const pose = landingFrame(0, { still: true });
  for (const p of [0.25, 0.5, 0.75, 1]) {
    const f = landingFrame(p, { still: true });
    for (const k of ["height", "rotation", "x", "y"])
      assert.equal(f[k], pose[k]);
  }
  assert.equal(landingFrame(1, { still: true }).active, 2);
});
test("narrow viewport keeps the final model inside its specimen card", () => {
  const f = landingFrame(1, { mobile: true, aspect: 390 / 844 });
  assert(f.y - f.height / 2 > 0.51);
  assert(f.y + f.height / 2 < 0.87);
  assert(f.x > 0.4 && f.x < 0.84);
});
