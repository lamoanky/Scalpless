import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createPhysics } from "../src/physics.js";
import { lobe } from "../src/specimens/frog-surfaces.js";

test("thin liver lobes settle after rotated releases on the tray and collection floor", async () => {
  const physics = await createPhysics();
  const geometries = [
    lobe([-0.012, 0.026, -0.008], [0.0135, 0.0056, 0.0175], {
      rotate: -0.28,
      taper: 0.24,
      bend: 0.16,
      detail: 0.065,
    }),
    lobe([0.01, 0.026, -0.008], [0.012, 0.0051, 0.014], {
      rotate: 0.3,
      taper: 0.2,
      bend: -0.13,
      detail: 0.05,
    }),
    lobe([0.006, 0.023, 0.009], [0.01, 0.0046, 0.0135], {
      rotate: -0.24,
      taper: 0.25,
      detail: 0.06,
    }),
  ];
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
