import test from 'node:test';
import assert from 'node:assert/strict';
import { landingFrame } from '../src/landing-motion.js';

test('one rigid pose settles completely before input ownership changes',()=>{
  let previous=landingFrame(0);
  assert.equal(previous.pose,0);assert.equal(previous.platform,0);
  for(let i=1;i<=1000;i++){
    const next=landingFrame(i/1000);
    for(const key of ['pose','camera','platform']) {
      assert(next[key]>=previous[key]);assert(next[key]-previous[key]<.004);
    }
    if(next.canEnter){assert.equal(next.pose,1);assert.equal(next.camera,1);assert.equal(next.platform,1);}
    previous=next;
  }
  assert.equal(previous.panelsOpacity,0);assert(previous.canEnter);
});
test('reversing scroll restores the exact pose, without accumulated rotations',()=>{
  const f=landingFrame(.43);landingFrame(.9);assert.deepEqual(landingFrame(.43),f);
  assert.deepEqual(landingFrame(-1),landingFrame(0));assert.deepEqual(landingFrame(8),landingFrame(1));
  assert.equal(landingFrame(.98).canEnter,false);assert.equal(landingFrame(NaN).progress,0);
});
test('reduced motion switches poses without a rotation or camera animation',()=>{
  for(const p of [0,.3,.7,1]) {
    const f=landingFrame(p,{still:true});
    for(const key of ['pose','camera','platform'])assert.equal(f[key],p>=.82?1:0);
  }
  assert(landingFrame(1,{still:true}).canEnter);
});
