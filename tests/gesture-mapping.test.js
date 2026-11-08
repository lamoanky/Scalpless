import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapGesturePointer,heightFromHandScale} from '../src/gesture-mapping.js';
import {GestureSession} from '../src/gesture-session.js';

function pointing(){
  const world=Array.from({length:21},()=>({x:0,y:-.05,z:0}));
  world[0]={x:0,y:0,z:0};world[4]={x:-.07,y:-.04,z:0};
  for(let j=0;j<4;j++)world[5+j]={x:-.025,y:-.06-j*.025,z:0};
  for(const [base,x] of [[9,0],[13,.02],[17,.04]]){
    world[base]={x,y:-.06,z:0};world[base+1]={x,y:-.08,z:0};world[base+2]={x,y:-.06,z:-.02};world[base+3]={x,y:-.03,z:-.02};
  }
  const landmarks=world.map(p=>({x:.5+p.x*2,y:.7+p.y*2,z:p.z*2}));
  return {landmarks:[landmarks],worldLandmarks:[world],handedness:[[{categoryName:'Left',score:.99}]]};
}
test('gesture mapping retains XYZ, uses gain and marks source',()=>{
  const p=mapGesturePointer({x:.6,y:.4,z:.8,mode:'hand'});
  assert.ok(Math.abs(p.x-.65)<1e-9);assert.ok(Math.abs(p.y-.35)<1e-9);assert.equal(p.z,.8);assert.equal(p.source,'webcam');
  assert.equal(mapGesturePointer({x:2,y:-1,z:4}).x,1);assert.equal(mapGesturePointer({x:2,y:-1,z:4}).y,0);
  assert.equal(heightFromHandScale(1),.5);assert.ok(heightFromHandScale(.7)>.5);assert.ok(heightFromHandScale(1.4)<.5);
});
test('actual landmark session emits cut then release through the shared contract',()=>{
  const events=[],session=new GestureSession((type,detail)=>events.push({type,detail})),frame=pointing();
  session.process(frame,0,4/3);session.process(frame,301,4/3);
  assert.ok(events.some(e=>e.type==='input:cutstart' && e.detail.source==='webcam'));
  session.reset();assert.ok(events.some(e=>e.type==='input:cutend'));
  assert.ok(events.some(e=>e.type==='input:move' && e.detail.lost));assert.equal(session.pointer,null);
});
test('pinch session releases on tracking loss',()=>{
  const events=[],session=new GestureSession((type,detail)=>events.push({type,detail})),frame=pointing();
  frame.worldLandmarks[0][4]={...frame.worldLandmarks[0][8]};frame.landmarks[0][4]={...frame.landmarks[0][8]};
  session.process(frame,0,4/3);assert.ok(events.some(e=>e.type==='input:pinchstart'));
  session.process({landmarks:[],worldLandmarks:[],handedness:[]},33,4/3);
  assert.ok(events.some(e=>e.type==='input:pinchend'));assert.equal(session.pointer,null);
});
