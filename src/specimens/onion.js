import * as THREE from "three";
import { createSeamGlow } from "../seam-glow.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const ONION_ORIGIN = new THREE.Vector3(-0.078, 0.022, -0.012);
export const HEIGHT = 0.118;
const PROFILE = [
  [0, 0.12],
  [0.025, 0.34],
  [0.075, 0.59],
  [0.16, 0.84],
  [0.29, 0.98],
  [0.42, 1],
  [0.55, 0.98],
  [0.68, 0.9],
  [0.78, 0.69],
  [0.86, 0.37],
  [0.92, 0.16],
  [1, 0.105],
];
const RADIUS = 0.056;
const LAYER_RADII = [
  1, 0.987, 0.858, 0.728, 0.606, 0.478, 0.361, 0.247, 0.124, 0,
];
// Keep the supported seam in front of the silhouette from the working camera.
const MODEL_YAW = -Math.PI / 12;
const UP = new THREE.Vector3(0, 1, 0);
function smoothRadius(t) {
  let i = 0;
  while (i < PROFILE.length - 2 && t > PROFILE[i + 1][0]) i++;
  const a = PROFILE[i],
    b = PROFILE[i + 1],
    u = (t - a[0]) / (b[0] - a[0]);
  const prev = PROFILE[Math.max(0, i - 1)],
    next = PROFILE[Math.min(PROFILE.length - 1, i + 2)];
  const m0 = ((b[1] - prev[1]) / (b[0] - prev[0])) * (b[0] - a[0]);
  const m1 = ((next[1] - a[1]) / (next[0] - a[0])) * (b[0] - a[0]);
  return (
    (2 * u * u * u - 3 * u * u + 1) * a[1] +
    (u * u * u - 2 * u * u + u) * m0 +
    (-2 * u * u * u + 3 * u * u) * b[1] +
    (u * u * u - u * u) * m1
  );
}
export function onionPoint(t, theta, layer = 0) {
  const scale = LAYER_RADII[layer] ?? 0;
  const height = HEIGHT * (1 - layer * 0.025);
  const ribs =
    1 +
    (0.008 + Math.pow(t, 7) * 0.035) * Math.sin(theta * 17 + t * 3) +
    0.0015 * Math.sin(theta * 39 - t * 12);
  const radius = RADIUS * smoothRadius(t) * scale * ribs;
  const bend = -0.016 * Math.pow(t, 3);
  const neck = Math.pow(Math.max(0, (t - 0.84) / 0.16), 2);
  const tornRim =
    neck *
    0.0019 *
    (Math.sin(theta * 7 + layer * 0.8) + 0.55 * Math.sin(theta * 19));
  return new THREE.Vector3(
    Math.sin(theta) * radius + bend * scale,
    t * height + 0.00035 * layer + tornRim,
    Math.cos(theta) * radius,
  ).applyAxisAngle(UP, MODEL_YAW);
}
export function seamPoint(t) {
  return onionPoint(0.16 + t * 0.7, 0, 0).add(
    new THREE.Vector3(0.00015, 0, 0.00025),
  );
}

function rng(seed = 318) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
// Meridian distance distributes texels evenly through the shoulder and tapered neck.
const meridianUVs = LAYER_RADII.map((scale, layer) => {
  const values = [0],
    height = HEIGHT * (1 - layer * 0.025);
  let length = 0;
  for (let i = 1; i <= 1024; i++) {
    const dr =
      RADIUS * scale * (smoothRadius(i / 1024) - smoothRadius((i - 1) / 1024));
    length += Math.hypot(dr, height / 1024);
    values.push(length);
  }
  return values.map((v) => v / length);
});
function meridianUV(t, layer) {
  const x = Math.min(1024, Math.max(0, t * 1024)),
    i = Math.floor(x);
  const table = meridianUVs[layer];
  return THREE.MathUtils.lerp(table[i], table[Math.min(i + 1, 1024)], x - i);
}
async function textures() {
  // Authored at native resolution; palette follows the reference, detail is synthesized.
  const loader = new THREE.TextureLoader();
  const asset = (name) =>
    `${import.meta.env.BASE_URL}models/onion/textures/${name}`;
  const [skin, roughness, normal, cut, fleshNormal] = await Promise.all([
    loader.loadAsync(asset("onion-skin-color-4k.webp")),
    loader.loadAsync(asset("onion-skin-roughness-4k.png")),
    loader.loadAsync(asset("onion-skin-normal-4k.png")),
    loader.loadAsync(asset("onion-flesh-color-2k.webp")),
    loader.loadAsync(asset("onion-flesh-normal-2k.png")),
  ]);
  skin.colorSpace = cut.colorSpace = THREE.SRGBColorSpace;
  for (const map of [skin, roughness, normal, cut, fleshNormal])
    map.anisotropy = 16;
  for (const map of [skin, roughness, normal]) map.wrapS = THREE.RepeatWrapping;
  return { skin, roughness, normal, cut, fleshNormal };
}

