import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RiggedHand } from './rigged-hand.js';

async function makeHand(label='Left') {
  const data=await readFile(new URL(`./assets/${label.toLowerCase()}-hand.glb`,import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
  return new RiggedHand(new THREE.Scene(),gltf,'#9cddc5',label,new THREE.Group());
}
const pose=hand=>hand.rest.map(p=>p.clone().sub(hand.rest[0]).multiplyScalar(14).add(new THREE.Vector3(-1,.3,0)));
function vertices(hand) {
  hand.group.updateMatrixWorld(true);hand.mesh.skeleton.update();
  return Array.from({length:hand.mesh.geometry.attributes.position.count},(_,i)=>hand.mesh.getVertexPosition(i,new THREE.Vector3()));
}
test('both shipped hand assets load and produce a finite, correctly sized skinned mesh',async()=>{
  for(const label of ['Left','Right']) {
    const hand=await makeHand(label),input=pose(hand);
    hand.update(input,1/60);
    assert.equal(hand.mesh.skeleton.bones.length,25);
    const skin=vertices(hand);
    assert.ok(skin.every(p=>[p.x,p.y,p.z].every(Number.isFinite)));
    const size=new THREE.Box3().setFromPoints(skin).getSize(new THREE.Vector3());
    assert.ok(size.length()>1 && size.length()<6);
    const wrist=hand.records.get('wrist').bone;
    assert.ok(wrist.position.distanceTo(input[0])<1e-8);
  }
});
test('palm translates and turns even when three fingers have limited visibility',async()=>{
  const hand=await makeHand(),input=pose(hand);hand.update(input,1/60);
  const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.6);
  const shifted=input.map(p=>p.clone().sub(input[0]).applyQuaternion(rotation).add(input[0]).add(new THREE.Vector3(1,.3,0)));
  for(let i=0;i<40;i++) hand.update(shifted,1/60,[false,false,true,true,true]);
  assert.ok(hand.points[0].distanceTo(shifted[0])<.005);
  const direction=hand.points[9].clone().sub(hand.points[0]).normalize();
  assert.ok(direction.dot(shifted[9].clone().sub(shifted[0]).normalize())>.99);
});
test('finger curling changes the skin and uncertain fingers recover instead of sticking',async()=>{
  const hand=await makeHand(),input=pose(hand);hand.update(input,1/60);
  const before=vertices(hand);
  const curl=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),1.1);
  const changed=input.map(p=>p.clone());
  for(const i of [6,7,8]) changed[i].sub(input[5]).applyQuaternion(curl).add(input[5]);
  for(let i=0;i<60;i++) hand.update(changed,1/60,[false,true,false,false,false]);
  const after=vertices(hand);
  assert.ok(before.some((p,i)=>p.distanceTo(after[i])>.1));
  assert.ok(hand.points[8].distanceTo(input[8])>.1);
});
test('distance scaling transforms the skin and cursor together about the palm',async()=>{
  const hand=await makeHand(),input=pose(hand);hand.update(input,1/60,[],1.4);
  const pivot=hand.points[0].clone().lerp(hand.points[9],.5);
  const actual=hand.group.localToWorld(hand.points[8].clone());
  const expected=hand.points[8].clone().sub(pivot).multiplyScalar(1.4).add(pivot);
  assert.ok(actual.distanceTo(expected)<1e-8);
  assert.ok(vertices(hand).every(p=>Number.isFinite(p.y)));
});
