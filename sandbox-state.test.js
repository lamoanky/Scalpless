import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SandboxState,LAB,guide,snapCutPoint} from './sandbox-state.js';

test('cube can only be grabbed within 3D reach, including height',()=>{
  const state=new SandboxState();state.move({...state.cube,y:2});assert.equal(state.grab(),false);
  state.move({...state.cube,x:-1.9});assert.equal(state.grab(),true);
  const offset=state.cube.x-state.cursor.x;
  state.move({x:0,y:1,z:0});assert.ok(Math.abs(state.cube.x-offset)<1e-9);assert.equal(state.grabbed,true);
});
test('holding a pinch before reaching the cube latches on entry and release disarms it',()=>{
  const state=new SandboxState();
  state.beginPinch({x:0,y:1,z:1});assert.equal(state.grabbed,false);
  state.move({...state.cube});assert.equal(state.grabbed,true);
  state.release();state.move({...state.cube});assert.equal(state.grabbed,false);
  assert.equal(state.pinchHeld,false);
});
test('release drops into tray and completes grab task only after settling',()=>{
  const state=new SandboxState();state.move({...state.cube});state.grab();
  state.move({x:LAB.trayX,y:1,z:LAB.trayZ});state.release();
  assert.equal(state.placed,false);
  for(let i=0;i<120;i++)state.tick(1/60);
  assert.equal(state.placed,true);assert.equal(state.cube.y,LAB.trayY+LAB.cubeHalf);
});
test('releasing outside tray settles on table and permits retry',()=>{
  const state=new SandboxState();state.move({...state.cube});state.grab();state.move({x:0,y:1,z:2});state.release();
  for(let i=0;i<120;i++)state.tick(1/60);
  assert.equal(state.placed,false);assert.equal(state.cube.y,LAB.floor+LAB.cubeHalf);
  state.move({...state.cube});assert.equal(state.grab(),true);
});
test('cutting in the air or outside the pad never advances the guide',()=>{
  const state=new SandboxState();state.move({x:0,y:LAB.padY+1,z:LAB.padZ});state.startCut();
  state.move({x:1,y:LAB.padY+1,z:LAB.padZ});state.move({x:4,y:LAB.padY,z:LAB.padZ});
  assert.equal(state.progress,0);assert.equal(state.strokes.length,0);
});
test('nearby scalpel snaps to pad and holds through small height jitter',()=>{
  const point={x:0,y:LAB.padY+.6,z:LAB.padZ};
  const snap=snapCutPoint(point);assert.equal(snap.snapped,true);assert.equal(snap.point.y,LAB.padY);
  assert.equal(snap.onGuide,true);assert.equal(point.y,LAB.padY+.6);
  assert.equal(snapCutPoint({...point,y:LAB.padY+.8},true).snapped,true);
  assert.equal(snapCutPoint({...point,y:LAB.padY+.8},false).snapped,false);
  assert.equal(snapCutPoint({...point,y:LAB.padY+1},true).snapped,false);
  assert.equal(snapCutPoint({...point,x:2.2},true).snapped,false);
});
test('surface preview does not cut and hand tool never snaps',()=>{
  const state=new SandboxState(),point={x:0,y:LAB.padY+.5,z:LAB.padZ};
  state.move(point,'scalpel');assert.equal(state.snapped,true);assert.equal(state.progress,0);assert.equal(state.strokes.length,0);
  state.move(point,'hand');assert.equal(state.snapped,false);assert.equal(state.cursor.y,point.y);
  state.move(point,'scalpel');state.startCut();assert.ok(state.progress>0);
  state.move({...point,y:LAB.padY+1.2});assert.equal(state.snapped,false);
  const count=state.strokes.length;state.move({...point,x:1,y:LAB.padY+1.2});assert.equal(state.strokes.length,count);
});
test('snapping assists height without moving laterally onto the guide',()=>{
  const point={x:.2,y:LAB.padY+.3,z:LAB.padZ+.6};
  const snap=snapCutPoint(point);assert.equal(snap.snapped,true);assert.equal(snap.onGuide,false);
  assert.equal(snap.point.x,point.x);assert.equal(snap.point.z,point.z);
});
test('tracing guide in contact completes cut and ends leave no phantom stroke',()=>{
  const state=new SandboxState();state.move({...guide[0],y:LAB.padY});state.startCut();
  guide.forEach(p=>state.move({...p,y:LAB.padY}));state.endCut();
  assert.equal(state.cutComplete,true);assert.equal(state.progress,1);
  const count=state.strokes.length;state.move({x:0,y:LAB.padY,z:LAB.padZ});assert.equal(state.strokes.length,count);
});
test('teleporting across guide cannot claim the missing incision',()=>{
  const state=new SandboxState();state.move({...guide[0],y:LAB.padY});state.startCut();state.move({...guide.at(-1),y:LAB.padY});
  assert.ok(state.progress<.3);assert.equal(state.strokes.at(-1).break,true);
});
test('tracking cancellation releases cube, stops cutting, and reset clears progress',()=>{
  const state=new SandboxState();state.move({...state.cube});state.grab();state.cancel();
  assert.equal(state.grabbed,false);assert.equal(state.cursor,null);
  state.move({...guide[0],y:LAB.padY});state.startCut();state.cancel();assert.equal(state.cutting,false);
  state.reset();assert.equal(state.progress,0);assert.equal(state.placed,false);assert.equal(state.falling,false);
});
