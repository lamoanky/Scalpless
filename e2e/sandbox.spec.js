import {test,expect} from '@playwright/test';
import * as THREE from 'three';

test('mouse can grab, lift, place, cut and reset the rendered WebGL sandbox',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  // Keep browser checks reproducible and independent of the CDN connection.
  await page.route('https://cdn.jsdelivr.net/npm/three@0.180.0/**',route=>{
    const path=new URL(route.request().url()).pathname.split('/three@0.180.0/')[1];
    return route.fulfill({path:new URL(`../node_modules/three/${path}`,import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),contentType:'text/javascript'});
  });
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  await page.goto('/');
  const canvas=page.locator('#hands-stage canvas');await expect(canvas).toBeVisible();
  await expect(page.locator('#hands-status')).toHaveText('Mouse controls ready');
  await canvas.scrollIntoViewIfNeeded();
  const box=await canvas.boundingBox();
  const camera=new THREE.PerspectiveCamera(43,box.width/box.height,.1,60);camera.position.set(0,8,7.5);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const screen=(x,y,z)=>{const p=new THREE.Vector3(x,y,z).project(camera);return {x:box.x+(p.x+1)*box.width/2,y:box.y+(1-p.y)*box.height/2};};
  const start=screen(-2.25,.11*3.2-1.1,1.15);
  await page.mouse.move(start.x,start.y);await page.mouse.down();
  await expect(page.locator('#grab-task')).toContainText('Cube grabbed');
  for(let i=0;i<8;i++)await page.keyboard.press('ArrowUp');
  const tray=screen(2.25,.31*3.2-1.1,1.15);
  await page.mouse.move(tray.x,tray.y,{steps:30});await page.mouse.up();
  await expect(page.locator('#grab-task')).toHaveClass('done');
  await page.getByRole('button',{name:'Scalpel · S',exact:true}).click();
  // Deliberately place the raw cursor well above the pad; snapping should let
  // the user trace its visible surface without precisely matching height.
  await page.locator('#mouse-height').evaluate(el=>{el.value='0.25';el.dispatchEvent(new Event('input',{bubbles:true}));});
  const height=-.88,first=screen(-1.5,height,-1.25);
  await page.mouse.move(first.x,first.y);
  await expect(page.locator('#cut-feedback')).toHaveAttribute('data-state','guide');
  await expect(page.locator('#cut-feedback')).toContainText('ready to cut');
  await expect(page.locator('#cut-progress-label')).toContainText('0%');
  await page.mouse.down();
  for(let i=1;i<=40;i++){
    const p=screen(-1.5+i*3/40,height,-1.25+Math.sin(i/40*Math.PI)*.16);
    await page.mouse.move(p.x,p.y);
  }
  await page.mouse.up();await expect(page.locator('#cut-task')).toHaveClass('done');
  await page.screenshot({path:'test-results/sandbox-complete.png',fullPage:true});
  await page.locator('#mouse-height').evaluate(el=>{el.value='0.7';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await expect(page.locator('#cut-feedback')).toHaveAttribute('data-state','hover');
  await page.getByRole('button',{name:'Reset practice',exact:true}).click();
  await expect(page.locator('#cut-progress-label')).toContainText('0%');
  await expect(page.locator('#grab-task')).not.toHaveClass('done');
  expect(errors).toEqual([]);
});
