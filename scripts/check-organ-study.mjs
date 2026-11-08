import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
const page = await browser.newPage({viewport:{width:1440,height:960}});
const errors=[]; page.on("pageerror",error=>errors.push(error.message));
const base=process.env.PREVIEW_URL || "http://127.0.0.1:5173/";
const debug=()=>page.evaluate(()=>window.__scalpless.getDebug());
const choose=async id=>{await page.locator("#piece-menu").click();await page.locator(`[data-piece="${id}"]`).click();};
const open=async()=>{
  await page.locator('[data-tool="scalpel"]').click();await page.locator("#primary-action").click();
  await page.waitForFunction(()=>window.__scalpless.getDebug().state.cutOpen);
  await page.locator('[data-tool="hand"]').click();await page.locator("#primary-action").click();
  assert.equal(await page.locator("#organ-slide").isVisible(),false,"Abdominal panel is not an organ study");
  await page.locator("#place-action").click();await choose("liver");await page.locator("#primary-action").click();
  await page.locator("#organ-slide").waitFor({state:"visible"});
};
await mkdir("output",{recursive:true});
try {
  for (const appearance of ["natural","blue"]) {
    await page.goto(`${base}lab.html?specimen=frog&appearance=${appearance}`);
    await page.waitForFunction(()=>document.documentElement.dataset.ready==="true");
    assert.equal(await page.locator("#organ-slide").isVisible(),false);
    await open();
    const before=await debug();
    assert.equal(before.organStudy.id,"liver");
    assert.equal(await page.locator("#organ-name").textContent(),"Liver");
    const preview=page.locator(".slide-preview");await preview.focus();
    await page.keyboard.press("ArrowRight");await page.keyboard.press("ArrowUp");
    assert.deepEqual((await debug()).state,before.state,"Study rotation does not mutate the lab");
    assert((await debug()).positions.liver.every((value,i)=>Math.abs(value-before.positions.liver[i])<1e-7),"Study rotation never moves the live organ (Rapier float precision)");
    assert((await debug()).organStudy.yaw>0);
    await page.evaluate(()=>document.documentElement.classList.add("landing-preview"));
    assert.equal((await debug()).organStudy.visible,false,"The landing's visibility boundary also hides the 3D study");
    assert.deepEqual((await debug()).state,before.state);
    await page.evaluate(()=>document.documentElement.classList.remove("landing-preview"));
    assert.equal((await debug()).organStudy.visible,true);
    // Hiding the interface removes browser focus; restore it before testing
    // the study's Escape key rather than the bench's cancel-operation shortcut.
    await preview.focus();
    await page.waitForTimeout(400);
    await page.screenshot({path:`output/organ-study-${appearance}.png`});
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#organ-slide").isVisible(),false);
    assert.equal((await debug()).state.held,"liver","Closing a panel does not release tissue");
    await page.getByRole("button",{name:"Open organ study"}).click();
    // Blue releases close to its attachment; collection must still expose
    // the digestive organs. Natural exercises the explicit place control.
    await page.locator(appearance==="blue" ? "#primary-action" : "#place-action").click();
    let dropped=await debug();
    assert.equal(dropped.state.held,null);
    assert.equal(dropped.state.lastCollected,"liver");
    assert.equal(dropped.state.pieces.liver.collected,true);
    assert.equal(dropped.visibility.liver,false,"Released organ is absent from the bench");
    assert.equal(dropped.physicalPieces.liver,undefined,"Released organ leaves physics too");
    assert(!dropped.state.available.some(p=>p.id==="liver"),"Hidden organs cannot be picked up again");
    assert(dropped.state.available.some(p=>p.id==="stomach"),"Collection exposes the digestive organs");
    assert.equal(dropped.organStudy.id,"liver");
    assert.equal(await page.locator("#organ-slide").isVisible(),true,"Release keeps the information panel open");
    assert.match(await page.locator(".slide-note").textContent(),/removed from the bench/);
    await preview.focus();await page.keyboard.press("ArrowLeft");
    assert.deepEqual((await debug()).state,dropped.state,"Collected study rotation is still independent");
    await page.screenshot({path:`output/organ-collected-${appearance}.png`});
    await choose("heart");await page.locator("#primary-action").click();
    assert.equal((await debug()).organStudy.id,"heart","Next organ replaces the previous study");
    // Release in place, without moving away from the original attachment.
    await page.locator("#primary-action").click();
    assert.equal((await debug()).state.pieces.heart.collected,true);
    await page.locator("#undo").click();
    dropped=await debug();
    assert.equal(dropped.visibility.heart,true);
    assert.equal(dropped.state.pieces.heart.detached,false);
    assert.equal(dropped.organStudy.id,"liver","Undo restores the previous collected study");
    assert.equal(dropped.visibility.liver,false);
    assert.equal(dropped.physicsBodies,1,"Undo does not recreate bodies for collected organs");
    await page.screenshot({path:`output/organ-collected-restored-${appearance}.png`});
    await page.locator("#primary-action").click();
    await page.locator("#undo").click();
    assert.equal((await debug()).organStudy.id,"liver","Cancelling a new grab preserves the completed collection");
    await page.locator("#undo").click();
    assert.equal((await debug()).state.pieces.liver.detached,false);
    assert.equal((await debug()).visibility.liver,true);
    assert.equal((await debug()).organStudy.id,null);
    await page.locator("#primary-action").click();
    assert.equal((await debug()).organStudy.id,"liver");
    await page.locator("#undo").click();
    assert.equal((await debug()).organStudy.id,null,"Undo while holding removes the study");
    await page.locator("#primary-action").click();
    await page.locator("#reset").click();
    assert.equal((await debug()).organStudy.id,null);
    assert.equal((await debug()).state.cut,0);
    assert(Object.values((await debug()).state.pieces).every(p=>!p.collected));
  }
  for (const width of [390,320]) {
    await page.setViewportSize({width,height:844});
    await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.ready==="true");
    await open();await page.waitForTimeout(300);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const box=await page.locator("#organ-slide").boundingBox();assert(box.x>=0&&box.x+box.width<=width);
    await page.screenshot({path:`output/organ-study-mobile-${width}.png`});
    await page.locator("#place-action").click();
    assert.equal(await page.locator("#organ-slide").isVisible(),true);
    assert.equal((await debug()).visibility.liver,false);
  }
  assert.deepEqual(errors,[]);
  await writeFile("output/organ-study-validation.json",JSON.stringify({passed:true,errors,appearances:2,mobileWidths:[390,320]},null,2));
  console.log("Organ study passed: independent view, collected organs, persistent panel, repeated removal, undo/reset, natural/blue, narrow layouts.");
} finally { await browser.close(); }
