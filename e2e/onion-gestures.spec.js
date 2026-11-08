import {test,expect} from '@playwright/test';
test.use({deviceScaleFactor:.3});

// Synthetic MediaPipe result whose index fingertip lands on a canvas point.
function frameAt(pointer,pose='cut'){
  const world=Array.from({length:21},()=>({x:0,y:-.05,z:0}));
  world[0]={x:0,y:0,z:0};world[4]={x:-.07,y:-.04,z:0};
  for(let j=0;j<4;j++)world[5+j]={x:-.025,y:-.06-j*.025,z:0};
  for(const [base,x] of [[9,0],[13,.02],[17,.04]]){
    world[base]={x,y:-.06,z:0};world[base+1]={x,y:-.08,z:0};world[base+2]={x,y:-.06,z:-.02};world[base+3]={x,y:-.03,z:-.02};
  }
  if(pose==='pinch')world[4]={...world[8]};
  if(pose==='open'){
    for(const base of [9,13,17])for(let j=1;j<4;j++)world[base+j]={x:world[base].x,y:world[base].y-j*.025,z:0};
  }
  const target={x:1-(.5+(pointer.x-.5)/1.5),y:.5+(pointer.y-.5)/1.5};
  const image=world.map(p=>({x:target.x+(p.x-world[8].x)*2,y:target.y+(p.y-world[8].y)*2,z:p.z*2}));
  return {landmarks:[image],worldLandmarks:[world],handedness:[[{categoryName:'Left',score:.99}]]};
}

// Stub the lazily imported model (served by Vite from /src) and the camera.
const modelStub=`export async function loadHandTrackingModel(){return {detectForVideo(){return window.__trackingObservation||{landmarks:[],worldLandmarks:[],handedness:[]};},close(){}};}`;
async function cameraFixture(page,denied=false){
  await page.route(/\/src\/hand-tracking-model\.js/,route=>route.fulfill({contentType:'text/javascript',body:modelStub}));
  await page.addInitScript(({denied})=>{
    navigator.mediaDevices.getUserMedia=async()=>{
      if(denied)throw new DOMException('Denied by test','NotAllowedError');
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
      const context=canvas.getContext('2d');let frame=0;
      const timer=setInterval(()=>{context.fillStyle=frame++%2?'#315565':'#315566';context.fillRect(0,0,640,480);},33);
      const stream=canvas.captureStream(30);stream.getTracks()[0].addEventListener('ended',()=>clearInterval(timer));return stream;
    };
    navigator.mediaDevices.enumerateDevices=async()=>[];
  },{denied});
}
const debug=page=>page.evaluate(()=>window.__scalpless.getDebug());
async function setFrame(page,pointer,pose='cut'){
  await page.evaluate(frame=>{window.__trackingObservation=frame;},frameAt(pointer,pose));
  await page.waitForFunction(({x,y})=>{
    const p=window.__scalpless.getDebug().handTracking.point;
    return p && Math.hypot(p.x-x,p.y-y)<.012;
  },pointer,{timeout:10000});
}
async function startCamera(page){
  await page.locator('.hand-tracking-launch').click();
  await page.locator('#tracking-toggle').click();
  await expect(page.locator('#tracking-toggle')).toHaveText('Stop camera',{timeout:30000});
  await page.locator('#tracking-close').click();
}
async function openLab(page){
  await page.goto('/lab.html');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
}

