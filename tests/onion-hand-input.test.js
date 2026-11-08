import test from "node:test";
import assert from "node:assert/strict";
import { OnionHandInput } from "../src/onion-hand-input.js";
function hand(kind = "point", x = 0.45, y = 0.24) {
  const p = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.45, z: 0 }));
  p[0] = { x: 0.5, y: 0.65, z: 0 };
  p[9] = { x: 0.5, y: 0.45, z: 0 };
  p[4] = { x: 0.2, y: 0.4, z: 0 };
  for (let j = 0; j < 4; j++) p[5 + j] = { x: 0.45, y: 0.45 - j * 0.07, z: 0 };
  if (kind === "pinch") p[4] = { ...p[8] };
  if (kind === "open")
    for (let j = 0; j < 4; j++)
      p[9 + j] = { x: 0.52, y: 0.45 - j * 0.07, z: 0 };
  return p.map((p) => ({ x: p.x + x - 0.45, y: p.y + y - 0.24, z: p.z }));
}
const result = (p) => ({
  landmarks: [p],
  worldLandmarks: [p],
  handedness: [[{ categoryName: "Left" }]],
});
test("recognized gestures use bounded, mirrored onion coordinates with source ownership", () => {
  const events = [],
    input = new OnionHandInput((type, detail) => events.push({ type, detail }));
  input.update(result(hand()), 0);
  input.update(result(hand()), 310);
  const cut = events.find((e) => e.type === "input:cutstart");
  assert(cut);
  assert.equal(cut.detail.source, "webcam");
  assert(Math.abs(cut.detail.x - 0.575) < 1e-6);
  input.update(result(hand("pinch", 0.01, 0.98)), 400);
  const grab = events.find((e) => e.type === "input:pinchstart");
  assert.equal(grab.detail.x, 1);
  assert.equal(grab.detail.y, 1);
  assert.equal(events.filter((e) => e.type === "input:cutend").length, 1);
});
test("missing or malformed observations release an action exactly once", () => {
  const events = [],
    input = new OnionHandInput((type, detail) => events.push({ type, detail }));
  input.update(result(hand("pinch")), 0);
  input.update({ landmarks: [[{ x: NaN, y: 0 }]] }, 33);
  input.reset();
  assert.equal(events.filter((e) => e.type === "input:pinchend").length, 1);
  assert(events.some((e) => e.type === "input:move" && e.detail.lost));
});
test("two hands zoom without starting a cut and a pinch takes priority over zoom", () => {
  const events = [],
    input = new OnionHandInput((type, detail) => events.push({ type, detail }));
  const two = (gap, kind = "open") => ({
    landmarks: [hand(kind, 0.5 - gap), hand("open", 0.5 + gap)],
    handedness: [[{ categoryName: "Left" }], [{ categoryName: "Right" }]],
  });
  input.update(two(0.1), 0);
  input.update(two(0.2), 50);
  assert(events.some((e) => e.type === "input:zoom" && e.detail.delta > 0));
  assert(!events.some((e) => e.type === "input:cutstart"));
  assert.equal(input.update(two(0.2, "pinch"), 100).mode, "hand");
});
