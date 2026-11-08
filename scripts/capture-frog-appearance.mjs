import { mockTutor } from "./mock-tutor.mjs";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const out = "output/frog-appearance";
await mkdir(out, { recursive: true });
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce",
  deviceScaleFactor: Number(process.env.CAPTURE_DPR || 1),
});
const errors = [], warnings = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => {
  if (m.type() === "error") errors.push(m.text());
  if (m.type() === "warning" && /WebGL|shader|texture|framebuffer/i.test(m.text())) warnings.push(m.text());
});
const debug = () => page.evaluate(() => window.__scalpless.getDebug());
const tool = id => page.locator(`[data-tool="${id}"]`).click();
const shot = async name => {
  await page.mouse.move(1560, 100);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${name}.png` });
};
const choose = async id => {
  await page.locator("#piece-menu").click();
  await page.locator(`[data-piece="${id}"]`).click();
};
try {
await mockTutor(page);
  await page.goto(`${process.env.PREVIEW_URL || "http://127.0.0.1:5173"}/lab.html?specimen=frog`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
  await page.waitForTimeout(1500);
  await shot("intact");
  await page.locator("#scene").focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("+");
  await shot("intact-closeup");
  // Reference orientation uses the existing orbit keys, not a special camera.
  for (let i = 0; i < 3; i++) await page.keyboard.press("-");
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowUp");
  for (let i = 0; i < 23; i++) await page.keyboard.press("ArrowRight");
  await shot("intact-reference-angle");
  await page.locator("#camera-angles").click();
  await page.locator("#home-view").click();
  await page.locator("#anatomy-view").click();
  await shot("translucent");
  await page.locator("#anatomy-view").click();
  await tool("scalpel");
  await page.locator("#primary-action").click();
  await page.waitForFunction(() => window.__scalpless.getDebug().state.cutOpen);
  await tool("hand");
  await page.locator("#primary-action").click();
  await page.locator("#place-action").click();
  await page.waitForTimeout(1000);
  await tool("inspect");
  await shot("open");
  await page.locator("#scene").focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press("+");
  await shot("detail-closeup");
  await page.locator("#camera-angles").click();
  await page.locator("#home-view").click();
  await page.locator("#scene").focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await shot("oblique");
  await page.locator("#scene").focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowUp");
  await shot("top");
  // Restore the exact working camera through the existing UI.
  await page.locator("#camera-angles").click();
  await page.locator("#home-view").click();
  await page.waitForTimeout(3500);
  const idle = await debug();
  await tool("hand");
  await choose("liver");
  await page.locator("#primary-action").click();
  assert.equal((await debug()).state.held, "liver");
  // Held tissue follows the same keyboard operations; exercise changing contact shadows.
  await page.locator("#scene").focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press("PageUp");
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press(i % 2 ? "q" : "e");
    await page.waitForTimeout(250);
  }
  // Read timing before PNG capture: high-DPI image encoding stalls Chromium
  // and would contaminate the app's rolling frame-time window.
  await page.waitForTimeout(3500);
  const held = await debug();
  await shot("held-liver");
  await page.locator("#place-action").click();
  await page.waitForTimeout(1000);
  await tool("inspect");
  await shot("deep-organs");
  // Build a separate specimen solely for geometry and material inspection.
  const { inventory, textures } = await page.evaluate(async () => {
    const { createFrog } = await import("/src/specimens/frog.js");
    const frog = await createFrog({ add() {} });
    const rows = [];
    for (const part of frog.parts.values()) for (const [index, mesh] of part.group.children.entries()) {
      const m = mesh.material;
      rows.push({ group: part.group.name, index, name: mesh.name,
        type: m.type, uv: !!mesh.geometry.attributes.uv,
        roughness: m.roughness, clearcoat: m.clearcoat, transmission: m.transmission,
        vertices: mesh.geometry.attributes.position.count,
        mapSize: m.map ? [m.map.image.width, m.map.image.height] : null });
    }
    // Check the browser-decoded data, not just PNG dimensions on disk. Packing
    // data into transparent pixels can silently destroy fine detail on decode.
    const textures = [];
    for (const name of ["exterior", "organ", "membrane", "muscle", "lung", "liver", "digestive", "vascular"]) {
      const img = new Image();
      img.src = `/textures/frog/${name}-detail.png`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      textures.push({ name, size: [img.width, img.height],
        pixel: [...ctx.getImageData(0, 0, 1, 1).data] });
    }
    return { inventory: rows, textures };
  });
  assert.equal(inventory.length, 27);
  assert(inventory.every(m => m.uv && m.type === "MeshPhysicalMaterial"));
  assert(inventory.every(m => !m.mapSize || Math.max(...m.mapSize) <= 2048));
  assert(textures.every(t => Math.max(...t.size) <= 2048 && t.pixel[0] > 0 && t.pixel[1] > 0 && t.pixel[3] === 255));
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  const report = { errors, warnings, idleFps: idle.fps, heldFps: held.fps,
    manipulationFps: held.manipulationFps, drawCalls: held.drawCalls, inventory, textures };
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, inventory: `${inventory.length} physical meshes, all with UVs` }));
} finally {
  await browser.close();
}
