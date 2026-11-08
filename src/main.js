import "./style.css";

const specimens = [
  {
    id: "outer",
    title: "Outer Layer",
    label: "LAYER 01 · PROTECTIVE SCALES",
    description:
      "The thin, papery outer scales protect the fleshy layers underneath.",
    image: "outer",
    current: 0,
    pages: ["Overview", "Protective scales", "Pigmentation", "Surface texture"],
  },
  {
    id: "first",
    title: "First Layer",
    label: "LAYER 02 · FLESHY SCALE",
    description:
      "A pigmented, fleshy scale. Lift it to inspect the curved surface and its thin epidermis.",
    image: "first",
    current: 1,
    pages: ["Overview", "Fleshy scale", "Epidermis", "Surface texture"],
  },
  {
    id: "inner",
    title: "Inner Layers",
    label: "LAYER 03 · INNER SCALES",
    description:
      "Concentric fleshy leaf bases form the bulb. Each layer curves around the next.",
    image: "inner",
    current: 2,
    pages: ["Overview", "Layer boundaries", "Inner scales", "Cross section"],
  },
  {
    id: "cells",
    title: "Onion Cells",
    label: "CELL STUDY · EPIDERMIS",
    description:
      "Inspect the adjoining cell walls and the stained structures within each cell.",
    image: "cells",
    current: 1,
    pages: ["Overview", "Cell walls", "Nuclei", "Tissue pattern"],
  },
  {
    id: "microscope",
    title: "Microscopic View",
    label: "CELL STUDY · DETAIL",
    description:
      "Look closer at the cell boundaries and stained nuclei. Drag to pan the magnified image.",
    image: "microscope",
    current: 2,
    pages: ["Overview", "Cell boundaries", "Nuclei"],
  },
];
const state = {
  focused: false,
  selected: null,
  tool: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  cuts: [],
  inspection: null,
};
const $ = (selector) => document.querySelector(selector);
const stage = $("#stage");
const dialog = $("#inspection-dialog");
const status = $("#workspace-status");
let statusTimer;

function announce(message, persistent = false) {
  clearTimeout(statusTimer);
  status.textContent = message;
  status.classList.add("is-visible");
  if (!persistent)
    statusTimer = setTimeout(() => status.classList.remove("is-visible"), 4200);
}
function resize() {
  document.documentElement.style.setProperty(
    "--scale",
    Math.min(innerWidth / 1672, innerHeight / 941),
  );
}
resize();
window.addEventListener("resize", resize);

const panels = $("#panels");
for (const specimen of specimens) {
  const panel = document.createElement("section");
  panel.className = "panel";
  panel.dataset.panel = specimen.id;
  panel.setAttribute("aria-label", specimen.title);
  panel.innerHTML = `<button class="panel-main" aria-label="Inspect ${specimen.title}" aria-pressed="false"><h2 class="panel-title">${specimen.id === "inner" ? "" : '<span class="panel-dot" aria-hidden="true"></span>'}${specimen.title}</h2><img class="panel-art" src="/art/${specimen.image}.png" alt="${specimen.title === "Microscopic View" ? "Purple-stained onion cells under magnification" : specimen.title}" draggable="false" /></button><div class="panel-pager" aria-label="${specimen.title} details">${specimen.pages.map((page, index) => `<button class="pager-dot" aria-label="${specimen.title}: ${page}" aria-current="${index === specimen.current}" data-page="${index}"></button>`).join("")}</div>${specimen.id === "microscope" ? '<span class="scale-bar" aria-hidden="true">50μm</span>' : ""}`;
  panels.appendChild(panel);
  panel
    .querySelector(".panel-main")
    .addEventListener("click", () => select(specimen.id));
  panel.querySelectorAll(".pager-dot").forEach((button) =>
    button.addEventListener("click", () => {
      specimen.current = Number(button.dataset.page);
      panel
        .querySelectorAll(".pager-dot")
        .forEach((dot, index) =>
          dot.setAttribute("aria-current", String(index === specimen.current)),
        );
      select(specimen.id, false);
      $("#inspector-eyebrow").textContent =
        specimen.pages[specimen.current].toUpperCase();
    }),
  );
}

