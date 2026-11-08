import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
await mkdir("output", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (e) => console.log("PAGE ERROR", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("ERROR", m.text());
  });
  await page.goto(process.env.PREVIEW_URL || "http://127.0.0.1:5173/");
  await page.waitForFunction(
    () => document.documentElement.dataset.ready === "true",
  );
  for (const [name, p] of [
    ["hero", 0],
    ["explore", 0.5],
    ["collection", 1],
  ]) {
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
    await page.waitForTimeout(900);
    console.log(
      name,
      await page.evaluate(() => window.__scalplessLanding.getDebug()),
    );
    await page.screenshot({ path: `output/landing-${name}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(900);
  await page.screenshot({ path: "output/landing-mobile.png" });
} finally {
  await browser.close();
}
