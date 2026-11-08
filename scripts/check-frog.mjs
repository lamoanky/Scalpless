import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";

const base = process.env.PREVIEW_URL || "http://127.0.0.1:5173/";
const url = new URL(`./lab.html?specimen=frog${process.env.FROG_APPEARANCE === "blue" ? "&appearance=blue" : ""}`, base).href;
const chrome =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(chrome) ? { executablePath: chrome } : {}),
});
const record = process.argv.includes("--record");
await mkdir("output", { recursive: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  reducedMotion: "reduce",
  ...(record
    ? {
        recordVideo: {
          dir: "output/frog-video",
          size: { width: 1280, height: 800 },
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
const debug = () => page.evaluate(() => window.__scalpless.getDebug());
const tool = (id) => page.locator(`[data-tool="${id}"]`).click();
const point = (p) => page.mouse.move(p.x * 1600, p.y * 1000);
const choose = async (id) => {
  await page.locator("#piece-menu").click();
  await page.locator(`[data-piece="${id}"]`).click();
};
const pause = (ms) => page.waitForTimeout(record ? ms : Math.min(ms, 150));
const stroke = async (from, to) => {
  const seam = (await debug()).seam;
  await point(seam[from]);
  await page.mouse.down();
  for (let i = from; i <= to; i++) await point(seam[i]);
  await page.mouse.up();
};
try {
  await page.goto(url);
  await page.waitForFunction(
    () => document.documentElement.dataset.ready === "true",
  );
  await page.waitForTimeout(800);
  assert.equal((await debug()).state.specimen, "frog");
  assert.deepEqual((await debug()).state.available, []);
  await page.screenshot({ path: "output/frog-intact.png" });
  const natural = (await debug()).state;
  const anatomy = page.getByRole("button", {
    name: "Translucent anatomy view",
  });
  await anatomy.focus();
  await page.keyboard.press("Space");
  assert.equal((await debug()).anatomyView, true);
  assert.equal(await anatomy.getAttribute("aria-pressed"), "true");
  assert.deepEqual(
    (await debug()).state,
    natural,
    "Anatomy view does not cut, detach or add undo history",
  );
  await page.waitForTimeout(600);
  await page.screenshot({ path: "output/frog-anatomy-view.png" });
  await anatomy.click();
  assert.equal((await debug()).anatomyView, false);
  await tool("hand");
  await page.mouse.click(800, 470);
  assert.equal(
    (await debug()).state.held,
    null,
    "An intact abdomen cannot be lifted",
  );
  await tool("scalpel");
  await page.mouse.move(1480, 200);
  await page.mouse.down();
  await page.mouse.move(1440, 260);
  await page.mouse.up();
  assert.equal((await debug()).state.cut, 0, "Air cannot cut");
  let seam = (await debug()).seam;
  for (const i of [0, 48, 96]) {
    await point(seam[i]);
    await page.mouse.down();
    await page.mouse.up();
  }
  assert(
    (await debug()).state.cut < 0.1,
    "Endpoint clicks cannot open the abdomen",
  );
  await page.locator("#reset").click();
  await tool("scalpel");
  await page.locator("#hints").click();
  await stroke(0, 36);
  const partial = (await debug()).state.cut;
  assert(
    partial > 0.2 && partial < 0.7,
    "A released stroke leaves a partial incision",
  );
  await pause(600);
  await stroke(0, 36);
  assert.equal(
    (await debug()).state.cut,
    partial,
    "Repeated strokes do not inflate coverage",
  );
  await anatomy.click();
  assert.equal(
    (await debug()).state.cut,
    partial,
    "Changing appearance preserves the partial cut",
  );
  await stroke(31, 96);
  await anatomy.click();
  assert(
    (await debug()).state.cutOpen,
    "The complete abdominal incision opens",
  );
  await tool("hand");
  let p = (await debug()).graspPoints.abdomen;
  await point(p);
  await page.mouse.down();
  assert.equal(
    (await debug()).state.held,
    "abdomen",
    "The visible panel can be grasped",
  );
  await page.mouse.move(p.x * 1600 - 230, p.y * 1000 - 115, { steps: 25 });
  await pause(600);
  await page.mouse.up();
  await page.waitForTimeout(1000);
  assert((await debug()).state.available.some((p) => p.id === "liver"));
  assert(
    !(await debug()).state.available.some((p) => p.id === "stomach"),
    "Deep organs remain gated by the liver",
  );
  // Undo restores the closed pose; keyboard placement uses the same state transitions.
  await page.locator("#undo").click();
  assert.deepEqual(
    (await debug()).state.available.map((p) => p.id),
    ["abdomen"],
  );
  await page.locator("#primary-action").focus();
  await page.keyboard.press("Enter");
  await page.locator("#place-action").click();
  await page.waitForTimeout(1000);
  await page.locator("#hints").click();
  await page.screenshot({ path: "output/frog-open.png" });
  await pause(1200);

  for (const id of [
    "liver",
    "heart",
    "lung-left",
    "lung-right",
    "stomach",
    "intestines",
  ]) {
    await choose(id);
    p = (await debug()).graspPoints[id];
    // Synthetic controller events use real ray contact, selection and physics.
    // No detector or physical-hand accuracy is claimed by this check.
    if (id === "heart") {
      await page.evaluate(
        (p) =>
          window.dispatchEvent(
            new CustomEvent("input:pinchstart", {
              detail: { ...p, mode: "hand" },
            }),
          ),
        p,
      );
    } else {
      await point(p);
      await page.mouse.down();
    }
    assert.equal(
      (await debug()).state.held,
      id,
      `${id} is accessible at its visible grasp point`,
    );
    assert.equal((await debug()).organStudy.id,id,"Every held organ has a study display");
    assert(await page.locator("#organ-slide").isVisible());
    if (id === "heart") {
      const held = (await debug()).state;
      await anatomy.click();
      assert.deepEqual(
        (await debug()).state,
        held,
        "Anatomy toggle preserves a controller-held organ",
      );
      await anatomy.click();
    }
    await page.keyboard.press("PageUp");
    await page.keyboard.press("e");
    if (id !== "heart")
      await page.mouse.move(p.x * 1600 - 300, p.y * 1000 - 85, { steps: 25 });
    else
      await page.evaluate(
        (p) =>
          window.dispatchEvent(
            new CustomEvent("input:move", {
              detail: { x: p.x - 0.2, y: p.y - 0.08, mode: "hand" },
            }),
          ),
        p,
      );
    await pause(450);
    if (id !== "heart") await page.mouse.up();
    else
      await page.evaluate(() =>
        window.dispatchEvent(new CustomEvent("input:pinchend", { detail: {} })),
      );
    await page.waitForTimeout(450);
    const dropped = await debug();
    assert.equal(dropped.organStudy.id,id,"Release keeps the last organ study open");
    assert.equal(dropped.organStudy.visible,true);
    assert(dropped.state.pieces[id].detached && dropped.state.pieces[id].collected);
    assert.equal(dropped.visibility[id],false);
    assert.equal(dropped.physicalPieces[id],undefined);
    assert(!dropped.state.available.some(p=>p.id===id));
    if (id === "liver")
      assert((await debug()).state.available.some((p) => p.id === "stomach"));
  }
  await page.waitForTimeout(1500);
  let state = await debug();
  assert.equal(state.physicsBodies, 1,"Only the released abdominal panel remains on the bench");
  for (const [id, bounds] of Object.entries(state.geometryBounds))
    if (state.visibility[id]) assert(bounds.min[1] > -0.007, `${id} geometry stays on the physical bench`);
  await tool("inspect");
  await page.screenshot({ path: "output/frog-dissected.png" });
  await page.locator("#scene").focus();
  for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight");
  await page.screenshot({ path: "output/frog-reverse.png" });
  await page.locator("#undo").click();
  assert(
    !(await debug()).state.pieces.intestines.detached,
    "Undo restores the last organ attachment",
  );
  await tool("hand");
  await choose("intestines");
  await page.locator("#primary-action").click();
  await page.keyboard.press("Escape");
  assert.equal((await debug()).state.held, null);
  await page.locator("#primary-action").click();
  await anatomy.click();
  await page.locator("#reset").click();
  state = await debug();
  assert.equal(state.anatomyView, false, "Reset restores natural skin");
  assert.equal(await anatomy.getAttribute("aria-pressed"), "false");
  assert.equal(state.state.cut, 0);
  assert.equal(state.physicsBodies, 0);
  assert.equal(state.state.held, null);
  assert(Object.values(state.state.pieces).every((p) => !p.detached));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await page.waitForFunction(
    () => document.documentElement.dataset.ready === "true",
  );
  await page.waitForTimeout(300);
  assert(
    await page.getByRole("link", { name: "Open onion dissection" }).isVisible(),
  );
  await page.screenshot({ path: "output/frog-mobile.png" });
  await Promise.all([
    page.waitForURL(/specimen=onion/),
    page.getByRole("link", { name: "Open onion dissection" }).click(),
  ]);
  await page.waitForFunction(
    () => document.documentElement.dataset.ready === "true" && window.__scalpless?.getDebug().state.specimen === "onion",
  );
  assert.equal(
    (await debug()).state.specimen,
    "onion",
    "The specimen switcher preserves the original lab",
  );
  assert.deepEqual(errors, []);
  const report = {
    url,
    errors,
    cut: partial,
    organs: 6,
    drawCalls: state.drawCalls,
    fps: state.fps,
    manipulationFps: state.manipulationFps,
  };
  await writeFile(
    "output/frog-validation.json",
    JSON.stringify(report, null, 2),
  );
  console.log("Frog checks passed", JSON.stringify(report));
} catch (error) {
  if (!page.isClosed()) {
    await writeFile("output/frog-failure.json", JSON.stringify({error:String(error),errors,url:page.url(),debug:await debug().catch(()=>null)}, null, 2));
    await page.screenshot({ path: "output/frog-failure.png" });
  }
  throw error;
} finally {
  const video = page.video();
  await context.close();
  if (video) await rename(await video.path(), "output/frog-walkthrough.webm");
  await browser.close();
}