test('webcam landmarks drive onion cutting, section lifting, peeling, and release',async({page})=>{
  test.setTimeout(240000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await cameraFixture(page);await openLab(page);
  const initial=await debug(page);
  await page.evaluate(frame=>{window.__trackingObservation=frame;},frameAt(initial.seam[0]));
  await startCamera(page);
  await expect(page.locator('#scene')).toHaveAttribute('data-input','webcam');
  await page.waitForFunction(()=>window.__scalpless.getDebug().state.tool==='scalpel');
  // Seam snapping lets sparse fingertip samples complete the incision.
  for(let i=0;i<=96;i+=4)await setFrame(page,initial.seam[i]);
  await expect.poll(async()=>(await debug(page)).state.cutOpen,{timeout:15000}).toBe(true);
  await setFrame(page,initial.seam[96],'open');
  let d=await debug(page),grasp=d.graspPoints.section;
  await setFrame(page,grasp,'pinch');
  await expect.poll(async()=>(await debug(page)).state.held).toBe('section');
  await setFrame(page,{x:grasp.x+.2,y:grasp.y-.04},'pinch');
  await expect.poll(async()=>(await debug(page)).state.available.some(p=>p.id==='layer-0')).toBe(true);
  await setFrame(page,{x:grasp.x+.2,y:grasp.y-.04},'open');
  await expect.poll(async()=>(await debug(page)).state.held).toBe(null);
  d=await debug(page);grasp=d.graspPoints['layer-0'];
  await setFrame(page,grasp,'pinch');
  await expect.poll(async()=>(await debug(page)).state.held).toBe('layer-0');
  for(let step=1;step<=8;step++)await setFrame(page,{x:grasp.x-step*.035,y:grasp.y-.025},'pinch');
  await expect.poll(async()=>(await debug(page)).state.pieces['layer-0'].detached).toBe(true);
  await setFrame(page,{x:grasp.x-.28,y:grasp.y-.025},'open');
  await expect.poll(async()=>(await debug(page)).state.held).toBe(null);
  await page.screenshot({path:'test-results/onion-gesture-dissection.png'});
  await page.locator('.hand-tracking-launch').click();
  await page.locator('#tracking-toggle').click();
  await expect(page.locator('#tracking-toggle')).toHaveText('Start camera');
  await expect(page.locator('#scene')).toHaveAttribute('data-input','mouse');
  expect(errors).toEqual([]);
});

test('a webcam pinch near layer 1 peels the epidermis with a short pull',async({page})=>{
  test.setTimeout(240000);
  await cameraFixture(page);await openLab(page);
  // Reach the epidermis step with the keyboard-accessible controls first.
  await page.keyboard.press('s');
  await page.locator('#primary-action').click();
  await expect.poll(async()=>(await debug(page)).state.cutOpen,{timeout:60000}).toBe(true);
  await page.keyboard.press('h');
  await page.locator('#primary-action').click();
  await page.locator('#place-action').click();
  for(const id of ['layer-0','layer-1']){
    await page.locator('#piece-select').selectOption(id);
    for(let i=0;i<4&&!(await debug(page)).state.pieces[id].detached;i++)await page.locator('#primary-action').click();
    await expect.poll(async()=>(await debug(page)).state.pieces[id].detached).toBe(true);
    await page.locator('#place-action').click();
  }
  await page.waitForTimeout(1500); // let the placed layer settle
  const grip=(await debug(page)).graspPoints.epidermis;
  // Pinch slightly off the membrane's grip point; the snap should still win.
  const start={x:grip.x+.02,y:grip.y+.02};
  await page.evaluate(frame=>{window.__trackingObservation=frame;},frameAt(start,'open'));
  await startCamera(page);
  await setFrame(page,start,'open');
  await setFrame(page,start,'pinch');
  await expect.poll(async()=>(await debug(page)).state.held).toBe('epidermis');
  for(let step=1;step<=4;step++)await setFrame(page,{x:start.x+step*.02,y:start.y-step*.02},'pinch');
  await setFrame(page,{x:start.x+.08,y:start.y-.08},'open');
  await expect.poll(async()=>(await debug(page)).state.pieces.epidermis.detached).toBe(true);
});

test('camera denial preserves the onion bench and mouse controls',async({page})=>{
  await cameraFixture(page,true);await openLab(page);
  await page.locator('.hand-tracking-launch').click();
  await page.locator('#tracking-toggle').click();
  await expect(page.locator('#tracking-status')).toContainText('Camera permission denied',{timeout:30000});
  await expect(page.locator('#tracking-toggle')).toHaveText('Start camera');
  await page.locator('#tracking-close').click();
  await page.locator('button[data-tool="scalpel"]').click();
  await expect(page.locator('button[data-tool="scalpel"]')).toHaveAttribute('aria-pressed','true');
  expect((await debug(page)).handTracking.running).toBe(false);
});