function showLayers() {
  state.focused = false;
  stage.classList.remove("is-focused");
  $("#specimen-view").setAttribute("aria-pressed", "false");
  $("#specimen-view").classList.remove("is-active");
  $("#layers-view").setAttribute("aria-pressed", "true");
  $("#layers-view").classList.add("is-active");
  panels.removeAttribute("inert");
}
function select(id, openMicroscope = true) {
  const specimen = specimens.find((item) => item.id === id);
  state.selected = id;
  showLayers();
  document.querySelectorAll(".panel").forEach((panel) => {
    const selected = panel.dataset.panel === id;
    panel.classList.toggle("is-selected", selected);
    panel
      .querySelector(".panel-main")
      .setAttribute("aria-pressed", String(selected));
  });
  if (openMicroscope && (id === "cells" || id === "microscope")) {
    openInspection(id);
    return;
  }
  $("#inspector-title").textContent = specimen.title;
  $("#inspector-eyebrow").textContent = specimen.label;
  $("#inspector-description").textContent = specimen.description;
  $("#inspect-layer").firstChild.textContent =
    (id === "cells" || id === "microscope"
      ? "Inspect cells"
      : "Isolate layer") + " ";
  $("#layer-inspector").hidden = false;
}
$("#close-inspector").addEventListener("click", () => {
  $("#layer-inspector").hidden = true;
  document
    .querySelector(`[data-panel="${state.selected}"] .panel-main`)
    ?.focus({ preventScroll: true });
});
$("#inspect-layer").addEventListener("click", () =>
  openInspection(state.selected),
);

function updateZoom() {
  const image = $("#inspection-image");
  image.style.setProperty("--zoom", state.zoom);
  image.style.setProperty("--pan-x", `${state.panX}px`);
  image.style.setProperty("--pan-y", `${state.panY}px`);
  $("#zoom-level").textContent = `${state.zoom}×`;
  $("#zoom-out").disabled = state.zoom === 1;
  $("#zoom-in").disabled = state.zoom === 4;
}
function openInspection(id) {
  const specimen = specimens.find((item) => item.id === id);
  state.inspection = id;
  state.zoom = 1;
  state.panX = state.panY = 0;
  dialog.dataset.kind = id;
  $("#inspection-title").textContent = specimen.title;
  $("#inspection-eyebrow").textContent = specimen.label;
  $("#inspection-caption").textContent = specimen.description;
  const image = $("#inspection-image");
  image.src = `/art/${specimen.image}.png`;
  image.alt = specimen.title;
  updateZoom();
  if (!dialog.open) dialog.showModal();
}
$("#dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      dialog.close();
  }
});
$("#zoom-in").addEventListener("click", () => {
  state.zoom = Math.min(4, state.zoom + 0.5);
  updateZoom();
});
$("#zoom-out").addEventListener("click", () => {
  state.zoom = Math.max(1, state.zoom - 0.5);
  if (state.zoom === 1) state.panX = state.panY = 0;
  updateZoom();
});
let panStart = null;
const imageWrap = $("#inspection-image-wrap");
imageWrap.addEventListener("pointerdown", (event) => {
  if (state.zoom === 1) return;
  panStart = {
    x: event.clientX,
    y: event.clientY,
    originX: state.panX,
    originY: state.panY,
  };
  imageWrap.setPointerCapture(event.pointerId);
});
imageWrap.addEventListener("pointermove", (event) => {
  if (!panStart) return;
  const limit = 150 * (state.zoom - 1);
  state.panX = Math.max(
    -limit,
    Math.min(limit, panStart.originX + event.clientX - panStart.x),
  );
  state.panY = Math.max(
    -limit,
    Math.min(limit, panStart.originY + event.clientY - panStart.y),
  );
  updateZoom();
});
imageWrap.addEventListener("pointerup", () => (panStart = null));
imageWrap.addEventListener("pointercancel", () => (panStart = null));

$("#specimen-view").addEventListener("click", () => {
  state.focused = true;
  stage.classList.add("is-focused");
  panels.setAttribute("inert", "");
  $("#layer-inspector").hidden = true;
  $("#specimen-view").setAttribute("aria-pressed", "true");
  $("#specimen-view").classList.add("is-active");
  $("#layers-view").setAttribute("aria-pressed", "false");
  $("#layers-view").classList.remove("is-active");
  announce("Specimen view. Select Layers to bring back the study panels.");
});
$("#layers-view").addEventListener("click", showLayers);
$("#magnify").addEventListener("click", () => openInspection("microscope"));

