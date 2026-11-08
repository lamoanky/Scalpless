import * as THREE from "three";

// Seam progress outline: a thin tube along the incision. Uncut stretches stay
// faint, cut stretches glow, and freshly cut bins flash and swell briefly.
// Shared by every specimen; guidePoints holds 97 points for 96 coverage bins.
const BINS = 96,
  SIDES = 6;
const UNCUT = [0.85, 0.94, 1, 0.2],
  CUT = [1, 0.8, 0.22, 1],
  HOT = [1, 0.98, 0.86, 1];

export function createSeamGlow(scene, guidePoints, { radius = 0.00042 } = {}) {
  const rings = guidePoints.length;
  const frames = new THREE.CatmullRomCurve3(guidePoints).computeFrenetFrames(
    rings - 1,
  );
  const positions = new Float32Array(rings * SIDES * 3),
    colors = new Float32Array(rings * SIDES * 4),
    index = [];
  for (let i = 0; i < rings - 1; i++)
    for (let s = 0; s < SIDES; s++) {
      const a = i * SIDES + s,
        b = i * SIDES + ((s + 1) % SIDES),
        c = a + SIDES,
        d = b + SIDES;
      index.push(a, c, b, b, c, d);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));
  geometry.setIndex(index);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  mesh.name = "seam-progress";
  mesh.renderOrder = 6;
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);
  const cut = new Uint8Array(BINS),
    heat = new Float32Array(BINS);
  let complete = false;

  function paint(time = 0) {
    // Sweeping shimmer keeps the remaining path readable without hints.
    for (let i = 0; i < rings; i++) {
      const left = Math.max(0, i - 1),
        right = Math.min(BINS - 1, i);
      const isCut = complete || cut[left] || cut[right];
      const h = Math.max(heat[left], heat[right]);
      const base = isCut ? CUT : UNCUT;
      const shimmer = isCut
        ? 0
        : 0.18 * Math.max(0, Math.sin(i * 0.22 - time * 4)) ** 6;
      const scale = 1 + h * 1.4 + (isCut ? 0.9 : 0);
      const point = guidePoints[i],
        n = frames.normals[i],
        b = frames.binormals[i];
      for (let s = 0; s < SIDES; s++) {
        const angle = (s / SIDES) * Math.PI * 2,
          c = Math.cos(angle) * radius * scale,
          sn = Math.sin(angle) * radius * scale,
          v = i * SIDES + s;
        positions[v * 3] = point.x + n.x * c + b.x * sn;
        positions[v * 3 + 1] = point.y + n.y * c + b.y * sn;
        positions[v * 3 + 2] = point.z + n.z * c + b.z * sn;
        for (let k = 0; k < 4; k++)
          colors[v * 4 + k] =
            base[k] + (HOT[k] - base[k]) * h + (k < 3 ? shimmer : shimmer * 2);
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  }
  // Returns true while any bin is still cooling, so the caller keeps it shown.
  function update(dt, visible, time) {
    mesh.visible = visible;
    let hot = false;
    for (let i = 0; i < BINS; i++) {
      if (heat[i] > 0) {
        heat[i] = Math.max(0, heat[i] - dt * 2.2);
        hot = true;
      }
    }
    if (visible) paint(time);
    return hot;
  }
  function setCut(bins, { complete: done = false, flash = true } = {}) {
    for (let i = 0; i < BINS; i++) {
      if (flash && bins[i] && !cut[i]) heat[i] = 1;
      if (!flash) heat[i] = 0;
      cut[i] = bins[i];
    }
    // Completing the incision lights the whole outline at once.
    if (flash && done && !complete) heat.fill(1);
    complete = done;
  }
  paint();
  return { mesh, update, setCut };
}
