import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
const page = await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:2});
const errors=[];
page.on("pageerror",e=>errors.push(e.message));
page.on("console",m=>{if(m.type()==="error") errors.push(m.text());});
const base=process.env.PREVIEW_URL || "http://127.0.0.1:5173/";
const debug=()=>page.evaluate(()=>window.__scalpless.getDebug());
await mkdir("output",{recursive:true});
try {
  await page.goto(`${base}lab.html?specimen=frog&appearance=blue`);
  await page.waitForFunction(()=>document.documentElement.dataset.ready==="true");
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator("#scene canvas").count(),1,"Glass and specimen share the renderer");
  await page.locator('[data-tool="scalpel"]').click(); await page.locator("#primary-action").click();
  await page.waitForFunction(()=>window.__scalpless.getDebug().state.cutOpen);
  await page.locator('[data-tool="hand"]').click(); await page.locator("#primary-action").click();
  await page.locator("#place-action").click();
  await page.locator("#piece-menu").click();await page.locator('[data-piece="lung-left"]').click();
  await page.locator("#primary-action").click();await page.locator("#place-action").click();
  await page.locator("#scene").focus();
  await page.waitForTimeout(1200);
  let state=await debug();
  assert.equal(state.organStudy.id,"lung-left");assert(state.organStudy.visible);
  assert.equal(state.visibility["lung-left"],false);
  assert(state.glass.active>0);assert.equal(state.glass.renderer,"shared");
  await page.screenshot({path:"output/liquid-glass-desktop.png"});
  await page.locator("#organ-slide").screenshot({path:"output/liquid-glass-lung.png"});
  await page.locator("#tools").screenshot({path:"output/liquid-glass-tools.png"});
  const sizes=await page.locator('#tools button').evaluateAll(buttons=>buttons.map(b=>({w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height,name:b.getAttribute("aria-label")})));
  assert(sizes.every(b=>b.w>=48 && b.h>=48 && b.name));
  // A live resize reallocates the sampled frame without losing study/scene state.
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:844});await page.waitForTimeout(400);
    assert.equal((await debug()).organStudy.id,"lung-left");
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`output/liquid-glass-mobile-${width}.png`});
  }
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.setViewportSize({width:1440,height:960});
  await page.locator(".slide-preview").focus();await page.keyboard.press("ArrowRight");
  assert((await debug()).organStudy.yaw>0);
  await page.locator("#reset").click();
  assert.equal((await debug()).organStudy.id,null);
  await page.waitForTimeout(1000);
  assert.deepEqual(errors,[],"No WebGL, shader, font or runtime errors");
  await writeFile("output/liquid-glass-validation.json",JSON.stringify({passed:true,errors,fps:state.fps,glass:state.glass,viewports:[1440,390,320]},null,2));
  console.log("Liquid glass passed: shared renderer, resize, collected organ, accessible controls, reduced motion; no GPU/runtime errors.", JSON.stringify({fps:state.fps}));
} finally { await browser.close(); }
