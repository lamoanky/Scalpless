import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ORGAN_GUIDE, heldOrgan } from "./organ-guide.js";
import "./lab-panels.css";

const closeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';

// A second view, not a second specimen: clones share the existing geometries
// and materials. They never enter the lab scene, input adapter or physics world.
// The existing renderer draws this small scissored view after its main pipeline.
export function installOrganSlide(lab, bench) {
  const panel = document.createElement("section");
  panel.id = "organ-slide"; panel.className = "organ-slide"; panel.hidden = true;
  panel.setAttribute("aria-labelledby", "organ-name");
  panel.innerHTML = `
    <header class="slide-heading"><div><span class="panel-eyebrow">SPECIMEN STUDY <span id="organ-number"></span></span><h2 id="organ-name"></h2></div>
      <button type="button" class="icon-button" aria-label="Minimize organ study">${closeIcon}</button></header>
    <div class="slide-preview" tabindex="0" role="img" aria-label="Organ study. Drag or use arrow keys to rotate this study view."><span class="slide-etch" aria-hidden="true"></span></div>
    <div class="slide-copy"><p id="organ-system" class="slide-system"></p><p id="organ-description"></p><p id="organ-observe" class="slide-observe"></p><span class="slide-note">3D study · tissue stays in your forceps</span></div>`;
  const restore = document.createElement("button");
  restore.type = "button"; restore.className = "icon-button study-launch"; restore.hidden = true;
  restore.setAttribute("aria-label", "Open held organ study"); restore.setAttribute("aria-controls", panel.id);
  restore.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v10H3zM7 7v10M10 11h7m-7 3h4"/></svg>';
  document.getElementById("bench").append(panel, restore);
  const view = panel.querySelector(".slide-preview");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#dfedfa");
  scene.environment = bench.scene.environment;
  scene.environmentIntensity = .75;
  scene.add(new THREE.HemisphereLight("#ffffff", "#8ea8c6", 1));
  const key = new THREE.DirectionalLight("#fff5ed", 2.4); key.position.set(-3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight("#b4e9ff", 1.1); rim.position.set(3, 1, -2); scene.add(rim);
  const camera = new THREE.PerspectiveCamera(35, 1, .05, 20);
  camera.position.set(0, 2.8, 3.8); camera.lookAt(0, -.2, 0); camera.zoom=1.25;
  const glass = new THREE.Mesh(new RoundedBoxGeometry(2.9, .075, 1.65, 3, .04),
    new THREE.MeshPhysicalMaterial({color: "#a7d8ef", transparent: true, opacity: .55, roughness: .2, metalness: .12, clearcoat: 1}));
  glass.position.y = -.57; scene.add(glass);
  const edge=new THREE.LineSegments(new THREE.EdgesGeometry(glass.geometry,30),new THREE.LineBasicMaterial({color:"#ffffff",transparent:true,opacity:.8}));
  edge.position.copy(glass.position);scene.add(edge);
  const contact=document.createElement("canvas");contact.width=contact.height=64;
  const ctx=contact.getContext("2d"),gradient=ctx.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,"#24395065");gradient.addColorStop(1,"#24395000");ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1.8,1.2),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(contact),transparent:true,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=-.527;scene.add(shadow);
  const orientation = new THREE.Group(); scene.add(orientation);
  let id = null, source = null, clone = null, minimized = false, suspended = false;
  let yaw = 0, pitch = 0, drag = null;
  const viewport = new THREE.Vector4(), scissor = new THREE.Vector4();
  const delta = new THREE.Quaternion(), euler = new THREE.Euler();
  function visibility() {
    const show = Boolean(id) && !minimized && !suspended;
    if (!show && panel.contains(document.activeElement)) bench.host.focus({preventScroll:true});
    panel.hidden = !show;
    restore.hidden = !id || !minimized || suspended;
    restore.setAttribute("aria-expanded", String(show));
    document.getElementById("bench").classList.toggle("has-organ-study", show);
  }
  function update(state) {
    const next = heldOrgan(state);
    if (next !== id) {
      if (clone) orientation.remove(clone);
      clone = null; source = null; id = next; minimized = false; yaw = pitch = 0;
      panel.dataset.organ = id ?? "";
      if (id) {
        const info = ORGAN_GUIDE[id];
        for (const [key, value] of Object.entries({name: info.name, number: info.number,
          system: info.system, description: info.description, observe: info.observe}))
          panel.querySelector(`#organ-${key}`).textContent = value;
        source = lab.specimen.parts.get(id).group;
        const part = source.clone(true);
        part.position.set(0,0,0); part.quaternion.identity(); part.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(part), size = bounds.getSize(new THREE.Vector3());
        part.position.copy(bounds.getCenter(new THREE.Vector3())).negate();
        clone = new THREE.Group(); clone.add(part);
        clone.scale.setScalar(1.55 / Math.max(size.x, size.y, size.z, .0001));
        orientation.add(clone);
        view.setAttribute("aria-label", `${info.name} study. Drag or use arrow keys to rotate this study view. The real tissue stays in your forceps.`);
      }
    }
    visibility();
  }
  panel.querySelector("button").onclick = () => { minimized = true; visibility(); restore.focus(); };
  restore.onclick = () => { suspended = minimized = false; visibility(); view.focus(); };
  // Study rotation is local UI input, and must not move tissue or orbit the lab.
  panel.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Escape") { minimized = true; visibility(); restore.focus(); return; }
    if (event.target !== view) return;
    const step = {ArrowLeft: [-.16,0], ArrowRight:[.16,0], ArrowUp:[0,-.12], ArrowDown:[0,.12]}[event.key];
    if (step) { event.preventDefault(); yaw += step[0]; pitch = THREE.MathUtils.clamp(pitch + step[1], -1, 1); }
    if (event.key === "Home") { event.preventDefault(); yaw = pitch = 0; }
  });
  view.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    drag = {x:event.clientX, y:event.clientY}; view.setPointerCapture(event.pointerId); view.focus();
  });
  view.addEventListener("pointermove", event => {
    if (!drag) return;
    yaw += (event.clientX-drag.x)*.012;
    pitch = THREE.MathUtils.clamp(pitch+(event.clientY-drag.y)*.012,-1,1);
    drag = {x:event.clientX,y:event.clientY};
  });
  for (const type of ["pointerup","pointercancel","lostpointercapture"]) view.addEventListener(type,()=>{drag=null;});
  lab.subscribe(update); update(lab.getState());
  return {
    setSuspended(value) { suspended = value; visibility(); },
    getDebug: () => ({id, visible:!panel.hidden, minimized, yaw, pitch}),
    render() {
      if (panel.hidden || !clone || !source) return;
      const rect = view.getBoundingClientRect(), host = bench.host.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const renderer = bench.renderer;
      renderer.getViewport(viewport); renderer.getScissor(scissor);
      const scissorTest = renderer.getScissorTest(), autoClear = renderer.autoClear;
      const tone = renderer.toneMapping, exposure = renderer.toneMappingExposure;
      delta.setFromEuler(euler.set(pitch,yaw,0));
      orientation.quaternion.copy(delta).multiply(source.quaternion);
      orientation.position.y=0;orientation.updateMatrixWorld(true);
      orientation.position.y=-.525-new THREE.Box3().setFromObject(orientation).min.y;
      camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix();
      try {
        renderer.setViewport(rect.left-host.left,host.bottom-rect.bottom,rect.width,rect.height);
        renderer.setScissor(rect.left-host.left,host.bottom-rect.bottom,rect.width,rect.height);
        renderer.setScissorTest(true); renderer.autoClear = true;
        renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
        renderer.render(scene,camera);
      } finally {
        renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
        renderer.autoClear = autoClear; renderer.toneMapping = tone; renderer.toneMappingExposure = exposure;
      }
    },
  };
}
