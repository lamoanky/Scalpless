import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";

await mkdir("output", { recursive: true });
const chromePath =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(chromePath) ? { executablePath: chromePath } : {}),
});
const page = await browser.newPage({
  viewport: { width: 1672, height: 941 },
  deviceScaleFactor: process.env.HIGH_RES ? 2 : 1,
  reducedMotion: "reduce",
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
await page.goto(process.env.PREVIEW_URL || "http://127.0.0.1:5173", {
  waitUntil: "networkidle",
});
await page.waitForFunction(
  () => document.documentElement.dataset.ready === "true",
);
await page.screenshot({
  path: `output/scalpless-workspace${process.env.HIGH_RES ? "-2x" : ""}.png`,
});
console.log("Captured the dissection workspace.");

if (process.env.CHECK_INTERACTIONS) {
  await page
    .getByRole("button", { name: "Inspect Outer Layer", exact: true })
    .click();
  if (!(await page.locator("#layer-inspector").isVisible()))
    throw new Error("Layer inspector did not open.");
  await page
    .getByRole("button", { name: "Isolate layer", exact: true })
    .click();
  if (!(await page.getByRole("dialog").isVisible()))
    throw new Error("Layer isolation did not open.");
  if ((await page.locator("#inspection-title").textContent()) !== "Outer Layer")
    throw new Error("Wrong layer in isolation view.");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  if ((await page.locator("#zoom-level").textContent()) !== "1.5×")
    throw new Error("Magnification did not change.");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Inspect Microscopic View", exact: true })
    .click();
  if (
    (await page.locator("#inspection-title").textContent()) !==
    "Microscopic View"
  )
    throw new Error("Microscope view did not open.");
  await page.screenshot({ path: "output/scalpless-microscope.png" });
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Onion Cells: Nuclei", exact: true })
    .click();
  if ((await page.locator("#inspector-eyebrow").textContent()) !== "NUCLEI")
    throw new Error("Panel pagination did not update.");
  await page
    .getByRole("button", { name: "Specimen view", exact: true })
    .click();
  if (!(await page.locator("#panels").evaluate((element) => element.inert)))
    throw new Error("Focus view left hidden panels interactive.");
  await page.getByRole("button", { name: "Layer view", exact: true }).click();
  if (await page.locator("#panels").evaluate((element) => element.inert))
    throw new Error("Layer view did not restore the panels.");
  await page
    .getByRole("button", {
      name: "Select scalpel to mark an incision",
      exact: true,
    })
    .click();
  await page.mouse.move(850, 280);
  await page.mouse.down();
  await page.mouse.move(880, 425, { steps: 12 });
  await page.mouse.up();
  if ((await page.locator("#cut-lines polyline").count()) !== 1)
    throw new Error("The scalpel did not mark the specimen.");
  await page
    .getByRole("button", {
      name: "Select forceps to isolate a layer",
      exact: true,
    })
    .click();
  await page.locator("#cut-surface").click({ position: { x: 250, y: 250 } });
  if ((await page.locator("#inspection-title").textContent()) !== "First Layer")
    throw new Error("Forceps did not isolate the layer.");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Reset workspace", exact: true })
    .click();
  if (
    !(await page.evaluate(
      () =>
        window.__scalpless.state.cuts.length === 0 &&
        window.__scalpless.state.tool === null &&
        window.__scalpless.state.selected === null,
    ))
  )
    throw new Error("Reset did not restore the workspace.");
  console.log(
    "Layer selection, pagination, isolation, zoom, focus, scalpel, forceps, and reset checks passed.",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(
    () => document.documentElement.dataset.ready === "true",
  );
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("Mobile layout overflows horizontally.");
  await page
    .getByRole("button", { name: "Open microscope", exact: true })
    .click();
  if (!(await page.getByRole("dialog").isVisible()))
    throw new Error("Mobile microscope did not open.");
  await page.keyboard.press("Escape");
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: "output/scalpless-mobile.png",
    fullPage: true,
  });
  console.log("Mobile layout and microscope checks passed.");
}
await browser.close();
if (errors.length) throw new Error(errors.join("\n"));
console.log("No browser errors.");
