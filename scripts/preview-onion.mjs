import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});
page.on("pageerror", (e) => console.error(e));
await page.goto("http://127.0.0.1:5173/lab.html");
await page.waitForFunction(
  () => document.documentElement.dataset.ready === "true",
);
await page.waitForTimeout(700);
await page.screenshot({ path: "output/onion-reference-intact.png" });
await page.locator('button[data-tool="scalpel"]').click();
await page.locator("#primary-action").click();
await page.waitForFunction(() => window.__scalpless.getDebug().state.cutOpen);
await page.locator('button[data-tool="hand"]').click();
await page.locator("#primary-action").click();
await page.locator("#place-action").click();
await page.waitForTimeout(2200);
await page.locator('button[data-tool="inspect"]').click();
await page.screenshot({ path: "output/onion-reference-cutaway.png" });
await browser.close();
