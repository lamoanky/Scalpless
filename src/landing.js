import "./landing.css";
import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { createOnion } from "./specimens/onion.js";
import { landingFrame } from "./landing-motion.js";

const story = document.querySelector(".scroll-story");
const stage = document.querySelector(".story-stage");
const host = document.querySelector("#landing-scene");
const panels = [...document.querySelectorAll("[data-panel]")];
const gallery = document.querySelector(".specimen-gallery");
const motionButton = document.querySelector(".motion-toggle");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let userMotionPreference = null;
let target = 0,
  progress = 0,
  width = 1,
  height = 1,
  model = null,
  renderer = null;
let raf = 0,
  lastTime = 0,
  modelHeight = 0.13,
  scene,
  camera,
  currentFrame;
const still = () => userMotionPreference ?? reducedMotion.matches;

function readScroll() {
  const start = story.offsetTop,
    length = Math.max(1, story.offsetHeight - stage.clientHeight);
  target = THREE.MathUtils.clamp((scrollY - start) / length, 0, 1);
  document
    .querySelector(".site-header")
    .classList.toggle("past-story", scrollY > start + story.offsetHeight - 90);
  requestFrame();
}
function renderFrame(now) {
  raf = 0;
  const dt = Math.min((now - lastTime) / 1000 || 0.016, 0.05);
  lastTime = now;
  progress = still() ? target : THREE.MathUtils.damp(progress, target, 14, dt);
  if (Math.abs(progress - target) < 0.00015) progress = target;
  const frame = landingFrame(progress, {
    mobile: width <= 700,
    aspect: width / height,
    still: still(),
  });
  currentFrame = frame;
  document.documentElement.style.setProperty("--progress", frame.progress);
  stage.style.setProperty("--gallery", frame.gallery);
  stage.style.setProperty("--orbit", frame.orbit);
  stage.classList.toggle("at-collection", frame.active === 2);
  panels.forEach((panel, i) => {
    panel.style.opacity = frame.panels[i];
    panel.style.visibility = frame.panels[i] < 0.001 ? "hidden" : "visible";
    panel.style.pointerEvents = i === frame.active ? "auto" : "none";
    panel.inert = i !== frame.active;
    panel.setAttribute("aria-hidden", String(i !== frame.active));
  });
  gallery.inert = frame.active !== 2;
  gallery.setAttribute("aria-hidden", String(frame.active !== 2));
  const cue = document.querySelector(".scroll-cue");
  cue.inert = frame.active === 2;
  cue.setAttribute("aria-hidden", String(frame.active === 2));
  cue.href = frame.active === 0 ? "#explore" : "#features";
  if (model) {
    model.scale.setScalar((frame.height * 2) / modelHeight);
    model.position.set(
      ((frame.x - 0.5) * 2 * width) / height,
      (0.5 - frame.y) * 2,
      0,
    );
    model.rotation.set(0.08, frame.rotation, -0.025);
    renderer.render(scene, camera);
  }
  if (progress !== target) requestFrame();
}
function requestFrame() {
  if (!raf && !document.hidden) raf = requestAnimationFrame(renderFrame);
}
function updateMotionButton() {
  const paused = still();
  motionButton.setAttribute("aria-pressed", String(paused));
  motionButton.setAttribute(
    "aria-label",
    paused ? "Enable scroll animation" : "Pause scroll animation",
  );
  motionButton.querySelector("span").textContent = paused
    ? "Motion off"
    : "Motion on";
  motionButton
    .querySelector("path")
    .setAttribute("d", paused ? "m7 4 9 6-9 6V4Z" : "M7 5v10M13 5v10");
  document.documentElement.classList.toggle("motion-paused", paused);
  requestFrame();
}
motionButton.addEventListener("click", () => {
  userMotionPreference = !still();
  updateMotionButton();
});
reducedMotion.addEventListener("change", updateMotionButton);
addEventListener("scroll", readScroll, { passive: true });
addEventListener("pageshow", readScroll);
addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    lastTime = performance.now();
    readScroll();
  }
});

function resize() {
  width = stage.clientWidth;
  height = stage.clientHeight;
  if (renderer) {
    renderer.setSize(width, height);
    camera.left = -width / height;
    camera.right = width / height;
    camera.updateProjectionMatrix();
  }
  readScroll();
}
new ResizeObserver(resize).observe(stage);
resize();
updateMotionButton();
readScroll();

try {
  renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(
    -width / height,
    width / height,
    1,
    -1,
    0.01,
    30,
  );
  camera.position.set(0, 0, 10);
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const [onion, hdri] = await Promise.all([
    createOnion(scene),
    new HDRLoader().loadAsync(
      `${import.meta.env.BASE_URL}environments/studio_small_09_2k.hdr`,
    ),
  ]);
  scene.environment = pmrem.fromEquirectangular(hdri).texture;
  scene.environmentIntensity = 0.7;
  scene.environmentRotation.y = -0.5;
  hdri.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight("#f5f7ff", "#7395c8", 0.5));
  const key = new THREE.DirectionalLight("#fff2fa", 3.4);
  key.position.set(-3, 5, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#b7e5ff", 2);
  rim.position.set(4, 3, -3);
  scene.add(rim);
  const fill = new THREE.DirectionalLight("#f2e6ff", 0.7);
  fill.position.set(2, -1, 4);
  scene.add(fill);
  model = new THREE.Group();
  model.name = "scroll-onion";
  const specimen = new THREE.Group();
  for (const [id, part] of onion.parts) {
    scene.remove(part.group);
    if (id === "section" || id === "epidermis") continue;
    part.group.position.set(0, 0, 0);
    specimen.add(part.group);
  }
  onion.roots.position.set(0, 0, 0);
  specimen.add(onion.roots);
  scene.remove(onion.guide, onion.cutLine, onion.graspMarker);
  specimen.scale.set(1.1, 1, 1.1);
  const bounds = new THREE.Box3().setFromObject(specimen);
  modelHeight = bounds.max.y - bounds.min.y;
  bounds.getCenter(specimen.position).negate();
  const materials = new Set();
  specimen.traverse((o) => {
    if (o.isMesh)
      for (const material of Array.isArray(o.material)
        ? o.material
        : [o.material])
        materials.add(material);
  });
  for (const material of materials) {
    if (material.map?.image?.src?.includes("onion-skin")) {
      material.color.set("#ffe7f6").multiplyScalar(1.12);
      material.clearcoat = 0.4;
      material.clearcoatRoughness = 0.24;
    }
  }
  model.add(specimen);
  scene.add(model);
  resize();
  // Compile before revealing the scene, avoiding a visible shader warm-up hitch.
  await renderer.compileAsync(scene, camera);
  document.documentElement.classList.add("model-ready");
  document.documentElement.dataset.ready = "true";
  window.__scalplessLanding = {
    getDebug: () => ({
      ...currentFrame,
      scale: model.scale.x,
      modelRotation: model.rotation.y,
      viewport: [width, height],
      reducedMotion: still(),
      drawCalls: renderer.info.render.calls,
    }),
  };
  requestFrame();
} catch (error) {
  console.error(error);
  document.documentElement.classList.add("model-error");
  document.querySelector(".model-loading").innerHTML =
    '<span class="sr-only">The 3D preview could not load. You can still open the dissection lab using Start Dissection.</span>';
}
