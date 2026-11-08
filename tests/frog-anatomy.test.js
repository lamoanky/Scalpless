import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { abdomenGeometry, abdomenPoint, liverGeometries, lungGeometry,
  torsoSurface } from "../src/specimens/frog-anatomy.js";

test("the supported incision remains on the actual cover at every sample", () => {
  const cover = new THREE.Mesh(abdomenGeometry(), new THREE.MeshBasicMaterial());
  const ray = new THREE.Raycaster();
  for (let i = 0; i <= 96; i++) {
    const p = abdomenPoint(i / 96 * Math.PI * 2, .94);
    ray.set(new THREE.Vector3(p.x, .1, p.z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(cover)[0];
    assert(hit, `Incision ${i} hits the exterior, not a gap/backface`);
    assert(Math.abs(hit.point.y - p.y) < .0001, `Incision ${i} matches the skin`);
  }
  cover.geometry.dispose(); cover.material.dispose();
});

test("detachable sculpted organs are closed, finite surfaces with outward tops", () => {
  const shapes = [abdomenGeometry(), ...liverGeometries(), lungGeometry(1), lungGeometry(-1)];
  for (const g of shapes) {
    const p = g.attributes.position;
    assert([...p.array, ...g.attributes.normal.array, ...g.attributes.uv.array].every(Number.isFinite));
    // Weld seams/poles for the topology audit, without modifying render geometry.
    const keys = Array.from({ length: p.count }, (_, i) =>
      [p.getX(i), p.getY(i), p.getZ(i)].map(v => Math.round(v * 1e7)).join(","));
    const edges = new Map();
    for (let i = 0; i < g.index.count; i += 3) {
      const tri = [0, 1, 2].map(k => keys[g.index.getX(i + k)]);
      if (new Set(tri).size < 3) continue;
      for (let k = 0; k < 3; k++) {
        const key = [tri[k], tri[(k + 1) % 3]].sort().join("|");
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    assert([...edges.values()].every(n => n === 2), "Every nondegenerate edge has two faces");
    g.computeBoundingBox();
    const center = g.boundingBox.getCenter(new THREE.Vector3());
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
    const ray = new THREE.Raycaster(new THREE.Vector3(center.x, .1, center.z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(mesh)[0];
    assert(hit && hit.face.normal.y > 0, "Visible top faces point outward");
    mesh.material.dispose(); g.dispose();
  }
});

test("the exterior torso and inner lining share their opening without a mesh gap", () => {
  const outer = torsoSurface(), inner = torsoSurface(true);
  const a = outer.attributes.position, b = inner.attributes.position;
  for (let i = 0; i <= 96; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(a, a.count - 97 + i);
    assert(v.distanceTo(new THREE.Vector3().fromBufferAttribute(b, i)) < 1e-7);
  }
  outer.dispose(); inner.dispose();
});

test("the liver and lungs fit beneath the intact abdominal skin", () => {
  const material = new THREE.MeshBasicMaterial();
  const cover = new THREE.Mesh(abdomenGeometry(), material);
  const ray = new THREE.Raycaster();
  for (const organ of [...liverGeometries(), lungGeometry(1), lungGeometry(-1)]) {
    const p = organ.attributes.position;
    for (let i = 0; i < p.count; i += 8) {
      ray.set(new THREE.Vector3(p.getX(i), .1, p.getZ(i)), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(cover)[0];
      assert(hit && hit.point.y >= p.getY(i) - .0001,
        `Organ protrudes through skin at ${p.getX(i)}, ${p.getY(i)}, ${p.getZ(i)}`);
    }
    organ.dispose();
  }
  cover.geometry.dispose(); material.dispose();
});
