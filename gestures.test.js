import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GestureTracker, isIndexOnlyExtended } from './gestures.js';
function hand(up=true) {
  const p=Array.from({length:21},()=>({x:.5,y:.45,z:0}));
  p[0]={x:.5,y:.65};p[9]={x:.5,y:.45};p[4]={x:.2,y:.4};
  for(let j=0;j<4;j++) p[5+j]={x:.45,y:.45+(up?-1:1)*j*.07};
  return p;
}
test('XYZ height reaches move, cut, and release events unchanged',()=>{
  const events=[],tracker=new GestureTracker((type,detail)=>events.push({type,detail}));
  tracker.update([hand()],0,['Left'],[],[.25]);
  const active=tracker.update([hand()],300,['Left'],[],[.8]);
  assert.equal(active.point.z,.8);
  assert.equal(events.find(e=>e.type==='input:cutstart').detail.z,.8);
  assert.equal(events.filter(e=>e.type==='input:move').at(-1).detail.z,.8);
  tracker.reset();
  assert.equal(events.find(e=>e.type==='input:cutend').detail.z,.8);
  assert.equal(events.filter(e=>e.type==='input:move').at(-1).detail.mode,'idle');
});
test('cursor height is bounded and stays with the selected hand after reordering',()=>{
  const tracker=new GestureTracker(()=>{});
  assert.equal(tracker.update([hand()],0,['Left'],[],[2]).point.z,1);
  const state=tracker.update([hand(),hand()],33,['Right','Left'],[],[.1,.7]);
  assert.equal(state.point.z,.7);
  tracker.reset();
  assert.equal(tracker.update([hand()],66,['Left'],[],[-2]).point.z,0);
});
test('pinch events include height while older callers receive a finite default',()=>{
  const events=[],tracker=new GestureTracker((type,detail)=>events.push({type,detail}));
  const p=hand();p[4]={...p[8]};
  tracker.update([p],0,['Left'],[],[.4]);
  assert.equal(events.find(e=>e.type==='input:pinchstart').detail.z,.4);
  tracker.reset();
  assert.equal(events.find(e=>e.type==='input:pinchend').detail.z,.4);
  assert.equal(tracker.update([hand()],33).point.z,.5);
});
test('pinch stays active when touching fingers are marked occluded and a second hand appears',()=>{
  const events=[],tracker=new GestureTracker((type,detail)=>events.push({type,detail}));
  const closed=hand();closed[4]={...closed[8]};
  const grip={x:-2.25,y:-.775,z:1.15};
  const blocked=[[true,true,false,false,false]];
  assert.equal(tracker.update([closed],0,['Left'],blocked,[],[closed],1,[],[grip]).mode,'hand');
  assert.deepEqual(events.find(e=>e.type==='input:pinchstart').detail.world,grip);
  const state=tracker.update([hand(),closed],33,['Right','Left'],[[],blocked[0]],[],[hand(),closed],1,[],[null,grip]);
  assert.equal(state.mode,'hand');assert.equal(tracker.primaryLabel,'Left');
  assert.equal(events.some(e=>e.type==='input:pinchend'),false);
  assert.equal(events.some(e=>e.type==='input:zoom'),false);
  tracker.update([hand()],66,['Left'],[],[],[hand()]);
  assert.equal(events.filter(e=>e.type==='input:pinchend').length,1);
});
test('3D pinch hysteresis avoids flicker and rejects overlapping tips at different depths',()=>{
  const tracker=new GestureTracker(()=>{}),image=hand();image[4]={...image[8]};
  const world=hand();world[4]={...world[8]};
  assert.equal(tracker.update([image],0,['Left'],[],[],[world]).mode,'hand');
  world[4].x+=.08; // 0.4 palm lengths: keep an existing pinch
  assert.equal(tracker.update([image],33,['Left'],[],[],[world]).mode,'hand');
  world[4].z=.2; // projected tips overlap, but they are separated in depth
  assert.notEqual(tracker.update([image],66,['Left'],[],[],[world]).mode,'hand');
});
test('palm facing the upward camera activates with only index extended in the palm plane',()=>{
  const p=hand();p.forEach(point=>{point.z=0;});
  assert.equal(isIndexOnlyExtended(p),true);
  const tracker=new GestureTracker(()=>{});tracker.cameraMode='flat';
  tracker.update([p],0,['Left']);
  const state=tracker.update([p],300,['Left']);
  assert.equal(state.mode,'scalpel');
  assert.equal(state.point.x,1-p[8].x);
});
test('index-only pose activates after 300ms and folding the index releases',()=>{
  const events=[],tracker=new GestureTracker(type=>events.push(type));
  assert.equal(isIndexOnlyExtended(hand()),true);
  tracker.update([hand()],0,['Left']);
  assert.equal(tracker.update([hand()],299,['Left']).mode,'idle');
  assert.equal(tracker.update([hand()],300,['Left']).mode,'scalpel');
  assert.equal(tracker.update([hand(false)],310,['Left']).mode,'idle');
  assert.deepEqual(events.filter(e=>e.startsWith('input:cut')),['input:cutstart','input:cutend']);
});
test('pointing pose is independent of image direction and palm orientation',()=>{
  assert.equal(isIndexOnlyExtended(hand(false)),false);
  const rotated=hand().map(p=>({x:.5-(p.y-.5),y:.5+(p.x-.5),z:p.z||0}));
  assert.equal(isIndexOnlyExtended(rotated),true);
  const rolled=hand().map(p=>({x:p.x,y:.5+(p.z||0),z:p.y-.5}));
  assert.equal(isIndexOnlyExtended(rolled),true);
});
test('open palm or a second extended finger does not activate the scalpel',()=>{
  const p=hand();
  for(let j=0;j<4;j++) p[9+j]={x:.52,y:.45-j*.07,z:0};
  assert.equal(isIndexOnlyExtended(p),false);
});
test('world pose is used when the camera projection is misleading',()=>{
  const image=hand(false),world=hand();
  const tracker=new GestureTracker(()=>{});tracker.cameraMode='flat';
  tracker.update([image],0,['Left'],[],[],[world]);
  assert.equal(tracker.update([image],300,['Left'],[],[],[world]).mode,'scalpel');
});
test('hidden curled fingers do not block scalpel but hidden index releases it',()=>{
  const tracker=new GestureTracker(()=>{}),held=[[false,false,true,true,true]];
  tracker.update([hand()],0,['Left'],held);
  assert.equal(tracker.update([hand()],300,['Left'],held).mode,'scalpel');
  held[0][1]=true;
  assert.equal(tracker.update([hand()],310,['Left'],held).mode,'idle');
});
test('tracking loss releases active scalpel exactly once',()=>{
  const events=[],tracker=new GestureTracker(type=>events.push(type));
  tracker.update([hand()],0);tracker.update([hand()],300);
  tracker.reset();tracker.reset();
  assert.equal(events.filter(e=>e==='input:cutend').length,1);
});
