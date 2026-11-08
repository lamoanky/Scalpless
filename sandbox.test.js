import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSandbox} from './sandbox.js';
import {LAB,guide} from './sandbox-state.js';
import {GestureTracker} from './gestures.js';

test('same input contract drives mouse and webcam while ignoring inactive source',()=>{
  const original=globalThis.window;globalThis.window=new EventTarget();
  try{
    let source='mouse';const sandbox=createSandbox(new THREE.Scene(),()=>source);
    const send=(name,world,from)=>window.dispatchEvent(new CustomEvent(`input:${name}`,{detail:{x:.5,y:.5,z:.1,world,source:from,mode:'hand'}}));
    send('pinchstart',{...sandbox.state.cube},'webcam');assert.equal(sandbox.state.grabbed,false);
    send('pinchstart',{...sandbox.state.cube},'mouse');assert.equal(sandbox.state.grabbed,true);
    send('move',{x:LAB.trayX,y:1,z:LAB.trayZ},'mouse');send('pinchend',null,'mouse');
    for(let i=0;i<120;i++)sandbox.update(1/60);assert.equal(sandbox.state.placed,true);
    source='webcam';send('move',{...guide[0],y:LAB.padY},'webcam');send('cutstart',{...guide[0],y:LAB.padY},'webcam');
    guide.forEach(p=>send('move',{...p,y:LAB.padY},'webcam'));send('cutend',null,'webcam');
    sandbox.update(1/60);assert.equal(sandbox.state.cutComplete,true);
    sandbox.dispose();
  }finally{globalThis.window=original;}
});
test('detected webcam pinch picks up cube on approach, follows grip in XYZ, and drops on opening',()=>{
  const original=globalThis.window;globalThis.window=new EventTarget();
  try{
    const sandbox=createSandbox(new THREE.Scene(),()=> 'webcam');
    const tracker=new GestureTracker((type,detail)=>window.dispatchEvent(new CustomEvent(type,{detail})));
    const points=Array.from({length:21},()=>({x:.5,y:.4,z:0}));
    points[0]={x:.5,y:.7,z:0};points[8]={x:.5,y:.2,z:0};points[4]={...points[8]};
    const frame=(now,grip)=>tracker.update([points],now,['Left'],[[true,true,false,false,false]],[],[points],1,[],[grip]);
    frame(0,{x:0,y:1,z:0});assert.equal(sandbox.state.grabbed,false);
    frame(33,{...sandbox.state.cube});assert.equal(sandbox.state.grabbed,true);
    frame(66,{x:LAB.trayX,y:1,z:LAB.trayZ});
    assert.equal(sandbox.state.cube.x,LAB.trayX);assert.equal(sandbox.state.cube.y,1);
    points[4]={x:.1,y:.4,z:0};frame(99,{x:LAB.trayX,y:1,z:LAB.trayZ});
    assert.equal(sandbox.state.grabbed,false);
    for(let i=0;i<120;i++)sandbox.update(1/60);
    assert.equal(sandbox.state.placed,true);sandbox.dispose();
  }finally{globalThis.window=original;}
});
