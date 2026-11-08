import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ORGAN_GUIDE, studyOrgan, studyHistory } from "./organ-guide.js";
import "./lab-panels.css";

const closeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';

// A second view, not a second specimen: clones share the existing geometries
// and materials. They never enter the lab scene, input adapter or physics world.
// The existing renderer draws this small scissored view after its main pipeline.
export function installOrganSlide(lab, bench, {onOpen=()=>{}, onClear=()=>{}}={}) {
  const panel = document.createElement("section");
  panel.id = "organ-slide"; panel.className = "organ-slide"; panel.hidden = true;
  panel.setAttribute("aria-labelledby", "organ-name");
  panel.innerHTML = `
    <header class="slide-heading"><div class="study-history" aria-label="Studied organs. Scroll to previous organs."></div>
      <button type="button" class="icon-button" aria-label="Minimize organ study">${closeIcon}</button></header>
    <div class="slide-preview" tabindex="0" role="img" aria-label="Organ study. Drag or use arrow keys to rotate this study view."><span class="slide-etch" aria-hidden="true"><svg viewBox="0 0 300 150" preserveAspectRatio="none"><rect class="preview-rim" x="1" y="1" width="298" height="148" rx="12"/><path class="preview-corners" d="M13 27V14H26M274 14H287V27M287 123V136H274M26 136H13V123"/></svg></span></div>
    <nav class="study-navigation" aria-label="Browse studied organs"><button type="button" class="icon-button" id="study-previous" aria-label="Previous organ"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button><button type="button" class="icon-button" id="study-next" aria-label="Next organ"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg></button></nav>`;
  const restore = document.createElement("button");
  restore.type = "button"; restore.className = "icon-button study-launch"; restore.hidden = true;
  restore.setAttribute("aria-label", "Open organ study"); restore.setAttribute("aria-controls", panel.id);
  restore.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v10H3zM7 7v10M10 11h7m-7 3h4"/></svg>';
  document.getElementById("bench").append(panel, restore);
  const view = panel.querySelector(".slide-preview");
  const historyTrack = panel.querySelector(".study-history");
  new ResizeObserver(()=>{
    document.getElementById("bench").style.setProperty("--study-height",`${panel.offsetHeight}px`);
  }).observe(panel);
  const scene = new THREE.Scene();
  scene.background = null; // Preserve the live liquid-glass backdrop under the study.
  scene.environment = bench.scene.environment;
  scene.environmentIntensity = .75;
  scene.add(new THREE.HemisphereLight("#ffffff", "#8ea8c6", 1));
  const key = new THREE.DirectionalLight("#fff5ed", 2.4); key.position.set(-3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight("#b4e9ff", 1.1); rim.position.set(3, 1, -2); scene.add(rim);
  const camera = new THREE.PerspectiveCamera(35, 1, .05, 20);
  camera.position.set(0, 2.8, 3.8); camera.lookAt(0, -.2, 0); camera.zoom=1.25;
  const glass = new THREE.Mesh(new RoundedBoxGeometry(2.9, .075, 1.65, 3, .04),
    new THREE.MeshPhysicalMaterial({color: "#c3e8ff", transparent: true, opacity: .32, roughness: .14, metalness: .12, clearcoat: 1}));
  glass.position.y = -.57; glass.rotation.y = -.23; scene.add(glass);
  // The rounded surface has no sharp edges for EdgesGeometry to detect.
  // Etch its top perimeter explicitly so the transparent slide has thickness.
  const rimPoints=[[-1.41,-.825],[1.41,-.825],[1.45,-.785],[1.45,.785],
    [1.41,.825],[-1.41,.825],[-1.45,.785],[-1.45,-.785]];
  const edge=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rimPoints.map(([x,z])=>new THREE.Vector3(x,.038,z))),
    new THREE.LineBasicMaterial({color:"#e5f8ff",transparent:true,opacity:.7}));
  glass.add(edge);
  const contact=document.createElement("canvas");contact.width=contact.height=64;
  const ctx=contact.getContext("2d"),gradient=ctx.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,"#24395065");gradient.addColorStop(1,"#24395000");ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1.8,1.2),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(contact),transparent:true,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=-.527;scene.add(shadow);
  const orientation = new THREE.Group(); scene.add(orientation);
  let id = null, source = null, clone = null, minimized = false, suspended = false;
  let entries = [], lastLive = null, presented = null, scrollTimer, wheelDelta = 0;
  let yaw = 0, pitch = 0, drag = null;
  const viewport = new THREE.Vector4(), scissor = new THREE.Vector4();
  const delta = new THREE.Quaternion(), euler = new THREE.Euler();
  const isVisible = () => !panel.hidden && getComputedStyle(panel).visibility !== "hidden";
  function visibility() {
    const show = Boolean(id) && !minimized && !suspended;
    if (!show) drag = null;
    if (!show && panel.contains(document.activeElement)) bench.host.focus({preventScroll:true});
    panel.hidden = !show;
    restore.hidden = !id || !minimized || suspended;
    restore.setAttribute("aria-expanded", String(show));
    document.getElementById("bench").classList.toggle("has-organ-study", show);
    if (!show) presented = null;
    else if (presented !== id) { presented = id; onOpen(id); }
  }
  function select(next, align = true) {
    if (next !== id) {
      if (clone) orientation.remove(clone);
      clone = null; source = null; id = next; minimized = false; yaw = pitch = 0;
      panel.dataset.organ = id ?? "";
      if (id) {
        const info = ORGAN_GUIDE[id];
        panel.setAttribute("aria-label", `${info.name} study`);
        source = lab.specimen.parts.get(id).group;
        const part = source.clone(true);
        part.visible = true; // A collected source is hidden only in the bench.
        part.position.set(0,0,0); part.quaternion.identity(); part.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(part), size = bounds.getSize(new THREE.Vector3());
        part.position.copy(bounds.getCenter(new THREE.Vector3())).negate();
        clone = new THREE.Group(); clone.add(part);
        clone.scale.setScalar(1.55 / Math.max(size.x, size.y, size.z, .0001));
        orientation.add(clone);
      }
    }
    for (const button of historyTrack.children) {
      const active = button.dataset.organ === id;
      button.id = active ? "organ-name" : "";
      button.setAttribute("aria-current", String(active));
    }
    const index = entries.indexOf(id);
    panel.querySelector("#study-previous").disabled = index <= 0;
    panel.querySelector("#study-next").disabled = index < 0 || index === entries.length-1;
    panel.querySelector(".study-navigation").hidden = entries.length < 2;
    if (id) {
      const collected = lab.getState().pieces[id].collected;
      view.setAttribute("aria-label", `${ORGAN_GUIDE[id].name} study. Drag or use arrow keys to rotate this study view. ${collected ? "The organ has been removed from the bench." : "The real tissue stays in your forceps."}`);
    }
    visibility();
    if (align && id) historyTrack.scrollLeft = index * historyTrack.clientWidth;
  }
  function update(state) {
    const nextEntries = studyHistory(state, entries), live = studyOrgan(state);
    const changed = nextEntries.join() !== entries.join();
    if (changed) {
      entries = nextEntries;
      historyTrack.replaceChildren(...entries.map(organ => {
        const button = document.createElement("button");
        button.type="button"; button.className="study-label"; button.dataset.organ=organ;
        button.textContent=ORGAN_GUIDE[organ].name;
        button.onclick=()=>select(organ);
        return button;
      }));
    }
    const next = live !== lastLive || !entries.includes(id) ? live : id;
    lastLive = live;
    const cleared = id && !next;
    select(next,changed || next !== id);
    if (cleared) onClear();
  }
  panel.querySelector('[aria-label="Minimize organ study"]').onclick = () => { minimized = true; visibility(); restore.focus(); };
  restore.onclick = () => { suspended = minimized = false; visibility(); view.focus(); };
  function navigate(step) {
    const next = entries[entries.indexOf(id)+step];
    if (next) select(next);
  }
  panel.querySelector("#study-previous").onclick=()=>navigate(-1);
  panel.querySelector("#study-next").onclick=()=>navigate(1);
  historyTrack.addEventListener("scroll",()=>{
    clearTimeout(scrollTimer);
    scrollTimer=setTimeout(()=>{
      const next=entries[Math.round(historyTrack.scrollLeft/Math.max(historyTrack.clientWidth,1))];
      if(next && next!==id)select(next,false);
    },100);
  });
  panel.addEventListener("wheel",event=>{
    event.preventDefault();event.stopPropagation();
    wheelDelta += Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;
    if (Math.abs(wheelDelta)>50) { navigate(Math.sign(wheelDelta)); wheelDelta=0; }
  },{passive:false});
  new ResizeObserver(()=>{if(id)historyTrack.scrollLeft=entries.indexOf(id)*historyTrack.clientWidth;}).observe(historyTrack);
  // Study rotation is local UI input, and must not move tissue or orbit the lab.
  panel.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Escape") { minimized = true; visibility(); restore.focus(); return; }
    if (event.key === "PageUp" || event.key === "PageDown") { event.preventDefault(); navigate(event.key === "PageUp" ? -1 : 1); return; }
    if(historyTrack.contains(event.target) && ["ArrowLeft","ArrowRight"].includes(event.key)) {
      event.preventDefault();navigate(event.key === "ArrowLeft" ? -1 : 1);return;
    }
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
    getDebug: () => ({id, history:[...entries], visible:isVisible(), minimized, yaw, pitch}),
    render() {
      // The landing can hide the whole interface while retaining lab state.
      // A hidden HTML panel must not leave its scissored 3D view on the canvas.
      if (!isVisible() || !clone || !source) return;
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
        renderer.setScissorTest(true); renderer.autoClear = false;
        renderer.clearDepth();
        renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
        renderer.render(scene,camera);
      } finally {
        renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
        renderer.autoClear = autoClear; renderer.toneMapping = tone; renderer.toneMappingExposure = exposure;
      }
    },
  };
}
