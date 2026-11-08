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
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: "output/landing-recordings",
      size: { width: 1600, height: 1000 },
    },
  });
  const page = await context.newPage();
  await page.goto(process.env.PREVIEW_URL || "http://127.0.0.1:5173/");
  await page.waitForFunction(
    () => document.documentElement.dataset.ready === "true",
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  for (const [start, end] of [
    [0, 0.5],
    [0.5, 1],
  ]) {
    await page.evaluate(
      async ({ start, end }) => {
        const length =
          document.querySelector(".scroll-story").offsetHeight - innerHeight;
        await new Promise((resolve) => {
          const began = performance.now();
          const tick = (now) => {
            const t = Math.min(1, (now - began) / 4500);
            const eased = t * t * (3 - 2 * t);
            scrollTo({
              top: (start + (end - start) * eased) * length,
              behavior: "instant",
            });
            if (t < 1) requestAnimationFrame(tick);
            else resolve();
          };
          requestAnimationFrame(tick);
        });
      },
      { start, end },
    );
    await page.waitForTimeout(1200);
  }
  const video = page.video();
  await context.close();
  await video.saveAs("output/scalpless-landing-scroll.webm");
  await video.delete();
  console.log("Saved output/scalpless-landing-scroll.webm");
} finally {
  await browser.close();
}
