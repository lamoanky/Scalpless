import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { createRenderPipeline } from "./render-pipeline.js";
import { createContactShadows } from "./contact-shadows.js";
import { createLabEnvironment } from "./lab-environment.js";

export async function createBench(host) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  renderer.setClearColor(0x000000, 0);
  // The original-image backdrop is composited behind the transparent 3D scene.
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(35, 1, 0.005, 8);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0.012, 0.035, 0);
  controls.enableDamping = !matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  controls.dampingFactor = 0.095;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = 0.16;
  controls.maxPolarAngle = Math.PI * 0.475;
  controls.rotateSpeed = 0.62;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  const homePosition = new THREE.Vector3(0.18, 0.22, 0.35),
    homeTarget = new THREE.Vector3(-0.078, 0.057, -0.012);
  function home() {
    const mobile = host.clientWidth < 650;
    controls.target.copy(homeTarget);
    camera.position.copy(homePosition);
    if (mobile)
      camera.position.sub(homeTarget).multiplyScalar(1.7).add(homeTarget);
    controls.update();
    camera.updateMatrixWorld(true);
  }
  home();
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const hdri = await new HDRLoader().loadAsync(
    `${import.meta.env.BASE_URL}environments/studio_small_09_2k.hdr`,
  );
  scene.environment = pmrem.fromEquirectangular(hdri).texture;
  scene.environmentIntensity = 0.5;
  scene.environmentRotation.y = -0.5;
  hdri.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight("#f2f8ff", "#80b2e8", 0.18));
  const key = new THREE.DirectionalLight("#f7faff", 3.0);
  key.position.set(-0.3, 0.7, 0.3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, {
    left: -0.36,
    right: 0.36,
    top: 0.36,
    bottom: -0.36,
    near: 0.01,
    far: 2,
  });
  key.shadow.bias = -0.00012;
  key.shadow.normalBias = 0.00025;
  key.shadow.radius = 6;
  key.shadow.intensity = 0.6;
  scene.add(key);
  const rim = new THREE.DirectionalLight("#7acaff", 1.4);
  rim.position.set(0.35, 0.4, -0.35);
  scene.add(rim);
  const fill = new THREE.DirectionalLight("#eef9ff", 0.15);
  fill.position.set(0.5, 0.3, 0.7);
  scene.add(fill);
  const m = {
    ceramic: new THREE.MeshPhysicalMaterial({
      color: "#f0f5f7",
      roughness: 0.29,
      metalness: 0.07,
      clearcoat: 0.5,
      clearcoatRoughness: 0.25,
    }),
    rim: new THREE.MeshPhysicalMaterial({
      color: "#c1d7e1",
      roughness: 0.28,
      metalness: 0.65,
      clearcoat: 0.4,
    }),
    insert: new THREE.MeshStandardMaterial({
      color: "#d6e3e9",
      roughness: 0.62,
      metalness: 0.08,
    }),
    steel: new THREE.MeshPhysicalMaterial({
      color: "#dae1e8",
      roughness: 0.24,
      metalness: 0.9,
      clearcoat: 0.4,
    }),
    handle: new THREE.MeshPhysicalMaterial({
      color: "#648bc4",
      roughness: 0.38,
      metalness: 0.7,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: "#7299a9",
      roughness: 0.55,
      metalness: 0.25,
    }),
  };
  function box(parent, size, position, material, r = 0.002) {
    const o = new THREE.Mesh(new RoundedBoxGeometry(...size, 4, r), material);
    o.position.set(...position);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  createLabEnvironment(scene);

  function scalpel() {
    const g = new THREE.Group();
    g.name = "scalpel";
    box(g, [0.006, 0.078, 0.003], [0, 0.081, 0], m.handle, 0.0014);
    box(g, [0.004, 0.016, 0.002], [0, 0.035, 0], m.steel, 0.0007);
    for (let i = 0; i < 13; i++)
      box(
        g,
        [0.0062, 0.00065, 0.0031],
        [0, 0.05 + i * 0.0029, 0],
        m.steel,
        0.0002,
      );
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(-0.009, 0.009, -0.009, 0.022, -0.005, 0.032);
    shape.lineTo(0.002, 0.032);
    shape.lineTo(0, 0);
    const blade = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, {
        depth: 0.00065,
        bevelEnabled: true,
        bevelSize: 0.00012,
        bevelThickness: 0.00012,
        bevelSegments: 2,
        steps: 1,
      }),
      m.steel,
    );
    blade.castShadow = true;
    g.add(blade);
    return g;
  }
  function forceps() {
    const g = new THREE.Group(),
      jaws = [];
    g.name = "hand";
    for (const s of [-1, 1]) {
      const jaw = new THREE.Group();
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * 0.001, 0, 0),
        new THREE.Vector3(s * 0.004, 0.035, 0),
        new THREE.Vector3(s * 0.003, 0.085, 0),
        new THREE.Vector3(0, 0.121, 0),
      ]);
      const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 44, 0.00105, 6, false),
        m.steel,
      );
      mesh.castShadow = true;
      jaw.add(mesh);
      g.add(jaw);
      jaws.push({ jaw, s });
      for (let i = 0; i < 12; i++)
        box(
          jaw,
          [0.0024, 0.0006, 0.0023],
          [s * 0.0038, 0.037 + i * 0.003, 0],
          m.handle,
          0.0002,
        );
    }
    g.userData.jaws = jaws;
    return g;
  }
  const tools = { scalpel: scalpel(), hand: forceps() },
    rests = {};
  tools.scalpel.position.set(0.08, 0.0017, 0.045);
  tools.hand.position.set(0.075, 0.0015, 0.025);
  for (const [id, tool] of Object.entries(tools)) {
    tool.rotation.set(-Math.PI / 2, 0, id === "hand" ? -0.4 : -0.35);
    tool.traverse((o) => {
      if (o.isMesh) o.userData.instrument = id;
    });
    scene.add(tool);
    rests[id] = {
      position: tool.position.clone(),
      quaternion: tool.quaternion.clone(),
    };
  }
  function restTools() {
    for (const [id, tool] of Object.entries(tools)) {
      tool.position.copy(rests[id].position);
      tool.quaternion.copy(rests[id].quaternion);
      closeJaws(false);
    }
  }
  function closeJaws(closed) {
    for (const { jaw, s } of tools.hand.userData.jaws)
      jaw.position.x = closed ? -s * 0.00075 : 0;
  }
  function toolAt(id, point, normal, closed = false) {
    const tool = tools[id];
    if (!tool) return;
    const direction = normal
      .clone()
      .multiplyScalar(0.8)
      .add(new THREE.Vector3(0.5, 0.22, -0.42))
      .normalize();
    tool.position.copy(point).addScaledVector(normal, 0.0004);
    tool.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    closeJaws(closed);
  }
  const pipeline = await createRenderPipeline(renderer, scene, camera);
  const contactShadows = createContactShadows(renderer, scene);
  renderer.info.autoReset = false;
  function render(dt) {
    renderer.info.reset();
    contactShadows.update();
    pipeline.render(dt);
  }
  function resize() {
    const w = host.clientWidth,
      h = host.clientHeight;
    renderer.setSize(w, h);
    pipeline.resize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();
  function orbit(dx, dy) {
    const s = new THREE.Spherical().setFromVector3(
      camera.position.clone().sub(controls.target),
    );
    s.theta += dx;
    s.phi = THREE.MathUtils.clamp(s.phi + dy, 0.16, Math.PI * 0.475);
    camera.position
      .copy(controls.target)
      .add(new THREE.Vector3().setFromSpherical(s));
    controls.update();
    camera.updateMatrixWorld(true);
  }
  function zoom(delta) {
    const offset = camera.position.clone().sub(controls.target);
    offset.multiplyScalar(Math.exp(-delta * 0.1));
    offset.setLength(THREE.MathUtils.clamp(offset.length(), 0.18, 1.35));
    camera.position.copy(controls.target).add(offset);
    controls.update();
    camera.updateMatrixWorld(true);
  }
  function setTool(mode) {
    controls.mouseButtons.LEFT =
      mode === "inspect" ? THREE.MOUSE.ROTATE : undefined;
    host.dataset.tool = mode;
    restTools();
  }
  return {
    scene,
    render,
    setSpecimen: contactShadows.setSpecimen,
    camera,
    renderer,
    controls,
    tools,
    toolAt,
    restTools,
    closeJaws,
    home,
    orbit,
    zoom,
    setTool,
    host,
  };
}
