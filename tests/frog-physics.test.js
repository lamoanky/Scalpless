import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createPhysics } from "../src/physics.js";
import { liverGeometries, abdomenGeometry, abdomenColliderGeometries } from "../src/specimens/frog-anatomy.js";

test("thin liver lobes settle after rotated releases on the tray and collection floor", async () => {
  const physics = await createPhysics();
  const geometries = liverGeometries();
  const group = new THREE.Group();
  const meshes = geometries.map((g) => new THREE.Mesh(g));
  group.add(...meshes);
  const part = {
    id: "liver",
    group,
    meshes,
    compoundCollider: true,
    collisionGeometries: geometries,
  };
  try {
    for (const x of [-0.1507, -0.24])
      for (const rotation of [0, Math.PI / 12, 0.9, 1.8]) {
        group.position.set(x, 0.034, -0.00046);
        group.quaternion.setFromEuler(new THREE.Euler(0.12, rotation, 0.08));
        const body = physics.createBody(part);
        assert.equal(body.numColliders(), 3);
        for (let i = 0; i < 360; i++) physics.step();
        const box = new THREE.Box3().setFromObject(group, true);
        assert(Number.isFinite(box.min.y));
        assert(
          box.min.y > -0.004,
          `Liver stayed above the floor at ${x}, ${rotation}: ${box.min.y}`,
        );
        assert(Math.abs(body.linvel().y) < 0.03, "Released organ settled");
      }
  } finally {
    physics.world.free();
    geometries.forEach((g) => g.dispose());
  }
});

test("the thin abdominal wall settles on the floor and tray lip without tunneling", async () => {
  const physics = await createPhysics(), geometry = abdomenGeometry();
  const group = new THREE.Group(), mesh = new THREE.Mesh(geometry);
  group.add(mesh);
  const colliders = abdomenColliderGeometries();
  const part = { id: "abdomen", group, meshes: [mesh],
    compoundCollider: true, collisionGeometries: colliders };
  try {
    for (const x of [-.15, -.24]) for (const angle of [0, .4, 1.2]) {
      group.position.set(x, .034, 0);
      group.rotation.set(.1, angle, .1);
      const body = physics.createBody(part);
      assert.equal(body.numColliders(), 24);
      for (let i = 0; i < 360; i++) physics.step();
      const box = new THREE.Box3().setFromObject(group, true);
      assert(box.min.y > -.004, `Abdominal wall stayed on the bench: ${box.min.y}`);
      assert(Math.abs(body.linvel().y) < .03, "Cover settles after release");
    }
  } finally {
    physics.world.free(); geometry.dispose(); colliders.forEach(g => g.dispose());
  }
});
