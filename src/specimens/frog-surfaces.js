import * as THREE from "three";

const V = (p) => new THREE.Vector3(...p);

function surface(positions, uvs, indices, columns) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  if (columns) {
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i += columns + 1) {
      const normal = new THREE.Vector3()
        .fromBufferAttribute(n, i)
        .add(new THREE.Vector3().fromBufferAttribute(n, i + columns))
        .normalize();
      n.setXYZ(i, ...normal);
      n.setXYZ(i + columns, ...normal);
    }
  }
  return g;
}

export function organicTube(
  points,
  radii,
  { segments = 48, sides = 16, flat = 0.78, wrinkle = .012, muscleRidge = 0 } = {},
) {
  const path = new THREE.CatmullRomCurve3(points.map(V));
  const positions = [],
    uvs = [],
    indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments,
      p = path.getPoint(t),
      tangent = path.getTangent(t);
    const cross = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), tangent)
      .normalize();
    const up = new THREE.Vector3().crossVectors(tangent, cross).normalize();
    const f = t * (radii.length - 1),
      a = Math.min(radii.length - 2, Math.floor(f));
    // Smooth muscle bellies and organ necks instead of radius kinks at controls.
    const u = f - a, p0 = radii[Math.max(0, a - 1)], p1 = radii[a],
      p2 = radii[a + 1], p3 = radii[Math.min(radii.length - 1, a + 2)];
    const r = Math.max(Math.min(p1, p2) * .7, .5 * (
      2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u
      + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u));
    const end = Math.sin(
      (Math.min(1, (Math.min(t, 1 - t) * segments) / 2) * Math.PI) / 2,
    );
    for (let j = 0; j <= sides; j++) {
      const theta = (j / sides) * Math.PI * 2;
      const ripple =
        1 + wrinkle * Math.sin(t * 59 + theta * 3) * Math.sin(Math.PI * t)
          + muscleRidge * Math.cos(theta * 3 + .3 * Math.sin(t * 6)) * Math.sin(Math.PI * t) ** 2;
      const q = p
        .clone()
        .addScaledVector(cross, Math.cos(theta) * r * end * ripple)
        .addScaledVector(up, Math.sin(theta) * r * end * flat * ripple);
      positions.push(...q);
      uvs.push(j / sides, t);
      if (i < segments && j < sides) {
        const k = i * (sides + 1) + j,
          next = k + sides + 1;
        indices.push(k, k + 1, next, k + 1, next + 1, next);
      }
    }
  }
  return surface(positions, uvs, indices, sides);
}

export function headGeometry() {
  const profile = [
    [-0.083, 0, 0.010, 0],
    [-0.078, 0.016, 0.010, 0.003],
    [-0.07, 0.025, 0.010, 0.007],
    [-0.06, 0.027, 0.010, 0.008],
    [-0.049, 0.026, 0.009, 0.008],
    [-0.039, 0.019, 0.009, 0.007],
    [-0.032, 0, 0.01, 0],
  ];
  const positions = [],
    uvs = [],
    indices = [],
    rows = 48,
    cols = 64;
  for (let i = 0; i <= rows; i++) {
    const t = (i / rows) * (profile.length - 1),
      a = Math.min(profile.length - 2, Math.floor(t)),
      f = t - a;
    const p = profile[a].map((v, j) => {
      const before = profile[Math.max(0, a - 1)][j],
        next = profile[a + 1][j],
        after = profile[Math.min(profile.length - 1, a + 2)][j];
      return (
        0.5 *
        (2 * v +
          (-before + next) * f +
          (2 * before - 5 * v + 4 * next - after) * f * f +
          (-before + 3 * v - 3 * next + after) * f * f * f)
      );
    });
    for (let j = 0; j <= cols; j++) {
      const angle = (j / cols) * Math.PI * 2,
        top = Math.sin(angle);
      positions.push(
        Math.cos(angle) * p[1],
        p[2] + top * p[3] * (top > 0 ? 0.77 : 1),
        p[0],
      );
      uvs.push(j / cols, i / rows);
      if (i < rows && j < cols) {
        const k = i * (cols + 1) + j,
          n = k + cols + 1;
        indices.push(k, k + 1, n, k + 1, n + 1, n);
      }
    }
  }
  return surface(positions, uvs, indices, cols);
}

