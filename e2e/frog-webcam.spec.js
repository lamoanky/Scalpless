import {test,expect} from '@playwright/test';
test.use({deviceScaleFactor:.3});

// Same synthetic MediaPipe fixture as onion-gestures.spec.js: the index
// fingertip lands on a canvas point.
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
const modelStub=`export async function loadHandTrackingModel(){return {detectForVideo(){return window.__trackingObservation||{landmarks:[],worldLandmarks:[],handedness:[]};},close(){}};}`;
async function cameraFixture(page){
  await page.route(/\/src\/hand-tracking-model\.js/,route=>route.fulfill({contentType:'text/javascript',body:modelStub}));
  await page.addInitScript(()=>{
    navigator.mediaDevices.getUserMedia=async()=>{
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
      const context=canvas.getContext('2d');let frame=0;
      const timer=setInterval(()=>{context.fillStyle=frame++%2?'#315565':'#315566';context.fillRect(0,0,640,480);},33);
      const stream=canvas.captureStream(30);stream.getTracks()[0].addEventListener('ended',()=>clearInterval(timer));return stream;
    };
    navigator.mediaDevices.enumerateDevices=async()=>[];
  });
}
const debug=page=>page.evaluate(()=>window.__scalpless.getDebug());
const seamGlowVisible=page=>page.evaluate(()=>window.__scalpless.getDebug().seamGlowVisible);
async function setFrame(page,pointer,pose='cut'){
  await page.evaluate(frame=>{window.__trackingObservation=frame;},frameAt(pointer,pose));
  await page.waitForFunction(({x,y})=>{
    const p=window.__scalpless.getDebug().handTracking.point;
    return p && Math.hypot(p.x-x,p.y-y)<.012;
  },pointer,{timeout:10000});
}
async function openFrog(page){
  await page.goto('/lab.html?specimen=frog');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
}

test('a webcam fingertip beside the frog seam snaps onto it and completes the cut',async({page})=>{
  test.setTimeout(240000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await cameraFixture(page);await openFrog(page);
  const {width,height}=page.viewportSize();
  const initial=await debug(page);
  // Offset every sample 20px outward from the abdomen centre: off the line,
  // inside the 32px snap radius.
  const c=initial.seam.reduce((a,p)=>({x:a.x+p.x/initial.seam.length,y:a.y+p.y/initial.seam.length}),{x:0,y:0});
  const off=p=>{
    const dx=(p.x-c.x)*width,dy=(p.y-c.y)*height,l=Math.hypot(dx,dy)||1;
    return {x:p.x+dx/l*20/width,y:p.y+dy/l*20/height};
  };
  await page.evaluate(frame=>{window.__trackingObservation=frame;},frameAt(off(initial.seam[0])));
  await page.locator('.hand-tracking-launch').click();
  await page.locator('#tracking-toggle').click();
  await expect(page.locator('#tracking-toggle')).toHaveText('Stop camera',{timeout:30000});
  await page.locator('#tracking-close').click();
  await page.waitForFunction(()=>window.__scalpless.getDebug().state.tool==='scalpel');
  await expect.poll(()=>seamGlowVisible(page)).toBe(true);
  for(let i=0;i<=96;i+=4)await setFrame(page,off(initial.seam[i]));
  await expect.poll(async()=>(await debug(page)).state.cutOpen,{timeout:15000}).toBe(true);
  expect(errors).toEqual([]);
});

test('a dropped frog organ stays on the bench',async({page})=>{
  test.setTimeout(240000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await openFrog(page);
  const {width,height}=page.viewportSize();
  const at=p=>page.mouse.move(p.x*width,p.y*height,{steps:4});
  // Cut the seam with the mouse, then drag the abdominal panel aside.
  await page.locator('[data-tool="scalpel"]').click();
  const seam=(await debug(page)).seam;
  await at(seam[0]);await page.mouse.down();
  for(const p of seam)await page.mouse.move(p.x*width,p.y*height);
  await page.mouse.up();
  await expect.poll(async()=>(await debug(page)).state.cutOpen,{timeout:15000}).toBe(true);
  await page.locator('[data-tool="hand"]').click();
  const panel=(await debug(page)).graspPoints.abdomen;
  await at(panel);await page.mouse.down();
  await expect.poll(async()=>(await debug(page)).state.held).toBe('abdomen');
  await page.mouse.move(panel.x*width-230,panel.y*height-115,{steps:25});
  await page.mouse.up();
  await expect.poll(async()=>(await debug(page)).state.available.some(p=>p.id==='liver'),{timeout:10000}).toBe(true);
  const grasp=(await debug(page)).graspPoints.liver;
  await at(grasp);
  await page.mouse.down();
  await expect.poll(async()=>(await debug(page)).state.held).toBe('liver');
  await page.mouse.move(grasp.x*width-220,grasp.y*height+60,{steps:20});
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const d=await debug(page);
  expect(d.state.held).toBe(null);
  expect(d.state.pieces.liver.collected).toBe(false);
  expect(d.visibility.liver).toBe(true);
  expect(d.physicsBodies).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
