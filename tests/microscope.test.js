import test from "node:test";
import assert from "node:assert/strict";
import { fieldOfView, scaleBar, tissueFor, paintField, MAGNIFICATIONS } from "../src/microscope.js";

test("field of view shrinks with magnification", () => {
  assert.equal(fieldOfView(40), 4500);
  assert.equal(fieldOfView(400), 450);
});

test("scale bar is a round length near a fifth of the field", () => {
  assert.equal(scaleBar(4500), 1000);
  assert.equal(scaleBar(1800), 250);
  assert.equal(scaleBar(450), 100);
});

test("every pickable onion part maps to a tissue", () => {
  for (const id of ["section", "epidermis", "core", "layer-0", "layer-7"])
    assert.ok(tissueFor(id).caption.length > 20, id);
  assert.equal(tissueFor("epidermis").kind, "epidermis");
  assert.equal(tissueFor("layer-3").kind, "fleshy");
  assert.ok(tissueFor("layer-7").profile.gx < tissueFor("layer-0").profile.gx);
});

test("painted field is opaque, black outside the eyepiece, and shows cell walls", () => {
  const size = 96, data = new Uint8ClampedArray(size * size * 4);
  for (const mag of MAGNIFICATIONS) {
    paintField(data, size, { tissue: tissueFor("epidermis"), mag, stain: "iodine", panX: 0, panY: 0 });
    assert.equal(data[3], 255);
    assert.ok(data[0] < 20, "corner is outside the circular field");
    const centre = (size / 2) * size + size / 2;
    const tones = new Set();
    for (let x = 0; x < size; x++) tones.add(data[((size / 2) * size + x) * 4] >> 4);
    assert.ok(tones.size > 3, `field has contrast at ${mag}×`);
    assert.ok(data[centre * 4] > 40);
  }
});
