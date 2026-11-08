import {test,expect} from '@playwright/test';
test.use({deviceScaleFactor:.3});
const debug=page=>page.evaluate(()=>window.__scalpless.getDebug());
// A quick flick delivers few pointer events; each sample jumps ~12 seam bins.
test('a fast, sparse scalpel stroke still cuts the whole traced span',async({page})=>{
  await page.goto('/');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.keyboard.press('s');
  const {seam}=await debug(page),size=page.viewportSize();
  const points=seam.filter((_,i)=>i%12===0);
  await page.mouse.move(points[0].x*size.width,points[0].y*size.height);
  await page.mouse.down();
  for(const p of points)await page.mouse.move(p.x*size.width,p.y*size.height,{steps:1});
  await page.mouse.up();
  expect((await debug(page)).state.cut).toBeGreaterThan(.85);
});
test('a fast stroke across the seam only cuts where it crosses',async({page})=>{
  await page.goto('/');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.keyboard.press('s');
  const {seam}=await debug(page),size=page.viewportSize(),mid=seam[48];
  await page.mouse.move((mid.x-.08)*size.width,mid.y*size.height);
  await page.mouse.down();
  await page.mouse.move((mid.x+.08)*size.width,mid.y*size.height,{steps:2});
  await page.mouse.up();
  expect((await debug(page)).state.cut).toBeLessThan(.1);
});
