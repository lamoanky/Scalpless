import * as THREE from "three";
import { createSeamGlow } from "../seam-glow.js";
import { prepareFrogPose, applyFrogPose } from "./frog-pose.js";
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

import {
  abdomenGeometry, abdomenColliderGeometries, abdomenPoint, cavityOutline, rimHeight, torsoSurface,
  liverGeometries, lungGeometry, STOMACH_PATH, INTESTINE_PATH,
} from "./frog-anatomy.js";

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

export async function createFrog(scene, { appearance = "natural" } = {}) {
  const materials = await frogMaterials({ appearance });
  const blue = appearance === "blue";
  const { skin, belly } = materials;
  const parts = new Map(),
    skinSurfaces = [],
    anatomyMeshes = [];
  let anatomyView = false;
  let limbPose = null;
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
      // Organs stay on the bench where they are dropped.
      collectOnRelease: false,
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
    prepareFrogPose(geometry, limbPose);
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
    const probes = anatomyOnly ? [] : part.meshes
      .filter(m => m.material !== materials.artery && m.material !== materials.vein)
      .map(m => new THREE.Mesh(m.geometry, m.material));
    const ray = new THREE.Raycaster();
    function followSurface(controls) {
      if (anatomyOnly) return controls;
      const curve = new THREE.CatmullRomCurve3(controls.map(p => new THREE.Vector3(...p)));
      const result = [];
      for (let i = 0; i <= 28; i++) {
        const p = curve.getPoint(i / 28);
        ray.set(new THREE.Vector3(p.x, .1, p.z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObjects(probes, false)[0];
        if (hit) result.push([p.x, hit.point.y + radius * .2, p.z]);
      }
      return result;
    }
    const main = followSurface(points);
    if (main.length < 2) return;
    tube(part, main, radius, materials.artery, false, anatomyOnly, {
      segments: 24,
      sides: 8,
      flat: 1,
    });
    const alternate = points.map(([x, y, z]) => [
      x + 0.0008,
      y - 0.00012,
      z + 0.0002,
    ]);
    const venous = followSurface(alternate);
    if (venous.length > 1) tube(part, venous, radius * 0.82, materials.vein, false, anatomyOnly, {
      segments: 24,
      sides: 8,
      flat: 1,
    });
    for (let i = 1; i < points.length - 1; i++) {
      const [x, y, z] = points[i],
        side = i % 2 ? 1 : -1;
      const branch = followSurface([
          [x, y, z],
          [x + side * 0.001, y - 0.0004, z + 0.001],
          [x + side * 0.0025, y - 0.001, z + 0.003],
        ]);
      if (branch.length < 2) continue;
      tube(
        part, branch,
        [radius * 0.6, radius * 0.3, 0.00004],
        materials.artery,
        false,
        anatomyOnly,
        { segments: 12, sides: 6, flat: 1 },
      );
    }
  }

  const body = part("body", "Frog body", [0, 0.02, 0], "#b95b28", true);
  body.compoundCollider = true;
  mesh(body, bodyWall(), skin, false);
  const wallColliders = [lobe([0, 0.004, 0], [0.034, 0.0035, 0.044])];
  mesh(body, torsoSurface(true), materials.cavity, false);
  // One continuous skin surface, with separate invisible collider arcs.
  for (let i = 0; i < 24; i++) {
    const wall = Array.from({ length: 6 }, (_, j) => {
      const a = ((i + j / 5) / 24) * Math.PI * 2;
      const [x, z] = cavityOutline(a, 1.12);
      return [x, rimHeight(a) * .73, z];
    });
    wallColliders.push(
      organicTube(wall, [0.0035, 0.0035], { segments: 10, sides: 10, flat: 1.6 }),
    );
  }
  // The cover and torso already share a closed rim. An extra ring made the
  // intact abdomen look like a removable lid even before the incision.
  const head = mesh(body, headGeometry(), skin);
  // Mouth line follows the broad jaw, with a narrow upper lip and shallow throat folds.
  const headProbe = new THREE.Mesh(head.geometry, skin);
  const jawRay = new THREE.Raycaster();
  const jaw = Array.from({ length: 33 }, (_, i) => {
    const a = -Math.PI * .53 + (i / 32) * Math.PI * 1.06;
    const x = Math.sin(a) * .025, z = -.058 - Math.cos(a) * .022;
    jawRay.set(new THREE.Vector3(x, .1, z), new THREE.Vector3(0, -1, 0));
    const hit = jawRay.intersectObject(headProbe)[0];
    return hit ? hit.point.addScaledVector(hit.face.normal, .000025).toArray() : null;
  }).filter(Boolean);
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
    tube(body, fold, 0.00016, skin, false, false, {
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
    limbPose = null;
    const mirror = (points) => points.map(([x, y, z]) => [x * side, y, z]);
    organ(body, [side * 0.024, 0.009, -0.063], [0.0076, 0.0066, 0.0082], skin, {
      detail: 0.015,
    });
    mesh(
      body,
      irisGeometry([side * 0.029, 0.007, -0.066], [side * 0.9, -0.35, -0.28]),
      materials.iris,
      false,
    );
    // Upper arm, elbow and forearm are one continuous tapered surface.
    limbPose = {kind:"fore", side};
    const arm = mirror([
      [0.019, 0.012, -0.031],
      [0.034, 0.011, -0.027],
      [0.046, 0.007, -0.021],
      [0.052, 0.005, -0.031],
      [0.058, 0.0037, -0.044],
      [0.06, 0.0032, -0.049],
    ]);
    const armR = [0.007, 0.0065, 0.0055, 0.0045, 0.0032, 0.0039];
    tube(body, arm, armR, skin, true, false, {
      segments: 64,
      sides: 24,
      flat: 0.72,
      muscleRidge: .08,
      wrinkle: .025,
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
    limbPose = {kind:"hind", side};
    const leg = mirror([
      [0.02, 0.012, 0.029],
      [0.037, 0.013, 0.044],
      [0.052, 0.009, 0.055],
      [0.064, 0.0065, 0.043],
      [0.073, 0.0044, 0.025],
      [0.078, 0.003, 0.039],
      [0.081, 0.0026, 0.053],
    ]);
    const legR = [0.0085, 0.012, 0.0072, 0.006, 0.0037, 0.0034, 0.0047];
    tube(body, leg, legR, skin, true, false, {
      segments: 90,
      sides: 28,
      flat: 0.78,
      muscleRidge: .1,
      wrinkle: .025,
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
  limbPose = null;
  // A few connective folds line the opened cavity, with no floating annotations.
  for (const side of [-1, 1])
    for (let i = 0; i < 9; i++) {
      const z = -0.028 + i * 0.0065,
        xr = 0.026 * Math.sqrt(Math.max(0.1, 1 - (z / 0.042) ** 2));
      tube(
        body,
        [
          [side * xr, 0.013, z],
          [side * (xr - 0.0025), 0.010, z + 0.001],
          [side * (xr - 0.004), 0.009, z + 0.003],
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

  const posedMeshes=[...body.meshes,...anatomyMeshes];
  let presentationPose=-1;
  function setPresentationPose(t) {
    if(t===presentationPose)return;
    presentationPose=t;
    for(const m of posedMeshes)applyFrogPose(m.geometry,t);
  }
  setPresentationPose(1);
  for(const m of posedMeshes)m.geometry.userData.rest=m.geometry.attributes.position.array.slice();

  const abdomen = part(
    "abdomen",
    "Abdominal panel",
    [0, 0.033, 0.002],
    "#b95b28",
  );
  const coverGeometry = abdomenGeometry();
  mesh(abdomen, coverGeometry, belly);
  abdomen.compoundCollider = true;
  abdomen.collisionGeometries = abdomenColliderGeometries();
  // Shallow abdominal mottling comes from the 2K skin maps, not raised ornaments.
  const heart = part("heart", "Heart", [0, 0.028, -0.028], "#ac5960");
  organ(heart, [0, 0.023, -0.027], [0.0058, 0.0048, 0.0085], materials.heart, {
    taper: 0.6,
    bend: 0.04,
    detail: 0.025,
  });
  for (const side of [-1, 1])
    organ(
      heart,
      [side * 0.0031, 0.0233, -0.033],
      [0.003, 0.0025, side > 0 ? 0.0035 : 0.0029],
      materials.heart,
      { detail: 0.07 },
    );
  tube(
    heart,
    [
      [0, 0.023, -0.032],
      [0.001, 0.024, -0.036],
      [0.004, 0.022, -0.038],
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
    [-0.012, 0.027, -0.007],
    "#4b2522",
  );
  for (const geometry of liverGeometries()) mesh(liver, geometry, materials.liver);
  tube(liver, [[-.009,.023,-.020],[0,.023,-.021],[.010,.023,-.019]],
    [.002,.0024,.0018], materials.liver, false, false, { flat: .55 });
  tube(liver, [[.006,.023,-.007],[.010,.022,-.001],[.010,.021,.006]],
    [.0016,.0021,.0025], materials.liver, false, false, { flat: .55 });
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
    const lung = part(id, label, [side * 0.018, 0.023, -0.027], "#9e5c6e");
    mesh(lung, lungGeometry(side), materials.lung);
    tube(
      lung,
      [
        [side * 0.010, 0.021, -0.035],
        [side * 0.014, 0.0215, -0.032],
        [side * 0.018, 0.022, -0.028],
      ],
      [0.001, 0.00075, 0.00035],
      materials.stomach,
      false,
    );
    vessels(
      lung,
      [
        [side * 0.017, 0.023, -0.030],
        [side * 0.018, 0.023, -0.025],
        [side * 0.0185, 0.022, -0.019],
      ],
      0.00013,
    );
  }
  const stomach = part("stomach", "Stomach", [0.021, 0.020, 0.002], "#d6c5cf");
  tube(
    stomach,
    STOMACH_PATH,
    [0.0018, 0.0048, 0.0068, 0.0061, 0.0033, 0.0017],
    materials.stomach,
    true,
    false,
    { segments: 96, sides: 32, flat: 0.74, wrinkle: .022 },
  );
  const intestines = part(
    "intestines",
    "Intestines",
    [-0.017, 0.0155, 0.025],
    "#454a2d",
  );
  const coil = INTESTINE_PATH;
  tube(
    intestines,
    coil,
    [0.0017, 0.0019, 0.0017, 0.0018, 0.0016, 0.0017, 0.0025],
    materials.intestine,
    true,
    false,
    { segments: 220, sides: 18, flat: 0.88, wrinkle: .025 },
  );
  // Subtle mesenteric strands belong to the intestinal part, so removal never
  // leaves disconnected decorative geometry floating in the abdomen.
  for (let i = 0; i < 5; i++)
    tube(
      intestines,
      [
        [-0.005, 0.011, 0.022],
        [-0.012 + i * 0.004, 0.012, 0.027],
        [-0.011 + i * 0.004, 0.013, 0.025],
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
    .filter((m) => m.material === materials.liver && !m.userData.noCollision)
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

  if (blue) body.color = abdomen.color = "#159ee0";

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
    const p = abdomenPoint(angle, radius);
    return p.add(new THREE.Vector3(0, .00015, 0)).add(FROG_ORIGIN);
  });
  const seamGlow = createSeamGlow(scene, guidePoints);
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

  const moved = (id, states) => {
    if (!states[id].detached) return false;
    if (states[id].collected) return true;
    const p = parts.get(id);
    return p.group.position.distanceTo(FROG_ORIGIN) > .035;
  };
  return {
    id: "frog",
    appearance,
    getBounds: () => Object.fromEntries([...parts].map(([id,p]) => {
      const box = new THREE.Box3().setFromObject(p.group);
      return [id,{min:box.min.toArray(),max:box.max.toArray()}];
    })),
    setPresentationPose,
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
      // Held parts remain selectable even if the cover is placed back.
      // The controller excludes collected organs after release.
      for (const id of FROG_ORGANS)
        if (states[id].detached && !ids.includes(id)) ids.push(id);
      return ids.map((id) => parts.get(id));
    },
    colliderParts: (states) =>
      [...parts.values()].filter((p) => !states[p.id].detached),
    graspPoint: (p) => p.grasp.clone().applyMatrix4(p.group.matrixWorld),
    deform() {}, // This first frog uses pre-separated rigid organs, not soft tissue tearing.
    seamGlow: seamGlow.mesh,
    updateSeam: seamGlow.update,
    updateCut(bins, options) {
      seamGlow.setCut(bins, options);
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