function shellGeometry(layer, startAngle, endAngle) {
  const positions = [],
    uvs = [],
    indices = [],
    groups = [];
  function surface(fn, rows, cols, material, flip = false, longitude = false) {
    const base = positions.length / 3,
      begin = indices.length;
    for (let v = 0; v <= rows; v++)
      for (let u = 0; u <= cols; u++) {
        const p = fn(u / cols, v / rows);
        positions.push(p.x, p.y, p.z);
        uvs.push(
          longitude
            ? (startAngle + (u / cols) * (endAngle - startAngle)) /
                (Math.PI * 2) +
                0.25
            : u / cols,
          longitude
            ? meridianUV(v / rows, layer + (material === 1 ? 1 : 0))
            : v / rows,
        );
      }
    for (let v = 0; v < rows; v++)
      for (let u = 0; u < cols; u++) {
        const a = base + v * (cols + 1) + u,
          b = a + 1,
          c = a + cols + 1,
          d = c + 1;
        if (flip) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
    groups.push({
      start: begin,
      count: indices.length - begin,
      materialIndex: material,
    });
  }
  surface(
    (u, v) => onionPoint(v, startAngle + u * (endAngle - startAngle), layer),
    42,
    48,
    0,
    false,
    true,
  );
  surface(
    (u, v) =>
      onionPoint(v, startAngle + u * (endAngle - startAngle), layer + 1),
    42,
    48,
    1,
    true,
    true,
  );
  for (const [theta, flip] of [
    [startAngle, true],
    [endAngle, false],
  ])
    surface(
      (u, v) => {
        const point = onionPoint(v, theta, layer).lerp(
          onionPoint(v, theta, layer + 1),
          u,
        );
        const normal = new THREE.Vector3(
          Math.cos(theta),
          0,
          -Math.sin(theta),
        ).applyAxisAngle(UP, MODEL_YAW);
        // Slightly raised moist tissue gives each closed cut face a soft edge.
        const relief =
          (layer === 0 ? 0.00003 : 0.00042) *
          Math.sin(u * Math.PI) *
          Math.sin(v * Math.PI);
        return point.addScaledVector(normal, (flip ? -1 : 1) * relief);
      },
      42,
      4,
      2,
      flip,
    );
  surface(
    (u, v) =>
      onionPoint(0, startAngle + u * (endAngle - startAngle), layer).lerp(
        onionPoint(0, startAngle + u * (endAngle - startAngle), layer + 1),
        v,
      ),
    2,
    48,
    2,
    true,
  );
  surface(
    (u, v) =>
      onionPoint(1, startAngle + u * (endAngle - startAngle), layer).lerp(
        onionPoint(1, startAngle + u * (endAngle - startAngle), layer + 1),
        v,
      ),
    2,
    48,
    2,
  );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  groups.forEach((g) => geometry.addGroup(g.start, g.count, g.materialIndex));
  geometry.computeVertexNormals();
  // Both halves use the same surface derivative at their shared seam.
  // Face-cap vertices stay split so the incised edge remains crisp.
  const normals = geometry.attributes.normal;
  for (let surface = 0; surface < 2; surface++) {
    for (let row = 0; row <= 42; row++)
      for (let col = 0; col <= 48; col++) {
        const t = row / 42,
          theta = startAngle + (col / 48) * (endAngle - startAngle);
        const l = layer + surface,
          e = 0.0001;
        const along = onionPoint(t, theta + e, l).sub(
          onionPoint(t, theta - e, l),
        );
        const up = onionPoint(Math.min(1, t + e), theta, l).sub(
          onionPoint(Math.max(0, t - e), theta, l),
        );
        const n = along
          .cross(up)
          .normalize()
          .multiplyScalar(surface ? -1 : 1);
        if (n.lengthSq() > 0.5)
          normals.setXYZ(surface * 43 * 49 + row * 49 + col, n.x, n.y, n.z);
      }
  }
  geometry.userData.restNormals = new Float32Array(normals.array);
  geometry.userData.rest = new Float32Array(positions);
  return geometry;
}

export async function createOnion(scene) {
  const tex = await textures();
  const skin = new THREE.MeshPhysicalMaterial({
    color: "#fff5fc",
    map: tex.skin,
    normalMap: tex.normal,
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughnessMap: tex.roughness,
    roughness: 0.85,
    ior: 1.46,
    sheen: 0.18,
    sheenColor: new THREE.Color("#d7a0c6"),
    sheenRoughness: 0.65,
    clearcoat: 0.35,
    clearcoatRoughness: 0.22,
    side: THREE.DoubleSide,
  });
  const flesh = new THREE.MeshPhysicalMaterial({
    color: "#dfacd9",
    normalMap: tex.fleshNormal,
    normalScale: new THREE.Vector2(0.4, 0.4),
    ior: 1.34,
    roughness: 0.3,
    clearcoat: 0.65,
    clearcoatRoughness: 0.19,
    side: THREE.DoubleSide,
  });
  const inner = new THREE.MeshPhysicalMaterial({
    color: "#f1dce9",
    normalMap: tex.fleshNormal,
    normalScale: new THREE.Vector2(0.25, 0.25),
    ior: 1.34,
    roughness: 0.33,
    clearcoat: 0.55,
    side: THREE.DoubleSide,
  });
  const cut = new THREE.MeshPhysicalMaterial({
    map: tex.cut,
    normalMap: tex.fleshNormal,
    normalScale: new THREE.Vector2(0.6, 0.6),
    ior: 1.34,
    roughness: 0.24,
    clearcoat: 0.58,
    clearcoatRoughness: 0.15,
    sheen: 0.12,
    sheenColor: new THREE.Color("#edd6e5"),
    side: THREE.DoubleSide,
  });
  const parts = new Map();
  function createPart(id, label) {
    const group = new THREE.Group();
    group.name = id;
    group.userData = {
      id,
      label,
      attachment:
        id === "section" ? "supported-longitudinal-seam" : "basal-plate",
    };
    group.position.copy(ONION_ORIGIN);
    scene.add(group);
    const part = {
      id,
      label,
      group,
      meshes: [],
      layer: null,
      initialPosition: ONION_ORIGIN.clone(),
    };
    parts.set(id, part);
    return part;
  }
  const section = createPart("section", "Cut section");
  for (let i = 0; i < 8; i++) {
    const exterior = i === 0 ? skin : flesh;
    const cutFace = cut.clone();
    cutFace.color.setHSL(
      0.9 + i * 0.003,
      0.12 + (i % 3) * 0.025,
      0.97 - (i % 3) * 0.012,
    );
    const right = new THREE.Mesh(shellGeometry(i, 0, Math.PI), [
      exterior,
      inner,
      cutFace,
    ]);
    right.name = `section-layer-${i}`;
    right.castShadow = right.receiveShadow = true;
    right.userData.partId = "section";
    section.group.add(right);
    section.meshes.push(right);
    const part = createPart(
      `layer-${i}`,
      i === 0 ? "Outer skin" : `Fleshy layer ${i}`,
    );
    part.layer = i;
    const left = new THREE.Mesh(shellGeometry(i, Math.PI, Math.PI * 2), [
      exterior,
      inner,
      cutFace,
    ]);
    left.name = `peelable-layer-${i}`;
    left.castShadow = left.receiveShadow = true;
    left.userData.partId = part.id;
    part.group.add(left);
    part.meshes.push(left);
  }
  // A closed central core remains in place after the surrounding scales are peeled.
  const core = createPart("core", "Onion core");
  core.fixed = true;
  const coreMesh = new THREE.Mesh(shellGeometry(8, Math.PI, Math.PI * 2), [
    inner,
    inner,
    cut,
  ]);
  coreMesh.castShadow = coreMesh.receiveShadow = true;
  coreMesh.userData.partId = "core";
  core.group.add(coreMesh);
  core.meshes.push(coreMesh);
  const coreRight = new THREE.Mesh(shellGeometry(8, 0, Math.PI), [
    inner,
    inner,
    cut,
  ]);
  coreRight.castShadow = coreRight.receiveShadow = true;
  coreRight.userData.partId = "section";
  section.group.add(coreRight);
  section.meshes.push(coreRight);

  // The epidermis sits on a fleshy scale and is revealed once that scale is free.
  const epidermis = createPart("epidermis", "Epidermis membrane");
  const eg = new THREE.PlaneGeometry(1, 1, 14, 20);
  for (let row = 0; row <= 20; row++)
    for (let col = 0; col <= 14; col++) {
      const p = onionPoint(
        0.3 + (row / 20) * 0.32,
        Math.PI * (1.12 + (col / 14) * 0.3),
        2,
      );
      p.x += 0.0003;
      eg.attributes.position.setXYZ(row * 15 + col, p.x, p.y, p.z);
    }
  eg.computeVertexNormals();
  eg.userData.rest = new Float32Array(eg.attributes.position.array);
  eg.userData.canonical = new Float32Array(eg.userData.rest);
  const membrane = new THREE.Mesh(
    eg,
    new THREE.MeshPhysicalMaterial({
      color: "#ead8e9",
      transparent: true,
      opacity: 0.72,
      roughness: 0.3,
      side: THREE.DoubleSide,
      clearcoat: 0.8,
      depthWrite: false,
    }),
  );
  membrane.userData.partId = "epidermis";
  membrane.castShadow = false;
  epidermis.group.add(membrane);
  epidermis.meshes.push(membrane);
  epidermis.group.visible = false;

  // Irregular paper ribbons continue the torn neck silhouette in the reference.
  for (const [part, start] of [
    [section, 0],
    [parts.get("layer-0"), Math.PI],
  ]) {
    const geometries = [],
      random = rng(start === 0 ? 62 : 91);
    for (let k = 0; k < 14; k++) {
      const theta = start + ((k + 0.3 + random() * 0.4) / 14) * Math.PI,
        width = 0.0025 + random() * 0.0025;
      const anchor = onionPoint(0.945, theta),
        length = 0.005 + random() * 0.009;
      const pos = [],
        uv = [],
        idx = [];
      for (let row = 0; row <= 7; row++)
        for (let side = 0; side < 2; side++) {
          const t = row / 7,
            w = (side - 0.5) * width * (1 - t * 0.92),
            curl = t * t * (0.002 + random() * 0.0008);
          pos.push(
            anchor.x + Math.cos(theta) * w + Math.sin(theta) * curl - 0.005 * t,
            anchor.y + length * t,
            anchor.z - Math.sin(theta) * w + Math.cos(theta) * curl,
          );
          uv.push(
            theta / (Math.PI * 2) + 0.25 + (side - 0.5) * 0.01,
            meridianUV(0.9 + t * 0.1, 0),
          );
        }
      for (let row = 0; row < 7; row++) {
        const a = row * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      geometries.push(g);
    }
    const g = mergeGeometries(geometries);
    g.userData.rest = new Float32Array(g.attributes.position.array);
    const fray = new THREE.Mesh(g, skin);
    fray.name = "papery-neck-frays";
    fray.castShadow = true;
    fray.userData.partId = part.id;
    part.group.add(fray);
    part.meshes.push(fray);
    geometries.forEach((g) => g.dispose());
  }
  const roots = new THREE.Group();
  roots.name = "root-tuft";
  roots.position.copy(ONION_ORIGIN);
  scene.add(roots);
  const rootMat = new THREE.MeshStandardMaterial({
      color: "#aa8b65",
      roughness: 0.86,
    }),
    rootGeometries = [],
    random = rng(42);
  for (let i = 0; i < 72; i++) {
    const a = random() * Math.PI * 2,
      r = 0.002 + random() * 0.005,
      length = 0.007 + random() * 0.016;
    const points = [];
    for (let j = 0; j <= 7; j++) {
      const t = j / 7,
        angle = a + Math.sin(t * 7 + i) * 0.32;
      points.push(
        new THREE.Vector3(
          Math.cos(angle) * (r + length * t),
          0.0003 + (1 - t) * 0.002 + Math.sin(t * Math.PI * 3 + i) * 0.0005 * t,
          Math.sin(angle) * (r + length * t),
        ),
      );
    }
    const g = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points),
      16,
      0.00012 + random() * 0.00013,
      4,
      false,
    );
    rootGeometries.push(g);
  }
  const plate = new THREE.Mesh(
    new THREE.SphereGeometry(0.0068, 20, 10),
    new THREE.MeshStandardMaterial({ color: "#9f886d", roughness: 0.85 }),
  );
  plate.name = "basal-root-plate";
  plate.scale.y = 0.25;
  plate.position.y = 0.0014;
  plate.castShadow = true;
  roots.add(plate);
  const rootMesh = new THREE.Mesh(mergeGeometries(rootGeometries), rootMat);
  rootMesh.name = "root-fibers";
  rootMesh.castShadow = true;
  roots.add(rootMesh);
  rootGeometries.forEach((g) => g.dispose());

  const guidePoints = Array.from({ length: 97 }, (_, i) =>
    seamPoint(i / 96).add(ONION_ORIGIN),
  );
  const guideGeometry = new THREE.BufferGeometry().setFromPoints(guidePoints);
  const guide = new THREE.Line(
    guideGeometry,
    new THREE.LineDashedMaterial({
      color: "#d0eff8",
      dashSize: 0.0018,
      gapSize: 0.0016,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    }),
  );
  guide.computeLineDistances();
  guide.renderOrder = 5;
  guide.visible = false;
  scene.add(guide);
  const lineArray = new Float32Array(96 * 6),
    cutLine = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: "#4a123e" }),
    );
  cutLine.geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(lineArray, 3),
  );
  cutLine.geometry.setDrawRange(0, 0);
  scene.add(cutLine);

  const seamGlow = createSeamGlow(scene, guidePoints);
  const updateSeam = seamGlow.update;

  const graspMarker = new THREE.Mesh(
    new THREE.TorusGeometry(0.003, 0.00018, 6, 30),
    new THREE.MeshBasicMaterial({
      color: "#86c9d8",
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    }),
  );
  graspMarker.renderOrder = 7;
  graspMarker.visible = false;
  scene.add(graspMarker);
  function updateCut(bins, options) {
    seamGlow.setCut(bins, options);
    let count = 0;
    bins.forEach((v, i) => {
      if (v) {
        lineArray.set(guidePoints[i].toArray(), count * 3);
        lineArray.set(guidePoints[i + 1].toArray(), (count + 1) * 3);
        count += 2;
      }
    });
    cutLine.geometry.attributes.position.needsUpdate = true;
    cutLine.geometry.setDrawRange(0, count);
    cutLine.geometry.computeBoundingSphere();
  }
  function deform(part, bend, direction = new THREE.Vector3(1, 0, 0.2)) {
    const dir = direction.clone();
    dir.y = 0;
    if (dir.lengthSq() < 0.001) dir.set(1, 0, 0.2);
    dir.normalize();
    for (const object of part.meshes) {
      const g = object.geometry,
        rest = g.userData.rest,
        p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = rest[i * 3],
          y = rest[i * 3 + 1],
          z = rest[i * 3 + 2];
        if (part.id === "epidermis") {
          const t = Math.floor(i / 15) / 20;
          const a = bend * t * 2.8;
          p.setXYZ(
            i,
            x + dir.x * bend * t * 0.026,
            y + Math.sin(a) * 0.013 + bend * t * 0.018,
            z + dir.z * bend * t * 0.026,
          );
        } else {
          const h = HEIGHT * (1 - (part.layer ?? 0) * 0.025),
            t = Math.max(0, Math.min(1, y / h));
          const a = bend * 1.7 * t;
          const sideways =
            bend < 0.001 ? 0 : ((1 - Math.cos(a)) / (bend * 1.7)) * h;
          const newY =
            bend < 0.001
              ? y
              : (Math.sin(a) / (bend * 1.7)) * h + bend * t * 0.025;
          p.setXYZ(i, x + dir.x * sideways, newY, z + dir.z * sideways);
        }
      }
      p.needsUpdate = true;
      if (bend < 0.001 && g.userData.restNormals) {
        g.attributes.normal.array.set(g.userData.restNormals);
        g.attributes.normal.needsUpdate = true;
      } else g.computeVertexNormals();
      g.computeBoundingSphere();
      g.computeBoundingBox();
    }
  }
  function prepareMembrane(bend, direction) {
    const p = eg.attributes.position,
      rest = eg.userData.canonical,
      dir = direction.clone().normalize(),
      h = HEIGHT * (1 - 0.025);
    for (let i = 0; i < p.count; i++) {
      const x = rest[i * 3],
        y = rest[i * 3 + 1],
        z = rest[i * 3 + 2],
        t = Math.max(0, Math.min(1, y / h)),
        a = bend * 1.7 * t;
      const shift = bend < 0.001 ? 0 : ((1 - Math.cos(a)) / (bend * 1.7)) * h;
      eg.userData.rest[i * 3] = x + dir.x * shift;
      eg.userData.rest[i * 3 + 1] =
        bend < 0.001 ? y : (Math.sin(a) / (bend * 1.7)) * h + bend * t * 0.025;
      eg.userData.rest[i * 3 + 2] = z + dir.z * shift;
    }
  }
  // Specimen-specific interaction rules keep the shared lab independent of anatomy.
  for (const part of parts.values())
    part.interaction = part.id === "section" ? "lift" : "peel";
  function isOpen(states) {
    return (
      states.section.detached &&
      parts.get("section").group.position.distanceTo(ONION_ORIGIN) > 0.025
    );
  }
  let membraneReady = false;
  return {
    id: "onion",
    label: "Onion",
    openingPartId: "section",
    isOpen,
    available(states) {
      const result = [parts.get("section")];
      if (isOpen(states)) {
        for (let i = 0; i < 8; i++) {
          const part = parts.get(`layer-${i}`);
          result.push(part);
          if (!states[part.id].detached) break;
        }
      }
      if (states["layer-1"].detached) result.push(parts.get("epidermis"));
      return result;
    },
    colliderParts(states) {
      const ids = states.section.detached ? [] : ["section"];
      ids.push(
        [...parts.values()].find(
          (p) => p.id.startsWith("layer-") && !states[p.id].detached,
        )?.id ?? "core",
      );
      return ids.map((id) => parts.get(id));
    },
    graspPoint(part) {
      if (part.id === "section")
        return new THREE.Vector3(0.017, 0.059, 0.019).applyMatrix4(
          part.group.matrixWorld,
        );
      const mesh = part.meshes[0],
        p = mesh.geometry.attributes.position;
      const index =
        part.id === "epidermis"
          ? 10 * 15 + 7 // centre of the 15x21 membrane grid: easiest to see and reach
          : Math.min(p.count - 1, 31 * 49 + 48);
      return new THREE.Vector3()
        .fromBufferAttribute(p, index)
        .applyMatrix4(mesh.matrixWorld);
    },
    graspEdge(part, contact) {
      if (part.id === "epidermis") return undefined;
      let best = Infinity,
        edge = null;
      const p = part.meshes[0].geometry.attributes.position;
      for (let row = 5; row <= 41; row++)
        for (const col of [0, 48]) {
          const vertex = row * 49 + col;
          const point = new THREE.Vector3()
            .fromBufferAttribute(p, vertex)
            .applyMatrix4(part.group.matrixWorld);
          const distance = point.distanceTo(contact);
          if (distance < best) {
            best = distance;
            edge = { vertex, point };
          }
        }
      return best <= 0.018 ? edge : null;
    },
    restoreAttachments(states) {
      membraneReady = false;
      prepareMembrane(
        states["layer-1"].bend,
        new THREE.Vector3(...states["layer-1"].direction),
      );
    },
    updateAttachments(states) {
      if (!states["layer-1"].detached || states.epidermis.detached) return;
      const e = parts.get("epidermis"),
        carrier = parts.get("layer-1");
      e.group.visible = true;
      if (!membraneReady) {
        prepareMembrane(
          states["layer-1"].bend,
          new THREE.Vector3(...states["layer-1"].direction),
        );
        deform(
          e,
          states.epidermis.bend,
          new THREE.Vector3(...states.epidermis.direction),
        );
        membraneReady = true;
      }
      e.group.position.copy(carrier.group.position);
      e.group.quaternion.copy(carrier.group.quaternion);
    },
    parts,
    roots,
    guide,
    cutLine,
    seamGlow: seamGlow.mesh,
    graspMarker,
    updateCut,
    updateSeam,
    deform,
    prepareMembrane,
    origin: ONION_ORIGIN,
    guidePoints,
  };
}
