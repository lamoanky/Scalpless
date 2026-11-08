import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.PREVIEW_URL || "http://127.0.0.1:4173/";
const url = new URL("./lab.html", base).href;
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--use-fake-device-for-media-stream"],
});
const empty = { landmarks: [], worldLandmarks: [], handedness: [] };
function observation(kind, target = { x: 0.5, y: 0.5 }, label = "Left") {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.45, z: 0 }));
  points[0] = { x: 0.5, y: 0.65, z: 0 };
  points[9] = { x: 0.5, y: 0.45, z: 0 };
  points[4] = { x: 0.2, y: 0.4, z: 0 };
  for (let j = 0; j < 4; j++)
    points[5 + j] = { x: 0.45, y: 0.45 - j * 0.07, z: 0 };
  if (kind === "pinch") points[4] = { ...points[8] };
  if (kind === "open")
    for (let j = 0; j < 4; j++)
      points[9 + j] = { x: 0.52, y: 0.45 - j * 0.07, z: 0 };
  const image = points.map((p) => ({
    x: p.x + (1 - target.x) - 0.45,
    y: p.y + target.y - 0.24,
    z: 0,
  }));
  return {
    landmarks: [image],
    worldLandmarks: [points],
    handedness: [[{ categoryName: label }]],
  };
}
const errors = [];
function monitor(page) {
  page.on("pageerror", (e) => errors.push(e.message));
}
async function ready(page) {
  await page.goto(url);
  await page.waitForFunction(
    () => document.documentElement.dataset.ready === "true",
  );
}
async function start(page) {
  if (!(await page.locator("#hand-tracking-panel").isVisible()))
    await page.locator("#hand-tracking-open").click();
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await page.waitForFunction(
    () => window.__scalpless.getDebug().handTracking.running,
    null,
    { timeout: 90000 },
  );
}
const stub = `export async function loadHandTrackingModel(){ return {detectForVideo(){ if(window.__trackingQueue?.length) window.__trackingObservation=window.__trackingQueue.shift(); return window.__trackingObservation || {landmarks:[],worldLandmarks:[],handedness:[]}; },close(){}}; }`;
try {
  await mkdir("output", { recursive: true });
  // Load the actual production model and WASM with a browser-provided fake camera.
  const smoke = await browser.newContext({
    permissions: ["camera"],
    viewport: { width: 1600, height: 1000 },
  });
  const real = await smoke.newPage();
  monitor(real);
  const requests = [];
  real.on("request", (r) => requests.push(r.url()));
  await ready(real);
  assert.equal(
    await real.evaluate(
      () => window.__scalpless.getDebug().handTracking.liveTracks,
    ),
    0,
  );
  assert(
    !requests.some((u) => u.endsWith(".task")),
    "Camera model is lazy-loaded",
  );
  await start(real);
  await real.waitForTimeout(1500);
  assert(requests.some((u) => u.endsWith(".task")));
  assert(requests.some((u) => u.endsWith(".wasm")));
  assert(
    requests.every((u) => u.startsWith(new URL(base).origin)),
    "Tracking assets stay local",
  );
  await real.screenshot({ path: "output/scalpless-hand-tracking.png" });
  await real.getByRole("button", { name: "Stop camera", exact: true }).click();
  assert.equal(
    await real.evaluate(
      () => window.__scalpless.getDebug().handTracking.liveTracks,
    ),
    0,
  );
  await smoke.close();

  // Replace only detector output, not the adapter, input events, ray contact,
  // cutting/peeling state, rendering, camera stream, or release physics.
  const context = await browser.newContext({
    permissions: ["camera"],
    viewport: { width: 1600, height: 1000 },
  });
  await context.route(/\/assets\/hand-tracking-model-[^/]+\.js$/, (route) =>
    route.fulfill({ body: stub, contentType: "text/javascript" }),
  );
  const page = await context.newPage();
  monitor(page);
  await ready(page);
  const debug = () => page.evaluate(() => window.__scalpless.getDebug());
  const frame = async (value) => {
    await page.evaluate((v) => {
      window.__trackingQueue = [];
      window.__trackingObservation = v;
    }, value);
    await page.waitForTimeout(150);
  };
  const sequence = async (values) => {
    await page.evaluate((v) => {
      window.__trackingQueue = v;
    }, values);
    await page.waitForFunction(
      () => window.__trackingQueue.length === 0,
      null,
      { timeout: 30000 },
    );
    await page.waitForTimeout(150);
  };
  await page.locator("#hand-tracking-open").click();
  await page.locator("#tracking-gain").evaluate((e) => {
    e.value = "1";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await start(page);
  const initial = await debug();
  async function stroke(from, to) {
    const seam = (await debug()).seam;
    const frames = Array.from({ length: 10 }, () =>
      observation("point", seam[from]),
    );
    for (let i = from; i <= to; i++)
      frames.push(
        ...Array.from({ length: 2 }, () => observation("point", seam[i])),
      );
    frames.push(
      ...Array.from({ length: 8 }, () => observation("point", seam[to])),
      empty,
    );
    await sequence(frames);
  }
  await frame(observation("point", { x: 0.02, y: 0.1 }));
  await page.waitForTimeout(400);
  assert.equal(
    (await debug()).state.cut,
    0,
    "Pointing off the onion does not cut",
  );
  await frame(empty);
  await stroke(0, 32);
  const partial = (await debug()).state.cut;
  assert(
    partial > 0.2 && partial < 0.5,
    `Partial gesture stroke retained: ${partial}`,
  );
  await stroke(0, 32);
  assert(
    Math.abs((await debug()).state.cut - partial) < 0.03,
    "Repeated gesture strokes do not inflate coverage",
  );
  await stroke(25, 96);
  assert((await debug()).state.cutOpen, "Gesture seam trace frees the section");
  let grasp = (await debug()).graspPoints.section;
  await frame(observation("pinch", grasp));
  assert.equal((await debug()).state.held, "section");
  // Incidental mouse movement must not move the held tissue or steal ownership.
  const heldPosition = (await debug()).positions.section;
  await page.mouse.move(20, 500);
  await page.waitForTimeout(100);
  assert(
    (await debug()).positions.section.every(
      (v, i) => Math.abs(v - heldPosition[i]) < 1e-7,
    ),
    "Mouse hover cannot move webcam-held tissue",
  );
  await sequence(
    Array.from({ length: 25 }, (_, i) =>
      observation("pinch", {
        x: grasp.x + (0.16 * (i + 1)) / 25,
        y: grasp.y - (0.02 * (i + 1)) / 25,
      }),
    ),
  );
  await frame(empty);
  assert.equal((await debug()).state.held, null);
  assert((await debug()).state.available.some((p) => p.id === "layer-0"));
  grasp = (await debug()).graspPoints["layer-0"];
  await frame(observation("pinch", grasp));
  assert.equal((await debug()).state.held, "layer-0");
  await sequence(
    Array.from({ length: 15 }, (_, i) =>
      observation("pinch", {
        x: grasp.x - (0.05 * (i + 1)) / 15,
        y: grasp.y - (0.015 * (i + 1)) / 15,
      }),
    ),
  );
  const bent = (await debug()).state.pieces["layer-0"].bend;
  assert(bent > 0.1 && bent < 1);
  await frame(observation("pinch", { x: grasp.x - 0.015, y: grasp.y - 0.005 }));
  assert(
    (await debug()).state.pieces["layer-0"].bend < bent,
    "Moving back relaxes peel",
  );
  await frame(empty);
  assert.equal(
    (await debug()).state.held,
    null,
    "Tracking loss releases tissue",
  );
  await page.screenshot({ path: "output/scalpless-gesture-peel.png" });
  const beforeZoom = (await debug()).seam[50];
  const two = (gap) => {
    const a = observation("open", { x: 0.5 - gap, y: 0.5 }, "Left"),
      b = observation("open", { x: 0.5 + gap, y: 0.5 }, "Right");
    return {
      landmarks: [...a.landmarks, ...b.landmarks],
      worldLandmarks: [...a.worldLandmarks, ...b.worldLandmarks],
      handedness: [...a.handedness, ...b.handedness],
    };
  };
  await frame(two(0.1));
  await sequence(Array.from({ length: 15 }, (_, i) => two(0.1 + i * 0.012)));
  await frame(empty);
  const afterZoom = (await debug()).seam[50];
  assert(
    Math.hypot(beforeZoom.x - afterZoom.x, beforeZoom.y - afterZoom.y) > 0.002,
    "Two hands zoom the onion view",
  );
  await page.locator('button[data-tool="inspect"]').click();
  assert.equal((await debug()).handTracking.running, false);
  assert.equal((await debug()).handTracking.liveTracks, 0);
  assert.equal((await debug()).state.tool, "inspect");
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("input:cutstart", {
        detail: { x: 0.5, y: 0.5, source: "webcam" },
      }),
    ),
  );
  assert.equal(
    (await debug()).state.tool,
    "inspect",
    "Stopped webcam events cannot reclaim the tool",
  );
  await page.locator("#reset").click();
  assert.equal((await debug()).state.cut, initial.state.cut);
  await start(page);
  await page.keyboard.press("Escape");
  assert.equal((await debug()).handTracking.running, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#hand-tracking-open").click();
  assert(await page.locator("#tracking-toggle").isVisible());
  await page.screenshot({ path: "output/scalpless-hand-tracking-mobile.png" });
  // The same recognizer and camera ownership drive the separate frog specimen.
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(new URL("./lab.html?specimen=frog", base).href);
  await page.waitForFunction(
    () => document.documentElement.dataset.ready === "true",
  );
  await page.locator("#hand-tracking-open").click();
  await page.locator("#tracking-gain").evaluate((e) => {
    e.value = "1";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await start(page);
  await stroke(0, 96);
  assert(
    (await debug()).state.cutOpen,
    "Gesture tracing opens the frog abdomen",
  );
  for (const id of ["abdomen", "liver"]) {
    grasp = (await debug()).graspPoints[id];
    await frame(observation("pinch", grasp));
    assert.equal(
      (await debug()).state.held,
      id,
      `Gesture pinch acquires frog ${id}`,
    );
    await sequence(
      Array.from({ length: 25 }, (_, i) =>
        observation("pinch", {
          x: grasp.x - (0.2 * (i + 1)) / 25,
          y: grasp.y - (0.04 * (i + 1)) / 25,
        }),
      ),
    );
    await frame(empty);
    assert.equal((await debug()).state.held, null);
    assert((await debug()).state.pieces[id].detached);
  }
  assert((await debug()).state.available.some((p) => p.id === "stomach"));
  await page.keyboard.press("Escape");
  assert.equal((await debug()).handTracking.liveTracks, 0);
  await context.close();

  const denied = await browser.newContext({
    viewport: { width: 1200, height: 800 },
  });
  await denied.route(/\/assets\/hand-tracking-model-[^/]+\.js$/, (route) =>
    route.fulfill({ body: stub, contentType: "text/javascript" }),
  );
  await denied.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("denied", "NotAllowedError");
    };
  });
  const failure = await denied.newPage();
  monitor(failure);
  await ready(failure);
  await failure.locator("#hand-tracking-open").click();
  await failure.locator("#tracking-toggle").click();
  await failure.waitForFunction(
    () =>
      document.querySelector("#hand-tracking-panel").dataset.phase === "error",
  );
  assert.match(
    await failure.locator("#tracking-status").textContent(),
    /permission denied/,
  );
  assert.equal(
    await failure.evaluate(
      () => window.__scalpless.getDebug().handTracking.source,
    ),
    "pointer",
  );
  await denied.close();
  assert.deepEqual(errors, []);
  const validation = {
    passed: true,
    errors,
    checks: [
      "local production MediaPipe + fake camera",
      "opt-in camera",
      "partial/repeated surface cuts",
      "off-specimen rejection",
      "pinch pickup and placement",
      "mouse movement ownership",
      "reversible peel",
      "tracking-loss release",
      "two-hand zoom",
      "mouse takeover",
      "stale input rejected",
      "reset",
      "Escape",
      "mobile setup",
      "permission denial",
      "frog gesture incision, panel removal and liver placement",
    ],
  };
  await writeFile(
    "output/hand-tracking-validation.json",
    JSON.stringify(validation, null, 2),
  );
  console.log("Hand tracking checks passed.", validation);
} finally {
  await browser.close();
}
