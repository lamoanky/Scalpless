import test from 'node:test';
import assert from 'node:assert/strict';
import { landingFrame } from '../src/landing-motion.js';

test('scrolling rotates the Blender preview without revealing the bench or changing models',()=>{
  let previous=landingFrame(0);
  for(let i=0;i<=1000;i++){
    const next=landingFrame(i/1000);
    assert(next.previewRotation>=previous.previewRotation);
    assert(next.previewRotation-previous.previewRotation<.007);
    assert.equal(next.handoff,0);assert.equal(next.platform,0);
    assert.equal(next.pose,0);assert.equal(next.camera,0);
    assert.equal(next.backdropOpacity,1);assert.equal(next.panelSpread,0);
    assert.equal(next.canEnter,false);
    previous=next;
  }
  assert.equal(previous.previewRotation,Math.PI);
});
test('only the explicit entry timeline hands off and unlocks the laboratory',()=>{
  for(const progress of [0,.43,1]) {
    let previous=landingFrame(progress);
    for(let i=1;i<=1000;i++) {
      const next=landingFrame(progress,{entry:i/1000});
      for(const key of ['pose','camera','platform','handoff']) {
        assert(next[key]>=previous[key]);assert(next[key]-previous[key]<.005);
      }
      if(next.handoff>0)assert(next.platform>0);
      assert.equal(next.canEnter,i===1000);
      previous=next;
    }
    for(const key of ['pose','camera','platform','handoff'])assert.equal(previous[key],1);
    assert.equal(previous.backdropOpacity,0);
  }
});
test('reversing the preview restores the exact orientation and entry is clamped',()=>{
  const f=landingFrame(.43);landingFrame(.9);assert.deepEqual(landingFrame(.43),f);
  assert.deepEqual(landingFrame(-1),landingFrame(0));assert.deepEqual(landingFrame(8),landingFrame(1));
  assert.equal(landingFrame(NaN).progress,0);
  assert.equal(landingFrame(1,{entry:NaN}).canEnter,false);
  assert.equal(landingFrame(0,{entry:2}).canEnter,true);
});
test('reduced motion keeps the preview still until the explicit entry',()=>{
  for(const progress of [0,.3,.7,1]) {
    const f=landingFrame(progress,{still:true});
    for(const key of ['previewRotation','pose','camera','platform','handoff'])assert.equal(f[key],0);
    assert.equal(f.canEnter,false);
    const entered=landingFrame(progress,{still:true,entry:1});
    for(const key of ['pose','camera','platform','handoff'])assert.equal(entered[key],1);
    assert(entered.canEnter);
  }
});
