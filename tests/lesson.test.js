import test from "node:test";
import assert from "node:assert/strict";
import { lessonProgress, LESSON_STEPS } from "../src/lesson.js";

const base = () => ({
  tool: "inspect", cut: 0, cutOpen: false, available: [],
  pieces: { section: {}, "layer-0": {}, "layer-1": {}, epidermis: {} },
});
const step = (state, inspected) => LESSON_STEPS[lessonProgress(state, inspected).current]?.id ?? "done";

test("fresh bench starts at the scalpel step", () => {
  assert.equal(step(base()), "scalpel");
});

test("incision step reports cut percentage", () => {
  const s = { ...base(), tool: "scalpel", cut: 0.43 };
  assert.equal(step(s), "incision");
  assert.match(lessonProgress(s).steps[1].detail, /43% done/);
});

test("switching tools after a milestone does not send the learner back", () => {
  const s = { ...base(), tool: "inspect", cut: 1, cutOpen: true };
  s.pieces.section = { detached: true };
  s.available = [{ id: "section" }, { id: "layer-0" }];
  assert.equal(step(s), "layer-0");
});

test("undoing the incision moves the lesson back to cutting", () => {
  const s = { ...base(), tool: "hand", cut: 0.3, cutOpen: false };
  assert.equal(step(s), "incision");
});

test("lesson completes only after the epidermis is inspected", () => {
  const s = { ...base(), tool: "hand", cut: 1, cutOpen: true, available: [{ id: "layer-0" }] };
  for (const id of ["section", "layer-0", "layer-1", "epidermis"]) s.pieces[id] = { detached: true };
  assert.equal(step(s), "microscope");
  assert.equal(step(s, new Set(["layer-0"])), "microscope");
  const done = lessonProgress(s, new Set(["epidermis"]));
  assert.equal(done.complete, true);
  assert.ok(done.steps.every((x) => x.done));
});

test("mouse mode offers the gesture alternative; webcam mode leads with it", () => {
  const mouse = lessonProgress(base()).steps[0];
  assert.match(mouse.detail, /Press S/);
  assert.match(mouse.alternative, /index finger/);
  const webcam = lessonProgress(base(), new Set(), "webcam").steps[0];
  assert.match(webcam.detail, /index finger/);
  assert.equal(webcam.alternative, null);
  assert.match(lessonProgress({ ...base(), cut: 0.5 }, new Set(), "webcam").steps[1].detail, /50% done/);
});

test("every step has both mouse and gesture wording", () => {
  for (const step of LESSON_STEPS) assert.ok(step.detail && step.gesture, step.id);
});
