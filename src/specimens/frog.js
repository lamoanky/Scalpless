import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  organicTube,
  headGeometry,
  bodyWall,
  lobe,
  webbing,
  irisGeometry,
  frogMaterials,
} from "./frog-surfaces.js";

// Reference-guided ventral anatomy in metres. Replace the geometry here without
// changing input events, the controller, or the physical placement workflow.
export const FROG_ORIGIN = new THREE.Vector3(-0.078, 0.022, 0);
export const FROG_ORGANS = [
  "heart",
  "liver",
  "lung-left",
  "lung-right",
  "stomach",
  "intestines",
];

function dome() {
  const positions = [],
    uv = [],
    indices = [],
    rows = 20,
    cols = 64;
  for (let side = 0; side < 2; side++)
    for (let row = 0; row <= rows; row++) {
      const a = ((row / rows) * Math.PI) / 2;
      for (let col = 0; col <= cols; col++) {
        const angle = (col / cols) * Math.PI * 2;
        positions.push(
          Math.sin(a) * Math.cos(angle) * 0.029,
          0.0237 + Math.cos(a) * 0.015 - side * 0.0017,
          Math.sin(a) * Math.sin(angle) * 0.042,
        );
        uv.push(col / cols, row / rows);
      }
    }
  const offset = (rows + 1) * (cols + 1);
  for (let side = 0; side < 2; side++)
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++) {
        const a = side * offset + row * (cols + 1) + col,
          b = a + cols + 1;
        if (side) indices.push(a, b, a + 1, b, b + 1, a + 1);
        else indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
  for (let col = 0; col < cols; col++) {
    const a = rows * (cols + 1) + col,
      b = a + offset;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export async function createFrog(scene) {
  const materials = await frogMaterials();
  const { skin, belly } = materials;
  const parts = new Map(),
    skinSurfaces = [],
    anatomyMeshes = [];
  let anatomyView = false;
  function part(id, label, grasp, color, fixed = false) {
    const group = new THREE.Group();
    group.name = `frog-${id}`;
    group.position.copy(FROG_ORIGIN);
    scene.add(group);
    const result = {
      id,
      label,
      group,
      meshes: [],
      initialPosition: FROG_ORIGIN.clone(),
      layer: null,
      interaction: "lift",
      fixed,
      grasp: new THREE.Vector3(...grasp),
      color,
    };
    parts.set(id, result);
    return result;
  }
  function mesh(
    part,
    geometry,
    material,
    collision = true,
    anatomyOnly = false,
  ) {
    geometry.userData.rest = geometry.attributes.position.array.slice();
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = m.receiveShadow = true;
    m.userData.partId = part.id;
    m.userData.noCollision = !collision;
    part.group.add(m);
    // Internal muscles and vessels are visual anatomy, not competing hit targets.
    if (anatomyOnly) {
      m.visible = false;
      anatomyMeshes.push(m);
    } else part.meshes.push(m);
    if (material === skin || material === belly) skinSurfaces.push(m);
    return m;
  }
  function organ(
    part,
    center,
    size,
    material,
    shape = {},
    collision = true,
    anatomyOnly = false,
  ) {
    return mesh(
      part,
      lobe(center, size, shape),
      material,
      collision,
      anatomyOnly,
    );
  }
  function tube(
    part,
    points,
    radii,
    material,
    collision = true,
    anatomyOnly = false,
    options = {},
  ) {
    return mesh(
      part,
      organicTube(
        points,
        Array.isArray(radii) ? radii : [radii, radii],
        options,
      ),
      material,
      collision,
      anatomyOnly,
    );
  }
  function vessels(part, points, radius, anatomyOnly = false) {
    tube(part, points, radius, materials.artery, false, anatomyOnly, {
      segments: 24,
      sides: 8,
      flat: 1,
    });
    const alternate = points.map(([x, y, z]) => [
      x + 0.0008,
      y - 0.00012,
      z + 0.0002,
    ]);
    tube(part, alternate, radius * 0.82, materials.vein, false, anatomyOnly, {
      segments: 24,
      sides: 8,
      flat: 1,
    });
    for (let i = 1; i < points.length - 1; i++) {
      const [x, y, z] = points[i],
        side = i % 2 ? 1 : -1;
      tube(
        part,
        [
          [x, y, z],
          [x + side * 0.002, y - 0.0004, z + 0.001],
          [x + side * 0.004, y - 0.001, z + 0.003],
        ],
        [radius * 0.6, radius * 0.3, 0.00004],
        materials.artery,
        false,
        anatomyOnly,
        { segments: 12, sides: 6, flat: 1 },
      );
    }
  }

  const body = part("body", "Frog body", [0, 0.02, 0], "#78834f", true);
  body.compoundCollider = true;
  mesh(body, bodyWall(), skin, false);
  const wallColliders = [lobe([0, 0.007, 0], [0.031, 0.0068, 0.045])];
  organ(body, [0, 0.014, 0], [0.027, 0.0027, 0.04], materials.cavity, {
    detail: 0.035,
  });
  // One continuous skin surface, with separate invisible collider arcs.
  for (let i = 0; i < 24; i++) {
    const wall = Array.from({ length: 6 }, (_, j) => {
      const a = ((i + j / 5) / 24) * Math.PI * 2;
      return [Math.cos(a) * 0.0297, 0.0188, Math.sin(a) * 0.0425];
    });
    wallColliders.push(
      organicTube(wall, [0.003, 0.003], { segments: 10, sides: 10, flat: 1.6 }),
    );
  }
  const lip = Array.from({ length: 97 }, (_, i) => {
    const a = (i / 96) * Math.PI * 2;
    return [Math.cos(a) * 0.0283, 0.0243, Math.sin(a) * 0.0411];
  });
  tube(body, lip, 0.00048, materials.rim, false, false, {
    segments: 144,
    sides: 8,
    flat: 0.65,
  });
  mesh(body, headGeometry(), skin);
  // Mouth line follows the broad jaw, with a narrow upper lip and shallow throat folds.
  const jaw = Array.from({ length: 33 }, (_, i) => {
    const a = -Math.PI * 0.56 + (i / 32) * Math.PI * 1.12;
    return [
      Math.sin(a) * 0.027,
      0.016 - 0.0015 * Math.cos(a),
      -0.054 - Math.cos(a) * 0.021,
    ];
  });
  tube(body, jaw, 0.00034, materials.lip, false, false, {
    segments: 64,
    sides: 8,
  });
  for (let k = 0; k < 4; k++) {
    const fold = Array.from({ length: 17 }, (_, i) => {
      const a = (i / 16 - 0.5) * 2;
      return [
        a * (0.019 - k * 0.001),
        0.0188 - 0.0004 * k - 0.003 * a * a,
        -0.048 + k * 0.0018 + 0.002 * a * a,
      ];
    });
    tube(body, fold, 0.00012, materials.rim, false, false, {
      segments: 24,
      sides: 6,
    });
  }
  // Muscle beneath the translucent throat, hidden in the natural-skin view.
  organ(
    body,
    [0, 0.01, -0.052],
    [0.023, 0.0065, 0.02],
    materials.muscle,
    { detail: 0.035 },
    false,
    true,
  );

  for (const side of [-1, 1]) {
    const mirror = (points) => points.map(([x, y, z]) => [x * side, y, z]);
    organ(body, [side * 0.024, 0.009, -0.063], [0.0076, 0.0066, 0.0082], skin, {
      detail: 0.015,
    });
    mesh(
      body,
      irisGeometry([side * 0.0275, 0.013, -0.066], [side * 0.64, 0.65, -0.4]),
      materials.iris,
      false,
    );
    // Upper arm, elbow and forearm are one continuous tapered surface.
    const arm = mirror([
      [0.023, 0.012, -0.033],
      [0.034, 0.011, -0.027],
      [0.046, 0.007, -0.021],
      [0.052, 0.005, -0.031],
      [0.058, 0.0037, -0.044],
      [0.06, 0.0032, -0.049],
    ]);
    const armR = [0.006, 0.007, 0.006, 0.0048, 0.0034, 0.0045];
    tube(body, arm, armR, skin, true, false, {
      segments: 64,
      sides: 24,
      flat: 0.72,
    });
    tube(
      body,
      arm,
      armR.map((r) => r * 0.81),
      materials.muscle,
      false,
      true,
      { segments: 48, sides: 16, flat: 0.71 },
    );
    const armV = arm
      .slice(1, -1)
      .map(([x, y, z], i) => [x, y + armR[i + 1] * 0.82 * 0.72 + 0.0002, z]);
    vessels(body, armV, 0.00023, true);
    // Small palm flows into four fingers, with unequal phalange lengths.
    organ(body, [side * 0.061, 0.003, -0.049], [0.005, 0.0025, 0.006], skin, {
      rotate: side * 0.28,
      detail: 0.03,
    });
    const fingerEnds = [
      [-0.012, -0.013],
      [-0.003, -0.019],
      [0.006, -0.018],
      [0.014, -0.011],
    ];
    for (let i = 0; i < 4; i++) {
      const [dx, dz] = fingerEnds[i];
      const digit = mirror([
        [0.057 + i * 0.0026, 0.003, -0.05],
        [0.061 + dx * 0.46, 0.0027, -0.049 + dz * 0.53],
        [0.061 + dx * 0.83, 0.002, -0.049 + dz * 0.87],
        [0.061 + dx, 0.0014, -0.049 + dz],
      ]);
      tube(body, digit, [0.0015, 0.00125, 0.0008, 0.00045], skin, true, false, {
        segments: 24,
        sides: 10,
        flat: 0.72,
      });
      tube(
        body,
        digit,
        [0.00055, 0.00048, 0.0003, 0.00012],
        materials.bone,
        false,
        true,
        { segments: 16, sides: 8, flat: 1 },
      );
    }
    // Muscular femur, folded shank and elongated tarsus, without isolated blobs.
    const leg = mirror([
      [0.02, 0.012, 0.029],
      [0.037, 0.013, 0.044],
      [0.052, 0.009, 0.055],
      [0.064, 0.0065, 0.043],
      [0.073, 0.0044, 0.025],
      [0.078, 0.003, 0.039],
      [0.081, 0.0026, 0.053],
    ]);
    const legR = [0.007, 0.0125, 0.0084, 0.0063, 0.004, 0.0036, 0.0054];
    tube(body, leg, legR, skin, true, false, {
      segments: 90,
      sides: 28,
      flat: 0.78,
    });
    tube(
      body,
      leg,
      legR.map((r) => r * 0.82),
      materials.muscle,
      false,
      true,
      { segments: 72, sides: 20, flat: 0.75 },
    );
    vessels(
      body,
      leg
        .slice(1, -1)
        .map(([x, y, z], i) => [x, y + legR[i + 1] * 0.82 * 0.75 + 0.0002, z]),
      0.0003,
      true,
    );
    tube(
      body,
      mirror([
        [0.072, 0.004, 0.026],
        [0.077, 0.003, 0.041],
        [0.081, 0.0028, 0.053],
      ]),
      [0.0012, 0.001, 0.0007],
      materials.bone,
      false,
      true,
      { segments: 28, sides: 10, flat: 1 },
    );
    organ(body, [side * 0.081, 0.0028, 0.054], [0.0058, 0.0022, 0.007], skin, {
      rotate: side * 0.2,
      detail: 0.04,
    });
    const toes = [];
    const lengths = [0.012, 0.018, 0.026, 0.029, 0.021];
    for (let i = 0; i < 5; i++) {
      const dx = (i - 2) * 0.0067,
        len = lengths[i];
      const digit = mirror([
        [0.075 + i * 0.0029, 0.0028, 0.054],
        [0.081 + dx * 0.5, 0.0022, 0.057 + len * 0.42],
        [0.081 + dx * 0.92, 0.0017, 0.055 + len * 0.87],
        [0.081 + dx, 0.0012, 0.055 + len],
      ]);
      toes.push(digit);
      tube(body, digit, [0.0015, 0.0013, 0.00085, 0.0004], skin, true, false, {
        segments: 28,
        sides: 10,
        flat: 0.68,
      });
      tube(
        body,
        digit,
        [0.0006, 0.0005, 0.00032, 0.0001],
        materials.bone,
        false,
        true,
        { segments: 20, sides: 8, flat: 1 },
      );
    }
    for (let i = 0; i < 4; i++)
      mesh(body, webbing(toes[i], toes[i + 1]), skin, false);
  }
  // A few connective folds line the opened cavity, with no floating annotations.
  for (const side of [-1, 1])
    for (let i = 0; i < 9; i++) {
      const z = -0.028 + i * 0.0065,
        xr = 0.026 * Math.sqrt(Math.max(0.1, 1 - (z / 0.042) ** 2));
      tube(
        body,
        [
          [side * xr, 0.018, z],
          [side * (xr - 0.0025), 0.0167, z + 0.001],
          [side * (xr - 0.004), 0.0157, z + 0.003],
        ],
        0.00025,
        materials.rim,
        false,
        false,
        { segments: 12, sides: 6 },
      );
    }

  // Merge each material for rendering. Separate convex components preserve the
  // physical cavity, and anatomy-only details remain outside picking/colliders.
  body.collisionGeometries = [
    ...wallColliders,
    ...body.meshes
      .filter((m) => !m.userData.noCollision)
      .map((m) => m.geometry),
  ];
  const originals = [...body.meshes],
    internal = [...anatomyMeshes];
  skinSurfaces.length = 0;
  anatomyMeshes.length = 0;
  body.group.clear();
  body.meshes = [];
  for (const [items, isAnatomy] of [
    [originals, false],
    [internal, true],
  ]) {
    for (const material of new Set(items.map((m) => m.material))) {
      const geometry = mergeGeometries(
        items.filter((m) => m.material === material).map((m) => m.geometry),
      );
      mesh(body, geometry, material, true, isAnatomy);
    }
  }

  const abdomen = part(
    "abdomen",
    "Abdominal panel",
    [0, 0.038, 0.002],
    "#c4b99b",
  );
  mesh(abdomen, dome(), belly);
  // Shallow abdominal mottling comes from the 2K skin maps, not raised ornaments.
  const heart = part("heart", "Heart", [0, 0.031, -0.028], "#9c3942");
  organ(heart, [0, 0.027, -0.027], [0.006, 0.0043, 0.008], materials.heart, {
    taper: 0.45,
    bend: 0.1,
    detail: 0.045,
  });
  for (const side of [-1, 1])
    organ(
      heart,
      [side * 0.0033, 0.0273, -0.032],
      [0.0032, 0.0029, 0.0035],
      materials.heart,
      { detail: 0.07 },
    );
  tube(
    heart,
    [
      [0, 0.027, -0.032],
      [0.001, 0.028, -0.036],
      [0.004, 0.025, -0.038],
    ],
    [0.0015, 0.0012, 0.00085],
    materials.artery,
  );
  vessels(
    heart,
    [
      [-0.002, 0.03, -0.032],
      [-0.0015, 0.031, -0.029],
      [0, 0.0305, -0.025],
      [0.001, 0.029, -0.022],
    ],
    0.00012,
  );

  const liver = part(
    "liver",
    "Liver · three lobes",
    [-0.012, 0.031, -0.007],
    "#634139",
  );
  organ(
    liver,
    [-0.012, 0.026, -0.008],
    [0.0135, 0.0056, 0.0175],
    materials.liver,
    { rotate: -0.28, taper: 0.24, bend: 0.16, detail: 0.065 },
  );
  organ(liver, [0.01, 0.026, -0.008], [0.012, 0.0051, 0.014], materials.liver, {
    rotate: 0.3,
    taper: 0.2,
    bend: -0.13,
    detail: 0.05,
  });
  organ(liver, [0.006, 0.023, 0.009], [0.01, 0.0046, 0.0135], materials.liver, {
    rotate: -0.24,
    taper: 0.25,
    detail: 0.06,
  });
  // Thin surface vessels follow the lobes and travel with the detached organ.
  vessels(
    liver,
    [
      [-0.015, 0.03, -0.018],
      [-0.013, 0.0316, -0.01],
      [-0.01, 0.0308, -0.003],
      [-0.01, 0.029, 0.005],
    ],
    0.00012,
  );
  for (const [id, side, label] of [
    ["lung-left", 1, "Left lung"],
    ["lung-right", -1, "Right lung"],
  ]) {
    const lung = part(id, label, [side * 0.018, 0.027, -0.025], "#c5928b");
    organ(
      lung,
      [side * 0.018, 0.0215, -0.024],
      [0.0057, 0.0055, 0.012],
      materials.lung,
      { rotate: side * 0.18, taper: 0.22, detail: 0.075 },
    );
    tube(
      lung,
      [
        [side * 0.013, 0.023, -0.033],
        [side * 0.016, 0.026, -0.029],
        [side * 0.018, 0.027, -0.024],
        [side * 0.018, 0.0255, -0.017],
      ],
      [0.0008, 0.0006, 0.0004, 0.0002],
      materials.stomach,
      false,
    );
    vessels(
      lung,
      [
        [side * 0.018, 0.026, -0.03],
        [side * 0.019, 0.027, -0.025],
        [side * 0.02, 0.0255, -0.019],
      ],
      0.00013,
    );
  }
  const stomach = part("stomach", "Stomach", [0.017, 0.024, 0.008], "#ccab83");
  tube(
    stomach,
    [
      [0.013, 0.021, -0.017],
      [0.018, 0.021, -0.008],
      [0.019, 0.021, 0.004],
      [0.016, 0.021, 0.013],
      [0.011, 0.02, 0.018],
      [0.005, 0.02, 0.015],
    ],
    [0.002, 0.0044, 0.0053, 0.0046, 0.0027, 0.0016],
    materials.stomach,
    true,
    false,
    { segments: 84, sides: 28, flat: 0.82 },
  );
  const intestines = part(
    "intestines",
    "Intestines",
    [-0.014, 0.0222, 0.024],
    "#bf9275",
  );
  const coil = [
    [0.005, 0.02, 0.015],
    [0.008, 0.019, 0.021],
    [0.004, 0.019, 0.027],
    [-0.006, 0.02, 0.028],
    [-0.014, 0.02, 0.024],
    [-0.016, 0.02, 0.018],
    [-0.012, 0.019, 0.013],
    [-0.006, 0.019, 0.014],
    [-0.002, 0.02, 0.018],
    [-0.004, 0.021, 0.022],
    [-0.01, 0.021, 0.021],
    [-0.009, 0.02, 0.017],
    [-0.004, 0.018, 0.01],
    [0.006, 0.018, 0.01],
    [0.011, 0.018, 0.022],
    [0.005, 0.017, 0.031],
    [0, 0.017, 0.035],
  ];
  tube(
    intestines,
    coil,
    [0.002, 0.0024, 0.002, 0.0019, 0.0022, 0.002, 0.0028],
    materials.intestine,
    true,
    false,
    { segments: 180, sides: 16, flat: 0.88 },
  );
  // Subtle mesenteric strands belong to the intestinal part, so removal never
  // leaves disconnected decorative geometry floating in the abdomen.
  for (let i = 0; i < 5; i++)
    tube(
      intestines,
      [
        [-0.005, 0.017, 0.022],
        [-0.012 + i * 0.004, 0.017, 0.027],
        [-0.011 + i * 0.004, 0.018, 0.025],
      ],
      [0.00025, 0.00016, 0.00006],
      materials.rim,
      false,
      false,
      { segments: 14, sides: 6 },
    );

  // Vessel branches and lobes share a draw call per organ/material.
  // Separate lobe hulls also avoid a single thin, over-wide collision hull.
  liver.compoundCollider = true;
  liver.collisionGeometries = liver.meshes
    .filter((m) => m.material === materials.liver)
    .map((m) => m.geometry);
  for (const id of FROG_ORGANS) {
    const p = parts.get(id),
      originals = [...p.meshes];
    p.group.clear();
    p.meshes = [];
    for (const material of new Set(originals.map((m) => m.material)))
      mesh(
        p,
        mergeGeometries(
          originals
            .filter((m) => m.material === material)
            .map((m) => m.geometry),
        ),
        material,
      );
  }

  function setAnatomyView(enabled) {
    anatomyView = Boolean(enabled);
    for (const m of skinSurfaces) {
      m.userData.naturalMaterial ??= m.material;
      m.material = anatomyView
        ? materials.translucent
        : m.userData.naturalMaterial;
      m.renderOrder = anatomyView ? 4 : 0;
      m.castShadow = !anatomyView;
    }
    anatomyMeshes.forEach((m) => {
      m.visible = anatomyView;
    });
  }
  const roots = new THREE.Group(); // Optional decorative geometry for shadow capture.
  const guidePoints = Array.from({ length: 97 }, (_, i) => {
    const angle = (i / 96) * Math.PI * 2,
      radius = 0.94;
    return new THREE.Vector3(
      Math.cos(angle) * 0.029 * radius,
      0.023 + 0.015 * Math.sqrt(1 - radius * radius) + 0.00015,
      Math.sin(angle) * 0.042 * radius,
    ).add(FROG_ORIGIN);
  });
  const guide = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(guidePoints),
    new THREE.LineDashedMaterial({
      color: "#b7e9ff",
      dashSize: 0.002,
      gapSize: 0.0014,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    }),
  );
  guide.computeLineDistances();
  guide.visible = false;
  guide.renderOrder = 5;
  scene.add(guide);
  const lineArray = new Float32Array(96 * 6),
    cutGeometry = new THREE.BufferGeometry();
  cutGeometry.setAttribute("position", new THREE.BufferAttribute(lineArray, 3));
  cutGeometry.setDrawRange(0, 0);
  const cutLine = new THREE.LineSegments(
    cutGeometry,
    new THREE.LineBasicMaterial({ color: "#7d5949" }),
  );
  scene.add(cutLine);
  const graspMarker = new THREE.Mesh(
    new THREE.TorusGeometry(0.003, 0.00018, 6, 30),
    new THREE.MeshBasicMaterial({
      color: "#86d7ed",
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    }),
  );
  graspMarker.visible = false;
  graspMarker.renderOrder = 7;
  scene.add(graspMarker);

  const moved = (id, states) =>
    states[id].detached &&
    parts.get(id).group.position.distanceTo(FROG_ORIGIN) > 0.035;
  return {
    id: "frog",
    setAnatomyView,
    get anatomyView() {
      return anatomyView;
    },
    label: "Frog",
    openingPartId: "abdomen",
    origin: FROG_ORIGIN,
    parts,
    roots,
    guide,
    guidePoints,
    cutLine,
    graspMarker,
    isOpen: (states) => moved("abdomen", states),
    available(states) {
      const ids = ["abdomen"];
      if (moved("abdomen", states)) {
        ids.push("heart", "liver", "lung-left", "lung-right");
        if (moved("liver", states)) ids.push("stomach", "intestines");
      }
      // Removed parts remain selectable even if the cover is placed back.
      for (const id of FROG_ORGANS)
        if (states[id].detached && !ids.includes(id)) ids.push(id);
      return ids.map((id) => parts.get(id));
    },
    colliderParts: (states) =>
      [...parts.values()].filter((p) => !states[p.id].detached),
    graspPoint: (p) => p.grasp.clone().applyMatrix4(p.group.matrixWorld),
    deform() {}, // This first frog uses pre-separated rigid organs, not soft tissue tearing.
    updateCut(bins) {
      let count = 0;
      bins.forEach((v, i) => {
        if (v) {
          lineArray.set(guidePoints[i].toArray(), count * 3);
          lineArray.set(guidePoints[i + 1].toArray(), (count + 1) * 3);
          count += 2;
        }
      });
      cutGeometry.attributes.position.needsUpdate = true;
      cutGeometry.setDrawRange(0, count);
      cutGeometry.computeBoundingSphere();
    },
  };
}