const surface = $("#cut-surface");
function setTool(tool) {
  state.tool = state.tool === tool ? null : tool;
  $("#scalpel").setAttribute("aria-pressed", String(state.tool === "scalpel"));
  $("#forceps").setAttribute("aria-pressed", String(state.tool === "forceps"));
  surface.classList.toggle("tool-enabled", Boolean(state.tool));
  surface.classList.toggle("forceps-enabled", state.tool === "forceps");
  surface.setAttribute("tabindex", state.tool ? "0" : "-1");
  if (state.tool === "scalpel")
    announce(
      "Scalpel selected. Drag across the onion to mark an incision.",
      true,
    );
  else if (state.tool === "forceps")
    announce(
      "Forceps selected. Select the onion or a layer to inspect it.",
      true,
    );
  else status.classList.remove("is-visible");
}
$("#scalpel").addEventListener("click", () => setTool("scalpel"));
$("#forceps").addEventListener("click", () => setTool("forceps"));
function point(event) {
  const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(
    surface.getScreenCTM().inverse(),
  );
  return [p.x, p.y];
}
let activeCut = null;
function renderCuts() {
  $("#cut-lines").replaceChildren(
    ...state.cuts.map((points) => {
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "polyline",
      );
      path.classList.add("cut-line");
      path.setAttribute("points", points.map((p) => p.join(",")).join(" "));
      return path;
    }),
  );
}
surface.addEventListener("pointerdown", (event) => {
  if (state.tool === "forceps") {
    select("first", false);
    openInspection("first");
    return;
  }
  if (state.tool !== "scalpel") return;
  activeCut = [point(event)];
  state.cuts.push(activeCut);
  surface.setPointerCapture(event.pointerId);
  renderCuts();
});
surface.addEventListener("pointermove", (event) => {
  if (!activeCut) return;
  activeCut.push(point(event));
  renderCuts();
});
surface.addEventListener("pointerup", () => {
  if (!activeCut) return;
  activeCut = null;
  announce("Incision marked. Select forceps to inspect a layer.");
});
surface.addEventListener("pointercancel", () => (activeCut = null));
surface.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  if (state.tool === "forceps") {
    select("first", false);
    openInspection("first");
  }
  if (state.tool === "scalpel") {
    state.cuts.push([
      [225, 140],
      [238, 205],
      [250, 280],
      [265, 350],
    ]);
    renderCuts();
    announce("Incision marked. Select forceps to inspect a layer.");
  }
});
function reset() {
  state.focused = false;
  state.selected = null;
  state.tool = null;
  state.zoom = 1;
  state.panX = state.panY = 0;
  state.cuts = [];
  activeCut = null;
  showLayers();
  renderCuts();
  $("#layer-inspector").hidden = true;
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.remove("is-selected");
    panel.querySelector(".panel-main").setAttribute("aria-pressed", "false");
  });
  [0, 1, 2, 1, 2].forEach((current, index) => {
    specimens[index].current = current;
    document
      .querySelectorAll(`[data-panel="${specimens[index].id}"] .pager-dot`)
      .forEach((dot, i) =>
        dot.setAttribute("aria-current", String(i === current)),
      );
  });
  $("#scalpel").setAttribute("aria-pressed", "false");
  $("#forceps").setAttribute("aria-pressed", "false");
  surface.classList.remove("tool-enabled", "forceps-enabled");
  surface.setAttribute("tabindex", "-1");
  dialog.close();
  updateZoom();
  announce("Workspace reset.");
}
$("#reset").addEventListener("click", reset);
window.addEventListener("keydown", (event) => {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.target.matches("input,textarea,select")
  )
    return;
  if (dialog.open) return;
  const actions = {
    v: () => $("#specimen-view").click(),
    l: showLayers,
    m: () => openInspection("microscope"),
    r: reset,
  };
  if (actions[event.key.toLowerCase()]) {
    event.preventDefault();
    actions[event.key.toLowerCase()]();
  }
  if (event.key === "Escape") {
    $("#layer-inspector").hidden = true;
    if (state.tool) setTool(state.tool);
  }
});
window.__scalpless = { state };
Promise.all([...document.images].map((image) => image.decode().catch(() => {})))
  .then(() => document.fonts.ready)
  .then(() => {
    document.documentElement.dataset.ready = "true";
  });
