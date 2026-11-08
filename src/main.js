import "./style.css";
import { Box3 } from "three";
import { createBench } from "./scene.js";
import { createOnion } from "./specimens/onion.js";
import { createPhysics } from "./physics.js";
import { LabController } from "./lab-controller.js";
import { installInput } from "./input.js";
import { installHandTracking } from "./hand-tracking.js";
import { installMicroscope, microscopeIcon } from "./microscope.js";
import { createLandingPresentation } from "./landing-presentation.js";
import { installOrganSlide } from "./organ-slide.js";
import { installTeachingChat } from "./teaching-chat.js";
import { installLiquidGlass } from "./liquid-glass.js";
import "./teaching-style.css";

const $ = (id) => document.getElementById(id);
const specimenId =
  new URLSearchParams(location.search).get("specimen") === "frog"
    ? "frog"
    : "onion";
const appearance = new URLSearchParams(location.search).get("appearance") === "blue" ? "blue" : "natural";
const paths = {
  inspect: "m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12 4 7.5M12 12v9",
  scalpel: "m15 3 6 6-10 10-7 2 2-7L15 3Zm-9 11 5 5M14 5l5 5",
  hand: "M7 21 9 4a3 3 0 0 1 6 0l2 17M9 4l3 12 3-12M6 21h3m6 0h3",
  minus: "M5 12h14",
  plus: "M5 12h14M12 5v14",
  home: "m3 11 9-8 9 8M6 10v10h12V10M9 20v-7h6v7",
  hints: "M9 18h6M10 21h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z",
  undo: "M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12",
  layers: "m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5",
  camera: "M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  left: "M20 12H4m6-6-6 6 6 6",
  right: "M4 12h16m-6-6 6 6-6 6",
  up: "M12 20V4m-6 6 6-6 6 6",
  down: "M12 4v16m-6-6 6 6 6-6",
  lift: "M12 19V5m-6 6 6-6 6 6M5 21h14",
  lower: "M12 3v14m-6-6 6 6 6-6M5 21h14",
  rotateLeft: "M4 9a8 8 0 1 1 0 7M4 3v6h6",
  rotateRight: "M20 9a8 8 0 1 0 0 7M20 3v6h-6",
  release: "m5 12 5 5L20 7",
  place: "M12 2v12m-5-5 5 5 5-5M3 14v7h18v-7",
  peel: "M5 20V7c6 0 5 9 12 9l4-4M17 16l-1-5M5 20c6-5 9 4 16-2",
  section: "M12 3v18C0 21 0 3 12 3Zm4 2c7 4 7 11 0 15V5Z",
  membrane: "m4 6 12-3 5 15-12 3L4 6Zm1 5 12-3M7 16l12-3M9 5l5 15",
  alert: "m12 3 10 18H2L12 3Zm0 6v5m0 3v1",
  // Two r=8 arcs around (12,12); each ends exactly on its arrowhead corner.
  reset: "M4 12a8 8 0 0 1 14.93-4M18.93 3v5h-5M20 12a8 8 0 0 1-14.93 4M5.07 21v-5h5",
  frog: "M8 5a3 3 0 1 0-4 4m12-4a3 3 0 1 1 4 4M7 7c-3 3-1 10 5 10s8-7 5-10M6 12l-4 3 4 2-2 4 6-4m8-5 4 3-4 2 2 4-6-4M9 9h.01M15 9h.01",
  onion:
    "M10 3c1 4-6 5-6 11a8 8 0 0 0 16 0c0-6-7-7-6-11M12 5c-6 6-6 14 0 17m0-17c6 6 6 14 0 17",
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
$("tools").innerHTML = `<div class="tool-group">${[
  ["inspect", "Inspect (V)"],
  ["scalpel", "Scalpel (S)"],
  ["hand", "Forceps (H)"],
]
  .map(
    ([id, label]) =>
      `<button class="tool-button" data-tool="${id}" aria-label="${label}" aria-pressed="${id === "inspect"}">${icon(id)}</button>`,
  )
  .join(
    "",
  )}</div><span class="divider" aria-hidden="true"></span><div class="tool-group">${[
  ["camera-angles", "camera", "Camera controls"],
  ["hints", "hints", "Show incision and grasp hints"],
  ["undo", "undo", "Undo last operation (⌘/Ctrl Z)"],
  ["reset", "reset", "Reset bench (R)"],
]
  .map(
    ([id, i, label]) =>
      `<button class="icon-button" id="${id}" aria-label="${label}" ${id === "hints" ? 'aria-pressed="false"' : ""}>${icon(i)}</button>`,
  )
  .join("")}</div>`;
const cameraPad = document.createElement("div");
cameraPad.className = "camera-pad";
cameraPad.hidden = true;
cameraPad.id = "camera-pad";
cameraPad.setAttribute("role", "group");
cameraPad.setAttribute("aria-label", "Camera controls");
cameraPad.innerHTML =
  [
    ["zoom-out", "minus", "Zoom out (−)"],
    ["zoom-in", "plus", "Zoom in (+)"],
    ["home-view", "home", "Return to working view"],
  ]
    .map(
      ([id, i, label]) =>
        `<button class="icon-button" id="${id}" aria-label="${label}">${icon(i)}</button>`,
    )
    .join("") +
  [
    ["-.15,0", "left", "Orbit left"],
    ["0,-.12", "up", "Orbit up"],
    ["0,.12", "down", "Orbit down"],
    [".15,0", "right", "Orbit right"],
  ]
    .map(
      ([value, i, label]) =>
        `<button class="icon-button" data-orbit="${value}" aria-label="${label}">${icon(i)}</button>`,
    )
    .join("");
document.querySelector(".controls-area").prepend(cameraPad);
$("camera-angles").setAttribute("aria-expanded", "false");
$("camera-angles").setAttribute("aria-controls", "camera-pad");
$("piece-menu").innerHTML = icon("layers");
$("place-action").innerHTML = icon("place");
$("microscope-action").innerHTML = microscopeIcon;
$("move-controls").innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3"/></svg>';
$("manipulation-pad").innerHTML = [
  ["0,0,-1", "up", "Move away (↑)"],
  ["0,1,0", "lift", "Lift (Page Up)"],
  ["rotate-left", "rotateLeft", "Rotate left (Q)"],
  ["-1,0,0", "left", "Move left (←)"],
  ["0,0,1", "down", "Move closer (↓)"],
  ["1,0,0", "right", "Move right (→)"],
  ["0,-1,0", "lower", "Lower (Page Down)"],
  ["release", "release", "Release tissue"],
  ["rotate-right", "rotateRight", "Rotate right (E)"],
]
  .map(
    ([action, i, label]) =>
      `<button class="icon-button" data-move="${action}" aria-label="${label}">${icon(i)}</button>`,
  )
  .join("");

try {
  const bench = await createBench(
      $("scene"),
      specimenId === "frog"
        ? { position: [-0.02, 0.36, 0.21], target: [-0.078, 0.035, 0] }
        : {},
    ),
    specimen =
      specimenId === "frog"
        ? await (await import("./specimens/frog.js")).createFrog(bench.scene, { appearance })
        : await createOnion(bench.scene),
    physics = await createPhysics(),
    lab = new LabController(bench, specimen, physics);
  bench.setSpecimen(specimen);
  $("bench").setAttribute(
    "aria-label",
    `Interactive ${specimen.label.toLowerCase()} dissection bench`,
  );
  document.title = `Scalpless — ${specimen.label} dissection`;
  const specimenSwitcher = document.createElement("nav");
  specimenSwitcher.className = "specimen-switcher";
  specimenSwitcher.setAttribute("aria-label", "Choose specimen");
  specimenSwitcher.innerHTML = ["onion", "frog"]
    .map(
      (id) =>
        `<a class="icon-button" href="./lab.html?specimen=${id}" aria-label="Open ${id} dissection" title="${id === "frog" ? "Frog · basic anatomy" : "Onion"}" ${id === specimenId ? 'aria-current="page"' : ""}>${icon(id)}</a>`,
    )
    .join("");
  $("bench").append(specimenSwitcher);
  let anatomyButton;
  function setAnatomyView(enabled) {
    if (!anatomyButton) return;
    specimen.setAnatomyView(enabled);
    anatomyButton.setAttribute("aria-pressed", String(enabled));
  }
  if (specimen.setAnatomyView) {
    anatomyButton = document.createElement("button");
    anatomyButton.id = "anatomy-view";
    anatomyButton.className = "icon-button anatomy-toggle";
    anatomyButton.type = "button";
    anatomyButton.setAttribute("aria-label", "Translucent anatomy view");
    anatomyButton.setAttribute("aria-pressed", "false");
    anatomyButton.title = "Translucent anatomy view";
    anatomyButton.innerHTML = icon("layers");
    anatomyButton.onclick = () => setAnatomyView(!specimen.anatomyView);
    $("bench").append(anatomyButton);
  }
  const input = installInput(lab, bench);
  // Mirror the active input on the scene for input-mode feedback.
  const setInputSource = input.setSource.bind(input);
  input.setSource = (next) => {
    setInputSource(next);
    bench.host.dataset.input = next === "webcam" ? "webcam" : "mouse";
  };
  bench.host.dataset.input = "mouse";
  const handTracking = installHandTracking(bench, input);
  const cameraPanel = $("hand-tracking-panel");
  const cameraPanelOpen = () => cameraPanel?.hidden === false;
  const teachingChat = installTeachingChat(lab, bench);
  const organSlide = installOrganSlide(lab, bench, {
    onOpen: id => teachingChat.explainOrgan(id,lab.getState()),
    onClear: () => teachingChat.clearStudy(),
  });
  const liquidGlass = installLiquidGlass(bench);
  // Observe setup-panel visibility without touching the camera/gesture adapter.
  if (cameraPanel) new MutationObserver(() => {
    if (cameraPanelOpen()) teachingChat.close();
    organSlide.setSuspended(cameraPanelOpen());
  }).observe(cameraPanel, {attributes:true, attributeFilter:["hidden"]});
  document.querySelectorAll("button[data-tool]").forEach((button) =>
    button.addEventListener("click", () => {
      closeMenus();
      lab.setTool(button.dataset.tool);
    }),
  );
  $("zoom-out").onclick = () => bench.zoom(-1);
  $("zoom-in").onclick = () => bench.zoom(1);
  $("home-view").onclick = () => {
    bench.home();
    closeMenus();
  };
  function closeMenus() {
    cameraPad.hidden = true;
    $("camera-angles").setAttribute("aria-expanded", "false");
    $("piece-picker").hidden = true;
    $("piece-menu").setAttribute("aria-expanded", "false");
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenus();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".controls-area,.context-controls")) closeMenus();
  });
  $("camera-angles").onclick = () => {
    cameraPad.hidden = !cameraPad.hidden;
    $("camera-angles").setAttribute("aria-expanded", String(!cameraPad.hidden));
  };
  cameraPad.onclick = (e) => {
    const button = e.target.closest("[data-orbit]");
    if (button) bench.orbit(...button.dataset.orbit.split(",").map(Number));
  };
  $("hints").onclick = () => lab.toggleHints();
  $("undo").onclick = () => lab.undo();
  $("reset").onclick = () => {
    closeMenus();
    lab.reset();
    setAnatomyView(false);
  };
  $("piece-menu").onclick = () => {
    $("piece-picker").hidden = !$("piece-picker").hidden;
    $("piece-menu").setAttribute(
      "aria-expanded",
      String(!$("piece-picker").hidden),
    );
  };
  $("piece-picker").onclick = (e) => {
    const button = e.target.closest("[data-piece]");
    if (!button) return;
    lab.select(button.dataset.piece);
    $("piece-picker").hidden = true;
    $("piece-menu").setAttribute("aria-expanded", "false");
    $("piece-menu").focus();
  };
  $("piece-select").onchange = (e) => lab.select(e.target.value);
  $("primary-action").onclick = () => lab.primaryAction();
  $("place-action").onclick = () => lab.placeInTray();
  // The microscope models onion tissue only.
  const microscope = specimen.id === "onion" ? installMicroscope() : null;
  // Mouse grabs end on pointerup, so the last piece picked up stays inspectable.
  let lastPicked = null;
  const inspectTarget = () => (microscope ? (lab.held?.id ?? lastPicked) : null);
  const inspectHeld = () => {
    const id = inspectTarget();
    if (!id) return;
    // A pointer drag cannot survive a modal stealing the pointer; set it down first.
    if (lab.held && input.source !== "webcam") lab.endGrab();
    microscope.open(id, specimen.parts.get(id).label);
  };
  $("microscope-action").onclick = inspectHeld;
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() !== "m" || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.matches("input,select,textarea") || microscope?.isOpen) return;
    inspectHeld();
  });
  let movementOpen = false, lastHeld = null;
  $("move-controls").onclick = () => {
    movementOpen = !movementOpen;
    $("manipulation-pad").hidden = !movementOpen;
    $("move-controls").setAttribute("aria-expanded", String(movementOpen));
  };
  $("manipulation-pad").onclick = (e) => {
    const action = e.target.closest("button")?.dataset.move;
    if (!action) return;
    if (action === "release") lab.endGrab();
    else if (action.startsWith("rotate"))
      lab.rotateHeld(action === "rotate-left" ? -1 : 1);
    else lab.moveHeld(...action.split(",").map(Number));
  };
  let optionKey = "",
    actionKey = "";
  function updateUI(state, message) {
    anatomyButton?.setAttribute("aria-pressed", String(specimen.anatomyView));
    document
      .querySelectorAll("button[data-tool]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.tool === state.tool)),
      );
    $("hints").setAttribute("aria-pressed", String(state.hints));
    $("undo").disabled = !state.undo && !state.held && !lab.cutting;
    $("cut-progress").hidden = state.tool !== "scalpel";
    $("cut-progress-fill").style.width = `${state.cut * 100}%`;
    $("cut-percentage").textContent = `${Math.round(state.cut * 100)}%`;
    $("context-controls").hidden =
      state.tool === "inspect" ||
      (state.tool === "hand" && !state.available.length);
    $("piece-select").hidden = state.tool !== "hand";
    $("piece-menu").hidden = state.tool !== "hand";
    $("piece-menu").disabled = Boolean(state.held);
    if (state.tool !== "hand" || state.held) {
      $("piece-picker").hidden = true;
      $("piece-menu").setAttribute("aria-expanded", "false");
    }
    $("piece-select").disabled = Boolean(state.held);
    const key = state.available.map((p) => p.id).join();
    if (key !== optionKey) {
      $("piece-select").replaceChildren(
        ...state.available.map((p) => new Option(p.label, p.id)),
      );
      $("piece-picker").replaceChildren(
        ...state.available.map((p) => {
          const button = document.createElement("button");
          button.className = "icon-button tissue-choice";
          button.dataset.piece = p.id;
          button.setAttribute("aria-label", p.label);
          button.title = p.label;
          button.innerHTML = icon(
            p.interaction === "lift"
              ? "section"
              : p.id === "epidermis"
                ? "membrane"
                : "layers",
          );
          // A progressively lighter pigment identifies deeper fleshy layers visually.
          const layer = Number(p.id.split("-")[1]);
          if (p.color) button.style.setProperty("--tissue", p.color);
          if (Number.isFinite(layer))
            button.style.setProperty(
              "--tissue",
              `hsl(305 32% ${34 + layer * 5}%)`,
            );
          return button;
        }),
      );
      optionKey = key;
    }
    $("piece-select").value = state.selected;
    $("piece-picker")
      .querySelectorAll("[data-piece]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.piece === state.selected),
        ),
      );
    $("cut-progress").setAttribute(
      "aria-valuenow",
      String(Math.round(state.cut * 100)),
    );
    const detached = state.held && state.pieces[state.held].detached;
    const actionLabel =
      state.tool === "scalpel"
        ? state.cutOpen
          ? "Use forceps"
          : "Trace supported seam"
        : state.held
          ? detached
            ? "Release tissue"
            : "Peel further"
          : state.available.find((p) => p.id === state.selected)
                ?.interaction === "lift" ||
              state.pieces[state.selected]?.detached
            ? "Lift selected piece"
            : "Grasp & peel";
    const actionIcon =
      state.tool === "scalpel"
        ? state.cutOpen
          ? "hand"
          : "scalpel"
        : state.held
          ? detached
            ? "release"
            : "peel"
          : "lift";
    $("primary-action").setAttribute("aria-label", actionLabel);
    if (actionKey !== actionIcon) {
      $("primary-action").innerHTML = icon(actionIcon);
      actionKey = actionIcon;
    }
    $("primary-action").disabled = lab.autoCut;
    $("place-action").hidden = !detached;
    if (state.held) lastPicked = state.held;
    if (!state.cutOpen) lastPicked = null;
    $("microscope-action").hidden = !inspectTarget() || state.tool !== "hand";
    $("microscope-action").setAttribute(
      "aria-label",
      `Inspect ${specimen.parts.get(inspectTarget())?.label.toLowerCase() ?? "tissue"} under microscope (M)`,
    );
    if (state.held !== lastHeld) {
      movementOpen = Boolean(state.held) && innerWidth > 1100;
      lastHeld = state.held;
    }
    $("move-controls").hidden = !state.held;
    $("move-controls").setAttribute("aria-expanded", String(movementOpen));
    $("manipulation-pad").hidden = !state.held || !movementOpen;
    $("tool-hint").textContent =
      state.tool === "inspect"
        ? "Drag to look around. Scroll to move closer."
        : state.tool === "scalpel"
          ? state.cutOpen
            ? "The section is free. Switch to forceps to lift it."
            : specimenId === "frog"
              ? "Trace around the abdominal panel. Short strokes add up. Turn on hints to see the incision."
              : "Drag along the front seam. Short strokes add up. Right drag to look around."
          : state.held
            ? detached
              ? "Drag to carry · Q / E to rotate · Release to place"
              : "Pull away to peel. Move back to relax. Esc to cancel."
            : state.cutOpen
              ? specimenId === "frog"
                ? "Lift the abdominal panel, then grasp exposed organs. Remove the liver to reach the stomach and intestines."
                : "Grasp an exposed edge and pull gently. Right drag to look around."
              : "Make the incision with the scalpel first.";
    if (message && $("status").textContent !== message)
      $("status").textContent = message;
  }
  lab.subscribe(updateUI);
  updateUI(lab.getState());
  // Build final-pose colliders while loading, avoiding a hull-generation hitch
  // at the instant scroll releases the specimen to interactive physics.
  physics.syncSpecimen(specimen, lab.states);
  const presentation = await createLandingPresentation(bench, specimen, {glass:liquidGlass});
  let last = performance.now(),
    accumulator = 0,
    frames = [],
    manipulationFrames = [],
    readyFrames = 0;
  bench.renderer.setAnimationLoop((now) => {
    const elapsed = (now - last) / 1000;
    const dt = Math.min(0.05, elapsed);
    last = now;
    if (document.hidden || presentation.paused) return;
    if (presentation.locked && readyFrames >= 3 && !presentation.needsRender) return;
    if (!presentation.locked) {
      accumulator += dt;
      while (accumulator >= 1 / 60) {
        physics.step();
        accumulator -= 1 / 60;
      }
      lab.update(dt);
      bench.controls.update();
    }
    presentation.update(dt);
    bench.render(dt);
    liquidGlass.render();
    organSlide.render();
    frames.push(elapsed);
    if (lab.held || lab.cutting) {
      manipulationFrames.push(elapsed);
      if (manipulationFrames.length > 360) manipulationFrames.shift();
    }
    if (frames.length > 180) frames.shift();
    if (++readyFrames === 3) {
      $("loading").classList.add("is-hidden");
      document.documentElement.dataset.ready = "true";
      presentation.ready();
    }
  });
  window.__scalpless = {
    getDebug: () => ({
      ...lab.getDebug(),
      presentation: presentation.getDebug(),
      appearance: specimen.appearance ?? "natural",
      geometryBounds: specimen.getBounds?.() ?? Object.fromEntries(
        [...specimen.parts].map(([id,part]) => {
          const box = new Box3().setFromObject(part.group, true);
          return [id, {min:box.min.toArray(),max:box.max.toArray()}];
        }),
      ),
      fps: frames.length / frames.reduce((a, b) => a + b, 0),
      manipulationFps: manipulationFrames.length
        ? manipulationFrames.length /
          manipulationFrames.reduce((a, b) => a + b, 0)
        : null,
      physicsBodies: physics.bodies.size,
      glass: liquidGlass.getDebug(),
      physicalPieces: Object.fromEntries(
        [...physics.bodies].map(([id, { body }]) => [
          id,
          {
            velocity: body.linvel(),
            sleeping: body.isSleeping(),
            colliders: body.numColliders(),
            mass: body.mass(),
          },
        ]),
      ),
      handTracking: handTracking.getDebug(),
      anatomyView: specimen.anatomyView ?? false,
      organStudy: organSlide.getDebug(),
    }),
  };
} catch (error) {
  console.error(error);
  if (parent !== window) parent.postMessage({type:"scalpless:lab-error"}, location.origin);
  $("loading").innerHTML =
    `<button class="icon-button" aria-label="The 3D bench could not start. Reload the page.">${icon("alert")}</button><span class="sr-only">The 3D bench could not start. Reload this page in a browser with WebGL enabled.</span>`;
  $("loading").querySelector("button").onclick = () => location.reload();
}
