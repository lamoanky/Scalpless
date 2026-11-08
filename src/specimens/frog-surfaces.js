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
  { segments = 48, sides = 16, flat = 0.78 } = {},
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
    const r = THREE.MathUtils.lerp(radii[a], radii[a + 1], f - a);
    const end = Math.sin(
      (Math.min(1, (Math.min(t, 1 - t) * segments) / 2) * Math.PI) / 2,
    );
    for (let j = 0; j <= sides; j++) {
      const theta = (j / sides) * Math.PI * 2;
      const wrinkle =
        1 + 0.018 * Math.sin(t * 59 + theta * 3) * Math.sin(Math.PI * t);
      const q = p
        .clone()
        .addScaledVector(cross, Math.cos(theta) * r * end * wrinkle)
        .addScaledVector(up, Math.sin(theta) * r * end * flat * wrinkle);
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
    [-0.08, 0, 0.012, 0],
    [-0.077, 0.014, 0.012, 0.004],
    [-0.07, 0.025, 0.011, 0.008],
    [-0.06, 0.029, 0.01, 0.011],
    [-0.049, 0.026, 0.009, 0.01],
    [-0.039, 0.018, 0.009, 0.008],
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

export function bodyWall() {
  const profile = new THREE.CatmullRomCurve3(
    [
      [0, 0.001, 0],
      [0.45, 0.0017, 0],
      [0.84, 0.005, 0],
      [1.035, 0.012, 0],
      [1.055, 0.019, 0],
      [1, 0.0243, 0],
      [0.965, 0.0242, 0],
      [0.88, 0.016, 0],
      [0.5, 0.014, 0],
      [0, 0.014, 0],
    ].map(V),
  );
  const positions = [],
    uvs = [],
    indices = [],
    rows = 54,
    cols = 96;
  for (let i = 0; i <= rows; i++) {
    const p = profile.getPoint(i / rows);
    for (let j = 0; j <= cols; j++) {
      const a = (j / cols) * Math.PI * 2;
      positions.push(Math.cos(a) * p.x * 0.029, p.y, Math.sin(a) * p.x * 0.042);
      uvs.push(j / cols, i / rows);
      if (i < rows && j < cols) {
        const k = i * (cols + 1) + j,
          n = k + cols + 1;
        indices.push(k, n, k + 1, k + 1, n, n + 1);
      }
    }
  }
  return surface(positions, uvs, indices, cols);
}

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

export async function frogMaterials() {
  const loader = new THREE.TextureLoader(),
    base = `${import.meta.env.BASE_URL}textures/frog/`;
  async function maps(name) {
    const [map, normalMap, roughnessMap] = await Promise.all(
      ["color", "normal", "roughness"].map((k) =>
        loader.loadAsync(`${base}${name}-${k}.webp`),
      ),
    );
    map.colorSpace = THREE.SRGBColorSpace;
    for (const t of [map, normalMap, roughnessMap]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
    }
    return { map, normalMap, roughnessMap };
  }
  const [skinMaps, bellyMaps, tissueMaps, muscleMaps, irisMap] =
    await Promise.all([
      maps("skin"),
      maps("belly"),
      maps("tissue"),
      maps("muscle"),
      loader.loadAsync(`${base}iris-color.webp`),
    ]);
  irisMap.colorSpace = THREE.SRGBColorSpace;
  const skin = new THREE.MeshPhysicalMaterial({
    ...skinMaps,
    roughness: 0.8,
    normalScale: new THREE.Vector2(0.36, 0.36),
    clearcoat: 0.18,
    clearcoatRoughness: 0.42,
  });
  // Continuous ventral coloration across a single limb surface avoids the old
  // separate cream "petal" shapes. The blend follows the baked surface normal.
  skin.onBeforeCompile = (shader) => {
    shader.uniforms.bellyMap = { value: bellyMaps.map };
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nvarying float vVentral;",
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <beginnormal_vertex>",
      "#include <beginnormal_vertex>\nvVentral=smoothstep(.08,.78,normal.y);",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nvarying float vVentral; uniform sampler2D bellyMap;",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      "#include <map_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb, texture2D(bellyMap,vMapUv).rgb, vVentral*.96);",
    );
  };
  skin.customProgramCacheKey = () => "frog-ventral-skin-v1";
  const belly = new THREE.MeshPhysicalMaterial({
    ...bellyMaps,
    roughness: 0.87,
    normalScale: new THREE.Vector2(0.3, 0.3),
    clearcoat: 0.12,
    clearcoatRoughness: 0.45,
  });
  function tissue(color, roughness = 0.6) {
    return new THREE.MeshPhysicalMaterial({
      ...tissueMaps,
      color,
      roughness,
      normalScale: new THREE.Vector2(0.25, 0.25),
      clearcoat: 0.2,
      clearcoatRoughness: 0.3,
      sheen: 0.22,
      sheenColor: new THREE.Color("#deb2a1"),
    });
  }
  const translucent = new THREE.MeshPhysicalMaterial({
    color: "#2980cd",
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
    roughness: 0.38,
    clearcoat: 0.22,
    side: THREE.FrontSide,
  });
  translucent.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `diffuseColor.a *= .65 + .9 * pow(1. - abs(dot(normal, normalize(vViewPosition))), 2.);\n#include <opaque_fragment>`,
    );
  };
  return {
    skin,
    belly,
    translucent,
    cavity: tissue("#8a6956", 0.85),
    rim: tissue("#ab8c70", 0.78),
    heart: tissue("#9c3942", 0.58),
    liver: tissue("#634139", 0.62),
    lung: tissue("#cf9991", 0.72),
    stomach: tissue("#ccab83", 0.73),
    intestine: tissue("#bf9275", 0.72),
    muscle: new THREE.MeshPhysicalMaterial({
      ...muscleMaps,
      roughness: 0.69,
      normalScale: new THREE.Vector2(0.28, 0.28),
      clearcoat: 0.15,
    }),
    bone: tissue("#d6c69f", 0.84),
    artery: tissue("#983f43", 0.65),
    vein: tissue("#3c6170", 0.7),
    lip: tissue("#5b6040", 0.9),
    iris: new THREE.MeshPhysicalMaterial({
      map: irisMap,
      roughness: 0.18,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }),
  };
}
