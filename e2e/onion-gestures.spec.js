import {test,expect} from '@playwright/test';
test.use({deviceScaleFactor:.3});

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

async function cameraFixture(page,denied=false){
  await page.route(/vision_bundle\.mjs/,route=>route.fulfill({contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:`export const FilesetResolver={forVisionTasks:async()=>({})};export class HandLandmarker{static async createFromOptions(){return new HandLandmarker()}detectForVideo(){return window.__testHandFrame||{landmarks:[],worldLandmarks:[],handedness:[]}}close(){}}`}));
  await page.addInitScript(({denied})=>{
    navigator.mediaDevices.getUserMedia=async()=>{
      if(denied)throw new DOMException('Denied by test','NotAllowedError');
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
      const context=canvas.getContext('2d');let frame=0;
      const timer=setInterval(()=>{context.fillStyle=frame++%2?'#315565':'#315566';context.fillRect(0,0,640,480);},33);
      const stream=canvas.captureStream(30);stream.getTracks()[0].addEventListener('ended',()=>clearInterval(timer));return stream;
    };
  },{denied});
}
const debug=page=>page.evaluate(()=>window.__scalpless.getDebug());
async function setFrame(page,pointer,pose='cut'){
  await page.evaluate(frame=>{window.__testHandFrame=frame;},frameAt(pointer,pose));
  await page.waitForFunction(({x,y})=>{
    const p=window.__scalpless.getDebug().gestures.pointer;
    return p && Math.hypot(p.x-x,p.y-y)<.012;
  },pointer,{timeout:10000});
}

test('webcam landmarks drive onion cutting, section lifting, peeling, and release in Viv UI',async({page})=>{
  test.setTimeout(240000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await cameraFixture(page);await page.goto('/');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await expect(page.locator('.tool-strip')).toBeVisible();
  await expect(page.locator('#input-source')).toHaveCount(0);
  const initial=await debug(page);
  await page.evaluate(frame=>{window.__testHandFrame=frame;},frameAt(initial.seam[0]));
  await page.locator('#gesture-toggle').click();
  await expect(page.locator('#gesture-toggle')).toHaveText('Stop webcam',{timeout:30000});
  await page.waitForFunction(()=>window.__scalpless.getDebug().state.tool==='scalpel');

  for(let i=0;i<=96;i+=4){await setFrame(page,initial.seam[i]);}
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
  await expect.poll(async()=>(await debug(page)).gestures.modelsLoaded).toBe(2);
  await expect.poll(async()=>(await debug(page)).gestures.visibleHands.length).toBe(1);
  await page.screenshot({path:'test-results/onion-gesture-dissection.png'});
  await page.locator('#gesture-toggle').click();
  await expect(page.locator('#gesture-toggle')).toHaveText('Enable webcam');
  await expect(page.locator('#scene')).toHaveAttribute('data-input','mouse');
  expect(errors).toEqual([]);
});

test('camera denial preserves the onion bench and mouse controls',async({page})=>{
  await cameraFixture(page,true);await page.goto('/');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.locator('#gesture-toggle').click();
  await expect(page.locator('#gesture-feedback')).toContainText('Camera access denied',{timeout:30000});
  await expect(page.locator('#gesture-toggle')).toHaveText('Enable webcam');
  await page.locator('button[data-tool="scalpel"]').click();
  await expect(page.locator('button[data-tool="scalpel"]')).toHaveAttribute('aria-pressed','true');
  expect((await debug(page)).gestures.active).toBe(false);
});
