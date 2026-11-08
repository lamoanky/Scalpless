import { chromium } from "playwright";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile, rename } from "node:fs/promises";
const check = process.argv.includes("--check");
await mkdir("output", { recursive: true });
const chromePath =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(chromePath) ? { executablePath: chromePath } : {}),
});
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: process.env.HIGH_RES ? 2 : 1,
  reducedMotion: "reduce",
  ...(!check
    ? {
        recordVideo: {
          dir: "output/video",
          size: { width: 1600, height: 1000 },
        },
      }
    : {}),
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const url = process.env.PREVIEW_URL || "http://127.0.0.1:5173";
await page.goto(url);
await page.waitForFunction(
  () => document.documentElement.dataset.ready === "true",
);
await page.waitForTimeout(800);
const debug = () => page.evaluate(() => window.__scalpless.getDebug());
const tool = (id) => page.locator(`button[data-tool="${id}"]`).click();
const reset = () => page.locator("#reset").click();
const pause = (ms) => page.waitForTimeout(check ? Math.min(ms, 150) : ms);
const point = async (p) => page.mouse.move(p.x * 1600, p.y * 1000);
async function stroke(from, to, slow = false) {
  const { seam } = await debug();
  await point(seam[from]);
  await page.mouse.down();
  for (let i = from; i <= to; i++) {
    await point(seam[i]);
    if (slow && i % 3 === 0) await pause(28);
  }
  await page.mouse.up();
}
await page.screenshot({ path: "output/scalpless-bench.png" });
if (check) {
  await tool("scalpel");
  let d = await debug();
  await point(d.seam[0]);
  await page.mouse.click(d.seam[0].x * 1600, d.seam[0].y * 1000);
  await page.mouse.click(d.seam[96].x * 1600, d.seam[96].y * 1000);
  assert(
    (await debug()).state.cut < 0.04,
    "Endpoint clicks must not complete incision",
  );
  await reset();
  await tool("scalpel");
  await stroke(0, 32);
  const partial = (await debug()).state.cut;
  assert(partial > 0.25 && partial < 0.5, "Partial stroke retained");
  await stroke(0, 32);
  assert.equal(
    (await debug()).state.cut,
    partial,
    "Repeated stroke must not inflate coverage",
  );
  await page.mouse.click(60, 350);
  assert.equal(
    (await debug()).state.cut,
    partial,
    "Invalid contact must not cut",
  );
  d = await debug();
  await point(d.seam[45]);
  await page.mouse.down();
  await point(d.seam[52]);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.up();
  assert.equal(
    (await debug()).state.cut,
    partial,
    "Interrupted drag restores previous operation",
  );
  await page.mouse.move(900, 350);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(980, 380, { steps: 10 });
  await page.mouse.up({ button: "right" });
  assert.equal((await debug()).state.cut, partial, "Camera must not cut");
  await page.locator("#home-view").click();
  await stroke(25, 96);
  assert((await debug()).state.cutOpen, "Stroke coverage opens section");
  await page.locator("#undo").click();
  assert.equal((await debug()).state.cut, partial);
  await stroke(25, 96);
} else {
  await pause(1100);
  await tool("scalpel");
  await page.locator("#hints").click();
  await pause(500);
  await stroke(0, 44, true);
  await pause(700);
  await stroke(35, 96, true);
  await pause(850);
}
await tool("hand");
// Real pointer ray casting selects and carries the cut section.
let d = await debug(),
  grasp = d.graspPoints.section;
await point(grasp);
await page.mouse.down();
assert.equal((await debug()).state.held, "section");
await page.mouse.move(grasp.x * 1600 + 250, grasp.y * 1000 - 20, { steps: 30 });
await pause(500);
await page.mouse.up();
assert((await debug()).state.pieces.section.detached);
assert((await debug()).state.available.some((p) => p.id === "layer-0"));
// The accessible place operation uses the same held body and physics release.
await page.locator("#piece-select").selectOption("section");
await page.locator("#primary-action").click();
await page.locator("#place-action").click();
await page.waitForTimeout(1500);
assert(
  (await debug()).positions.section[1] > 0.005,
  "Section remains above the tray",
);
await page.screenshot({ path: "output/scalpless-cutaway.png" });
await page.locator("#piece-select").selectOption("layer-0");
d = await debug();
grasp = d.graspPoints["layer-0"];
await point(grasp);
await page.mouse.down();
assert.equal(
  (await debug()).state.held,
  "layer-0",
  "Visible edge must be graspable",
);
await page.mouse.move(grasp.x * 1600 - 80, grasp.y * 1000 - 15, { steps: 22 });
await pause(600);
const bent = (await debug()).state.pieces["layer-0"].bend;
assert(bent > 0.1 && bent < 1, "Pull deforms attached skin");
await page.mouse.move(grasp.x * 1600 - 25, grasp.y * 1000 - 5, { steps: 14 });
assert(
  (await debug()).state.pieces["layer-0"].bend < bent,
  "Returning the pointer relaxes tissue",
);
await page.mouse.move(grasp.x * 1600 - 95, grasp.y * 1000 - 20, { steps: 20 });
await pause(500);
await page.screenshot({ path: "output/scalpless-peeling.png" });
await page.mouse.up();
assert(!(await debug()).state.pieces["layer-0"].detached);
if (check) {
  await page.locator("#undo").click();
  assert.equal((await debug()).state.pieces["layer-0"].separation, 0);
}
await page.locator("#primary-action").click();
while (!(await debug()).state.pieces["layer-0"].detached)
  await page.locator("#primary-action").click();
