import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessHand, VisibilityGuard } from './tracking-quality.js';
function openHand() {
  const p=Array.from({length:21},()=>({x:.5,y:.8,z:0}));
  const chains=[[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
  chains.forEach((chain,i)=>chain.forEach((index,j)=>{p[index]={x:.3+i*.1,y:.6-j*.09,z:0};}));
  return p;
}
test('separated open fingers are usable while head-on index is flagged independently',()=>{
  const p=openHand();
  assert.ok(assessHand(p).every(f=>!f.uncertain));
  [6,7,8].forEach((index,i)=>{p[index]={x:p[5].x,y:p[5].y-.004*(i+1),z:-.08*(i+1)};});
  const quality=assessHand(p);
  assert.equal(quality[1].uncertain,true);
  assert.equal(quality[2].uncertain,false);
});
test('guard blocks immediately but waits for 120ms of continuous clear view',()=>{
  const g=new VisibilityGuard();
  const clear=Array.from({length:5},()=>({uncertain:false}));
  const blocked=clear.map((q,i)=>({uncertain:i===1}));
  assert.equal(g.update('Left',clear,0)[1],false);
  assert.equal(g.update('Left',blocked,10)[1],true);
  assert.equal(g.update('Left',clear,20)[1],true);
  assert.equal(g.update('Left',clear,139)[1],true);
  assert.equal(g.update('Left',clear,140)[1],false);
  assert.equal(g.update('Right',clear,141)[1],false);
});
test('interrupted recovery restarts the timer and reset forgets old hands',()=>{
  const g=new VisibilityGuard(),clear=[{uncertain:false}],blocked=[{uncertain:true}];
  g.update('Left',blocked,0);g.update('Left',clear,20);g.update('Left',blocked,100);
  assert.equal(g.update('Left',clear,140)[0],true);
  assert.equal(g.update('Left',clear,260)[0],false);
  g.update('Left',blocked,270);g.reset();
  assert.equal(g.update('Left',clear,280)[0],false);
});
