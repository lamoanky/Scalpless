import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { organicTube } from "../src/specimens/frog-surfaces.js";
import { prepareFrogPose, applyFrogPose } from "../src/specimens/frog-pose.js";

test("presentation posing returns exactly to detailed lab vertices without changing surface coordinates", () => {
  const g=organicTube([[.019,.012,-.031],[.046,.007,-.021],[.061,.003,-.049]],[.007,.005,.003]);
  const positions=g.attributes.position.array.slice(), normals=g.attributes.normal.array.slice(), uv=g.attributes.uv.array.slice();
  prepareFrogPose(g,{kind:"fore",side:1});
  applyFrogPose(g,0);
  assert.notDeepEqual(g.attributes.position.array,positions);
  assert.deepEqual(g.attributes.frogRestPosition.array,positions);
  const seated=g.attributes.position.array.slice();
  for (const t of [.4,.8,.2,1,0]) applyFrogPose(g,t);
  assert.deepEqual(g.attributes.position.array,seated,"Reverse scroll has no accumulated drift");
  applyFrogPose(g,1);
  assert.deepEqual(g.attributes.position.array,positions);
  assert.deepEqual(g.attributes.normal.array,normals);
  assert.deepEqual(g.attributes.uv.array,uv);
  assert([...g.attributes.position.array].every(Number.isFinite));
  g.dispose();
});

test("torso and internal organ surfaces do not deform during limb posing", () => {
  const g=new THREE.SphereGeometry(.02,16,12), positions=g.attributes.position.array.slice();
  prepareFrogPose(g);
  for(const t of [0,.2,.5,.9,1]) {
    applyFrogPose(g,t);
    assert.deepEqual(g.attributes.position.array,positions);
  }
  g.dispose();
});