await page.keyboard.press("e");
await page.keyboard.press("PageUp");
await pause(400);
await page.locator("#place-action").click();
await page.waitForTimeout(1200);
assert((await debug()).state.available.some((p) => p.id === "layer-1"));
await page.screenshot({ path: "output/scalpless-dissection.png" });
if (check) {
  await page.locator("#piece-select").selectOption("layer-1");
  await page.locator("#primary-action").focus();
  await page.keyboard.press("Enter");
  while (!(await debug()).state.pieces["layer-1"].detached)
    await page.keyboard.press("Enter");
  await page.locator("#place-action").focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1000);
  assert((await debug()).state.available.some((p) => p.id === "epidermis"));
  await page.locator("#piece-select").selectOption("epidermis");
  await page.locator("#primary-action").click();
  while (!(await debug()).state.pieces.epidermis.detached)
    await page.locator("#primary-action").click();
  await page.locator("#place-action").click();
  await page.waitForTimeout(1500);
  assert(
    (await debug()).positions.epidermis[1] > -0.04,
    "Epidermis stays on bench",
  );
  await page.screenshot({ path: "output/scalpless-epidermis.png" });
  // Multiple orbit angles expose the capped surfaces for visual review.
  await tool("inspect");
  await page.locator("#scene").focus();
  for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight");
  await page.screenshot({ path: "output/scalpless-reverse.png" });
  for (let i = 0; i < 24; i++) await page.keyboard.press("ArrowRight");
  await page.screenshot({ path: "output/scalpless-back.png" });
  await page.locator("#home-view").click();
  // Piece release beyond the tray falls onto the physical bench, not into space.
  await tool("hand");
  await page.locator("#piece-select").selectOption("section");
  await page.locator("#primary-action").click();
  for (let i = 0; i < 28; i++) await page.keyboard.press("ArrowLeft");
  for (let i = 0; i < 25; i++) await page.keyboard.press("ArrowDown");
  await page.locator('[data-move="release"]').click();
  await page.waitForTimeout(1800);
  assert((await debug()).positions.section[1] > -0.05);
  await page.locator("#primary-action").click();
  await reset();
  d = await debug();
  assert.equal(d.state.held, null);
  assert.equal(d.state.cut, 0);
  assert.equal(d.state.undo, 0);
  assert.equal(d.physicsBodies, 0);
  assert(Object.values(d.state.pieces).every((p) => !p.detached));
  // Keyboard-only completion of incision, section lift, placement and reset.
  await page.keyboard.press("s");
  await page.locator("#primary-action").focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__scalpless.getDebug().state.cutOpen);
  await page.keyboard.press("h");
  await page.locator("#primary-action").focus();
  await page.keyboard.press("Enter");
  assert.equal((await debug()).state.held, "section");
  await page.locator("#place-action").focus();
  await page.keyboard.press("Enter");
  await reset();
  await page.setViewportSize({ width: 800, height: 500 });
  await page.waitForTimeout(300);
  const undersized = await page.locator("button:visible").evaluateAll((bs) =>
    bs
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width < 47.9 || r.height < 47.9;
      })
      .map((b) => b.id),
  );
  assert.deepEqual(undersized, []);
  await page.screenshot({ path: "output/scalpless-small-viewport.png" });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.locator("#home-view").click();
  await page.waitForTimeout(3200);
} else {
  await tool("inspect");
  await page.locator("#hints").click();
  await pause(2500);
}
const result = await debug();
assert.deepEqual(errors, [], "No browser errors");
await writeFile(
  check ? "output/validation.json" : "output/walkthrough-validation.json",
  JSON.stringify(
    {
      checked: check,
      url,
      errors,
      fps: result.fps,
      manipulationFps: result.manipulationFps,
      drawCalls: result.drawCalls,
      triangles: result.triangles,
      cut: result.state.cut,
      physicsBodies: result.physicsBodies,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    result: check ? "Interaction checks passed" : "Walkthrough recorded",
    fps: result.fps,
    manipulationFps: result.manipulationFps,
    drawCalls: result.drawCalls,
    errors,
  }),
);
const video = page.video();
await context.close();
if (video)
  await rename(await video.path(), "output/scalpless-walkthrough.webm");
await browser.close();
