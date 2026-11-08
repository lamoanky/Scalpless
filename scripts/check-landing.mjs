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
  await page.screenshot({ path: "output/landing-hero.png" });
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
