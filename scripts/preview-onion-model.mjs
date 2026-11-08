import { chromium } from "playwright";
import { existsSync } from "node:fs";
const chrome =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(chrome) ? { executablePath: chrome } : {}),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
  });
  const origin = process.env.PREVIEW_URL || "http://127.0.0.1:5173";
  await page.route("**/__onion-model-preview", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta charset="UTF-8"><style>body{margin:0;background:#e4edf2;font:14px Arial;color:#35556d}canvas{display:block}header{position:absolute;top:48px;left:60px}h1{font-size:28px;font-weight:500;letter-spacing:-1px;margin:0 0 12px}p{font-size:12px;letter-spacing:2px;color:#678497}.labels{position:absolute;bottom:86px;left:18%;right:18%;display:flex;justify-content:space-between;font-size:13px;letter-spacing:2px}.note{position:absolute;bottom:35px;left:60px;font-size:11px;color:#728d9e}</style></head><body><header><h1>Scalpless / reference onion</h1><p>SEPARATE MESHES · AUTHORED 4K SKIN · PBR MATERIALS</p></header><div class="labels"><span>01 / INTACT</span><span>02 / CUTAWAY</span></div><div class="note">Modeled from the supplied image. Hidden surfaces are inferred.</div></body></html>`,
    }),
  );
  await page.goto(`${origin}/__onion-model-preview`);
  await page.evaluate(async () => {
    const THREE = await import("/node_modules/three/build/three.module.js");
    const { GLTFLoader } =
      await import("/node_modules/three/examples/jsm/loaders/GLTFLoader.js");
    const { HDRLoader } =
      await import("/node_modules/three/examples/jsm/loaders/HDRLoader.js");
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(1600, 1000);
    renderer.setPixelRatio(2);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    document.body.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e4edf2");
    const camera = new THREE.PerspectiveCamera(31, 1.6, 0.005, 3);
    camera.position.set(0.025, 0.205, 0.48);
    camera.lookAt(0, 0.055, 0);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const hdri = await new HDRLoader().loadAsync(
      "/environments/studio_small_09_2k.hdr",
    );
    scene.environment = pmrem.fromEquirectangular(hdri).texture;
    scene.environmentIntensity = 0.5;
    scene.environmentRotation.y = -0.5;
    hdri.dispose();
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight("#ecf6ff", "#9cacc0", 0.7));
    const key = new THREE.DirectionalLight("#fff9f3", 2.8);
    key.position.set(-0.22, 0.45, 0.25);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, {
      left: -0.3,
      right: 0.3,
      top: 0.25,
      bottom: -0.25,
      near: 0.005,
      far: 1,
    });
    key.shadow.normalBias = 0.00012;
    scene.add(key);
    const rim = new THREE.DirectionalLight("#a4d7ff", 1.5);
    rim.position.set(0.3, 0.2, -0.2);
    scene.add(rim);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshStandardMaterial({ color: "#dce9f2", roughness: 0.55 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.0005;
    floor.receiveShadow = true;
    scene.add(floor);
    for (const [variant, x] of [
      ["intact", -0.092],
      ["cutaway", 0.092],
    ]) {
      const model = (
        await new GLTFLoader().loadAsync(
          `/models/onion/onion-reference-${variant}.glb`,
        )
      ).scene;
      model.position.x = x;
      model.rotation.y = -0.4;
      model.traverse((o) => {
        if (o.isMesh) o.castShadow = o.receiveShadow = true;
      });
      scene.add(model);
    }
    renderer.render(scene, camera);
  });
  await page.screenshot({ path: "output/onion-reference-models.png" });
} finally {
  await browser.close();
}
