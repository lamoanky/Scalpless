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
  await page.waitForTimeout(1500); // let the placed layer settle
  const ready=await debug(page);
  expect(ready.state.selected).toBe('epidermis');
  const grip=ready.graspPoints.epidermis,size=page.viewportSize();
  const x=grip.x*size.width,y=grip.y*size.height;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await expect.poll(async()=>(await debug(page)).state.held).toBe('epidermis');
  await page.mouse.move(x+70,y-70,{steps:4});
  await page.mouse.up();
  await expect.poll(async()=>(await debug(page)).state.pieces.epidermis.detached).toBe(true);
});
