import * as THREE from "three";

// Part-local metres. The cover, opening, incision and collider arcs share this
// outline so visual refinements cannot silently move the supported cut off-skin.
export function cavityOutline(angle, radius = 1) {
  const taper = 1 - .14 * Math.sin(angle) + .04 * Math.cos(2 * angle)
    + .025 * Math.sin(3 * angle);
  return [Math.cos(angle) * .028 * taper * radius,
    Math.sin(angle) * .041 * radius];
}

export function rimHeight(angle) {
  return .025 - .0025 * Math.cos(angle) ** 2 + .0007 * Math.sin(3 * angle);
}

export function abdomenPoint(angle, radius = 1, underside = false) {
  const [x, z] = cavityOutline(angle, radius);
  const y = THREE.MathUtils.lerp(.033, rimHeight(angle), radius ** 3)
    + .0005 * Math.sin(angle * 7 + radius * 4) * radius * (1 - radius);
  return new THREE.Vector3(x, y - (underside ? .0011 : 0), z);
}

function geometry(position, uv, index) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// Two surfaces with a closed tissue edge, rather than a thick ceramic-like dome.
export function abdomenGeometry() {
  const p = [], uv = [], indices = [], rows = 28, cols = 80;
  for (let side = 0; side < 2; side++) {
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
      p.push(...abdomenPoint(c / cols * Math.PI * 2, r / rows, side === 1));
      uv.push(c / cols, r / rows);
      if (r < rows && c < cols) {
        const a = side * (rows + 1) * (cols + 1) + r * (cols + 1) + c;
        const b = a + cols + 1;
        if (side) indices.push(a, b, a + 1, b, b + 1, a + 1);
        else indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const offset = (rows + 1) * (cols + 1);
  for (let c = 0; c < cols; c++) {
    const a = rows * (cols + 1) + c, b = a + offset;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return geometry(p, uv, indices);
}

// Thin, curved tissue needs several small hulls. One wide hull of the whole
// cover is numerically unstable at this scale when it lands on a tray edge.
export function abdomenColliderGeometries() {
  const patches = [], rings = [0, .4, .75, 1];
  for (let ring = 0; ring < 3; ring++) for (let sector = 0; sector < 8; sector++) {
    const points = [];
    for (let side = 0; side < 2; side++) for (let r = 0; r <= 6; r++) for (let c = 0; c <= 6; c++) {
      const radius = THREE.MathUtils.lerp(rings[ring], rings[ring + 1], r / 6);
      const angle = (sector + c / 6) / 8 * Math.PI * 2;
      points.push(...abdomenPoint(angle, radius, side === 1));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    patches.push(g);
  }
  return patches;
}

export function torsoSurface(lining = false) {
  const profile = new THREE.CatmullRomCurve3((lining ? [
    [1, 1, 0], [.97, .78, 0], [.87, .48, 0], [.55, .39, 0], [0, .4, 0],
  ] : [
    [0, .05, 0], [.6, .12, 0], [1.13, .37, 0], [1.23, .62, 0],
    [1.14, .84, 0], [1, 1, 0],
  ]).map(p => new THREE.Vector3(...p)));
  const p = [], uv = [], indices = [], rows = 38, cols = 96;
  for (let r = 0; r <= rows; r++) {
    const section = profile.getPoint(r / rows);
    for (let c = 0; c <= cols; c++) {
      const angle = c / cols * Math.PI * 2;
      const [x, z] = cavityOutline(angle, section.x);
      // Collapse the floor poles to one point; rim undulation fades inward.
      const edgeHeight = THREE.MathUtils.lerp(.019, rimHeight(angle), Math.min(1, section.x));
      p.push(x, section.y * edgeHeight, z);
      uv.push(c / cols, r / rows);
      if (r < rows && c < cols) {
        const a = r * (cols + 1) + c, b = a + cols + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  return geometry(p, uv, indices);
}

// A closed lobe with an authored, asymmetric silhouette and a thin free edge.
// The broad faces are gently domed, unlike scaled spheres with round edges.
export function leafOrgan(center, outline, thickness, tilt = [0, 0]) {
  const area = outline.reduce((sum, [x, z], i) => {
    const next = outline[(i + 1) % outline.length];
    return sum + x * next[1] - z * next[0];
  }, 0);
  if (area < 0) outline = [...outline].reverse();
  const curve = new THREE.CatmullRomCurve3(
    outline.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, "centripetal",
  );
  const p = [], uv = [], indices = [], rows = 24, cols = 72;
  for (let side = 0; side < 2; side++) {
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
      const edge = curve.getPoint(c / cols), radius = r / rows;
      const x = edge.x * radius, z = edge.z * radius;
      const depth = .0003 + thickness * Math.pow(Math.max(0, 1 - radius * radius), .65);
      const fold = .00012 * Math.sin(x * 1250 + Math.sin(z * 700)) * radius * (1 - radius);
      const y = center[1] + tilt[0] * x + tilt[1] * z
        + (side ? -.65 : 1) * depth + fold;
      p.push(center[0] + x, y, center[2] + z);
      uv.push(c / cols, radius);
      if (r < rows && c < cols) {
        const a = side * (rows + 1) * (cols + 1) + r * (cols + 1) + c;
        const b = a + cols + 1;
        if (side) indices.push(a, b, a + 1, b, b + 1, a + 1);
        else indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const offset = (rows + 1) * (cols + 1);
  for (let c = 0; c < cols; c++) {
    const a = rows * (cols + 1) + c, b = a + offset;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return geometry(p, uv, indices);
}

export function liverGeometries() {
  return [
    leafOrgan([-.0115, .023, -.009], [
      [-.002,-.019],[-.011,-.013],[-.013,-.001],[-.012,.012],
      [-.004,.021],[.004,.017],[.010,.006],[.008,-.004],[.003,-.010],
    ], .0034, [.025, -.025]),
    leafOrgan([.010, .023, -.012], [
      [-.007,-.014],[.004,-.016],[.013,-.008],[.014,.004],
      [.007,.011],[-.002,.009],[-.009,.002],
    ], .003, [-.04, -.02]),
    leafOrgan([.010, .021, .010], [
      [-.007,-.012],[.001,-.014],[.011,-.007],[.010,.007],
      [.003,.017],[-.005,.013],[-.008,.001],
    ], .0028, [.025, -.06]),
  ];
}

export function lungGeometry(side) {
  const g = new THREE.SphereGeometry(1, 48, 32), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const waist = .94 + .18 * z - .10 * Math.exp(-(((z + .75) / .23) ** 2));
    const lobulation = 1 + .045 * Math.sin(z * 11 + x * 3) * (1 - z * z);
    p.setXYZ(i,
      side * (.0175 + x * .005 * waist * lobulation + .0006 * (1 - z * z)),
      .018 + y * .0048 * lobulation,
      -.022 + z * .010 * (side < 0 ? .95 : 1),
    );
  }
  // Mirroring coordinates reverses winding, so restore the outward faces.
  if (side < 0) {
    const indices = g.index.array;
    for (let i = 0; i < indices.length; i += 3)
      [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  }
  g.computeVertexNormals();
  return g;
}

export const STOMACH_PATH = [
  [.012,.016,-.024],[.018,.016,-.015],[.021,.015,-.004],
  [.019,.015,.008],[.013,.0145,.017],[.006,.014,.017],
];
export const INTESTINE_PATH = [
  [.006,.014,.017],[.009,.014,.024],[.003,.014,.029],[-.005,.014,.024],
  [-.009,.014,.016],[-.016,.0135,.017],[-.018,.0135,.025],[-.012,.014,.032],
  [-.004,.014,.033],[.003,.014,.029],[.001,.018,.023],[-.005,.018,.019],
  [-.011,.018,.022],[-.010,.018,.027],[-.003,.017,.028],[.004,.013,.033],
  [0,.012,.037],
];
