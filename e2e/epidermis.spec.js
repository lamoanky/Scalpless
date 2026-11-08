import {test,expect} from '@playwright/test';
test.use({deviceScaleFactor:.3});
const debug=page=>page.evaluate(()=>window.__scalpless.getDebug());
const peel=async(page,id)=>{
  await page.locator('#piece-select').selectOption(id);
  for(let i=0;i<4&&!(await debug(page)).state.pieces[id].detached;i++)await page.locator('#primary-action').click();
  await expect.poll(async()=>(await debug(page)).state.pieces[id].detached).toBe(true);
  await page.locator('#place-action').click();
  await expect.poll(async()=>(await debug(page)).state.held).toBe(null);
};
test('the epidermis is pre-selected and peels with a short drag',async({page})=>{
  await page.goto('/lab.html');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.keyboard.press('s');
  await page.locator('#primary-action').click();
  await expect.poll(async()=>(await debug(page)).state.cutOpen,{timeout:60000}).toBe(true);
  await page.keyboard.press('h');
  await page.locator('#primary-action').click();
  await page.locator('#place-action').click();
  await peel(page,'layer-0');
  await peel(page,'layer-1');
  // Physics may still be settling the placed layer; wait for its grip to stop moving.
  let previous=null;
  await expect.poll(async()=>{
    const grip=(await debug(page)).graspPoints.epidermis;
    const still=previous&&Math.hypot(grip.x-previous.x,grip.y-previous.y)<.001;
    previous=grip;return still;
  },{intervals:[400],timeout:15000}).toBe(true);
  const ready=await debug(page);
  expect(ready.state.selected).toBe('epidermis');
  const size=page.viewportSize();
  // The placed layer can still drift a few mm; aim at the ring where it is now.
  await page.mouse.move(ready.graspPoints.epidermis.x*size.width,ready.graspPoints.epidermis.y*size.height);
  const grip=(await debug(page)).graspPoints.epidermis;
  const x=grip.x*size.width,y=grip.y*size.height;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await expect.poll(async()=>(await debug(page)).state.held).toBe('epidermis');
  await page.mouse.move(x+90,y-90,{steps:4});
  await page.mouse.up();
  await expect.poll(async()=>(await debug(page)).state.pieces.epidermis.detached).toBe(true);
});