export { torsoSurface as bodyWall } from "./frog-anatomy.js";

export function lobe(
  center,
  size,
  { rotate = 0, taper = 0, bend = 0, detail = 0.025 } = {},
) {
  const g = new THREE.SphereGeometry(1, 40, 28),
    p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const wave = 1 + detail * Math.sin(z * 7 + x * 3) * Math.sin(y * 5 + z * 2);
    p.setXYZ(
      i,
      (x * (1 - taper * z) + bend * (1 - z * z)) * size[0] * wave,
      y * size[1] * (1 + 0.07 * Math.sin(z * 5 + x * 2)),
      z * size[2] * wave,
    );
  }
  g.rotateY(rotate);
  g.translate(...center);
  g.computeVertexNormals();
  return g;
}

export function webbing(curveA, curveB) {
  const a = new THREE.CatmullRomCurve3(curveA.map(V)),
    b = new THREE.CatmullRomCurve3(curveB.map(V));
  const positions = [],
    uvs = [],
    indices = [],
    rows = 12,
    cols = 12;
  for (let side = 0; side < 2; side++)
    for (let i = 0; i <= rows; i++)
      for (let j = 0; j <= cols; j++) {
        const u = j / cols,
          t = (i / rows) * (0.86 - 0.3 * Math.sin(Math.PI * u));
        const p = a.getPoint(t).lerp(b.getPoint(t), u);
        p.y -= 0.00035 * Math.sin(Math.PI * u) + side * 0.00018;
        positions.push(...p);
        uvs.push(u, i / rows);
        if (i < rows && j < cols) {
          const k = side * (rows + 1) * (cols + 1) + i * (cols + 1) + j,
            n = k + cols + 1;
          if (side) indices.push(k, k + 1, n, k + 1, n + 1, n);
          else indices.push(k, n, k + 1, k + 1, n, n + 1);
        }
      }
  const offset = (rows + 1) * (cols + 1);
  const edge = [];
  for (let j = 0; j <= cols; j++) edge.push(j);
  for (let i = 1; i <= rows; i++) edge.push(i * (cols + 1) + cols);
  for (let j = cols - 1; j >= 0; j--) edge.push(rows * (cols + 1) + j);
  for (let i = rows - 1; i > 0; i--) edge.push(i * (cols + 1));
  edge.forEach((a, i) => {
    const b = edge[(i + 1) % edge.length];
    indices.push(a, b, a + offset, b, b + offset, a + offset);
  });
  if (curveB[0][0] < curveA[0][0])
    for (let i = 0; i < indices.length; i += 3)
      [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  return surface(positions, uvs, indices);
}

export function irisGeometry(center, direction) {
  const positions = [],
    uvs = [],
    indices = [],
    rows = 12,
    cols = 64;
  for (let i = 0; i <= rows; i++)
    for (let j = 0; j <= cols; j++) {
      const r = i / rows,
        theta = (j / cols) * Math.PI * 2;
      positions.push(
        Math.cos(theta) * r * 0.0056,
        Math.sin(theta) * r * 0.0048,
        Math.sqrt(1 - r * r) * 0.0019,
      );
      uvs.push(
        0.5 + Math.cos(theta) * r * 0.5,
        0.5 + Math.sin(theta) * r * 0.5,
      );
      if (i < rows && j < cols) {
        const k = i * (cols + 1) + j,
          n = k + cols + 1;
        indices.push(k, n, k + 1, k + 1, n, n + 1);
      }
    }
  const g = surface(positions, uvs, indices, cols);
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      V(direction).normalize(),
    ),
  );
  g.translate(...center);
  return g;
}

// Keep the geometry builders independent of the replaceable appearance layer.
export { frogMaterials } from "./frog-materials.js";
