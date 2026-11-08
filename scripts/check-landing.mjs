import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
await mkdir("output", { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: process.env.HIGH_RES ? 2 : 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const url = process.env.PREVIEW_URL || "http://127.0.0.1:4173/";
  const ready = () =>
    page.waitForFunction(
      () =>
        document.documentElement.dataset.ready === "true" &&
        Boolean(window.__scalplessLanding),
    );
  const debug = () => page.evaluate(() => window.__scalplessLanding.getDebug());
  const scroll = async (p) => {
    await page.evaluate(
      (p) =>
        window.scrollTo({
          top:
            p *
            (document.querySelector(".scroll-story").offsetHeight -
              innerHeight),
          behavior: "instant",
        }),
      p,
    );
    await page.waitForFunction(
      (p) =>
        Math.abs(window.__scalplessLanding.getDebug().progress - p) < 0.0003,
      p,
    );
  };
  await page.goto(url);
  await ready();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".model-loading")).opacity ===
      "0",
  );
  await scroll(0);
  const first = await debug();
  assert.equal(
    first.photoOpacity,
    1,
    "Opening preserves the reference photograph",
  );
  assert.equal(
    await page
      .locator("#landing-scene")
      .evaluate((e) => getComputedStyle(e).opacity),
    "0",
  );
  assert(
    await page
      .locator(".reference-onion")
      .evaluate((e) => e.complete && e.naturalWidth > 0),
  );
  await page.screenshot({ path: "output/landing-hero.png" });
  await scroll(0.18);
  assert(
    Math.abs((await debug()).modelReveal - 0.5) < 0.005,
    "Scroll blends the photo and live model",
  );
  await page.screenshot({ path: "output/landing-photo-transition.png" });
  await scroll(0.28);
  assert(
    (await debug()).photoOpacity < 0.001,
    "The photograph clears after the handoff",
  );
  await scroll(0);
  const samples = [first];
  for (const [p, name] of [
    [0.25, null],
    [0.5, "explore"],
    [0.75, null],
    [1, "collection"],
  ]) {
    await scroll(p);
    const d = await debug();
    samples.push(d);
    assert(
      d.scale < samples[samples.length - 2].scale,
      "Onion gets smaller with scroll",
    );
    assert(
      d.modelRotation > samples[samples.length - 2].modelRotation,
      "Onion spins with scroll",
    );
    if (name) await page.screenshot({ path: `output/landing-${name}.png` });
  }
  await scroll(0);
  assert(
    Math.abs((await debug()).scale - first.scale) < 0.01,
    "Reverse scroll restores close-up",
  );
  assert.equal(
    (await debug()).photoOpacity,
    1,
    "Reverse scroll restores the original image",
  );
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await page.waitForFunction(
    () => window.__scalplessLanding.getDebug().active === 1,
  );
  await page.getByRole("link", { name: "Features", exact: true }).click();
  await page.waitForFunction(
    () => window.__scalplessLanding.getDebug().active === 2,
  );
  await page.getByRole("link", { name: "About", exact: true }).click();
  await page.waitForTimeout(900);
  assert(
    await page
      .locator("#about")
      .evaluate((e) => e.getBoundingClientRect().top < 200),
    "About navigation works",
  );
  await page.getByRole("link", { name: "FAQ", exact: true }).click();
  await page.waitForTimeout(900);
  await page.locator("summary").first().click();
  assert((await page.locator("details").first().getAttribute("open")) !== null);
  await page.screenshot({ path: "output/landing-faq.png" });
  await page.getByRole("link", { name: "Get Started", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.ready === "true" &&
      Boolean(window.__scalpless),
  );
  assert(new URL(page.url()).pathname.endsWith("/lab.html"));
  assert.equal(
    await page.evaluate(() => window.__scalpless.getDebug().state.cut),
    0,
    "Landing opens intact dissection bench",
  );
  await page.goto(url);
  await ready();
  await page.getByRole("button", { name: "Pause scroll animation" }).click();
  await page.waitForFunction(() => {
    const d = window.__scalplessLanding.getDebug();
    return d.reducedMotion && d.height === 0.42;
  });
  const paused = await debug();
  await scroll(1);
  const pausedEnd = await debug();
  assert.equal(pausedEnd.modelRotation, paused.modelRotation);
  assert.equal(pausedEnd.scale, paused.scale);
  assert.equal(
    pausedEnd.photoOpacity,
    1,
    "Motion off retains a static reference image",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await ready();
  await scroll(0);
  const reduced = await debug();
  await scroll(1);
  const reducedEnd = await debug();
  assert.equal(reduced.scale, reducedEnd.scale);
  assert.equal(reduced.modelRotation, reducedEnd.modelRotation);
  assert.equal(reducedEnd.active, 2);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload();
  await ready();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [p, name] of [
    [0, "hero"],
    [0.5, "explore"],
    [1, "collection"],
  ]) {
    await scroll(p);
    await page.waitForTimeout(250);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "No horizontal overflow",
    );
    await page.screenshot({ path: `output/landing-mobile-${name}.png` });
  }
  assert.deepEqual(errors, [], "No browser errors");
  const fallback = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
  });
  await fallback.route("**/environments/*.hdr", (route) => route.abort());
  await fallback.goto(url);
  await fallback.waitForFunction(() =>
    document.documentElement.classList.contains("model-error"),
  );
  await fallback.evaluate(() =>
    scrollTo({ top: innerHeight, behavior: "instant" }),
  );
  await fallback.waitForTimeout(600);
  assert.equal(
    await fallback
      .locator(".reference-onion")
      .evaluate((e) => getComputedStyle(e).opacity),
    "1",
    "Failed WebGL assets preserve the reference image",
  );
  assert(
    await fallback
      .getByRole("link", { name: "Get Started", exact: true })
      .isVisible(),
  );
  await fallback.close();
  await writeFile(
    "output/landing-validation.json",
    JSON.stringify(
      {
        passed: true,
        errors,
        samples: samples.map((d) => ({
          progress: d.progress,
          scale: d.scale,
          rotation: d.modelRotation,
        })),
        checks: [
          "shrinks",
          "reference photograph first",
          "smooth photo to model handoff",
          "reference fallback on model load failure",
          "spins",
          "reverse scroll",
          "navigation",
          "FAQ",
          "opens intact lab",
          "pause",
          "reduced motion",
          "mobile overflow",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "Landing checks passed: scroll motion, navigation, lab entry, accessibility preferences and mobile layout.",
  );
} finally {
  await browser.close();
}
