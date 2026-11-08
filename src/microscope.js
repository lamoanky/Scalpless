// Procedural light-microscope view of whichever onion tissue is held.
// Cells are drawn per pixel as a jittered Voronoi diagram measured in microns,
// so magnification changes resolve real structure instead of scaling a bitmap.

export const MAGNIFICATIONS = [40, 100, 400];

// Field number 18 mm through a 10x eyepiece: FOV = 18 mm / objective power.
export function fieldOfView(mag) {
  return 180000 / mag;
}

export function scaleBar(fov) {
  const target = fov * 0.2;
  const steps = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
  return steps.reduce((best, s) =>
    Math.abs(s - target) < Math.abs(best - target) ? s : best,
  );
}

const EPIDERMIS = {
  gx: 250, gy: 52, stagger: true, jitter: 0.12, wall: 3,
  nucleus: 0.94, nr: 10, stretch: 1.4, airspaces: false,
};
const CORE = {
  gx: 38, gy: 34, stagger: true, jitter: 0.32, wall: 1.6,
  nucleus: 0.96, nr: 8, stretch: 1, airspaces: false,
};
const fleshy = (depth) => ({
  gx: 150 - depth * 8, gy: 132 - depth * 7, stagger: true, jitter: 0.38,
  wall: 2.2, nucleus: 0.4, nr: 9, stretch: 1.1, airspaces: true,
});

export function tissueFor(id) {
  if (id === "epidermis")
    return {
      kind: "epidermis", seed: 11, profile: EPIDERMIS,
      caption: "A single sheet of elongated, brick-like cells. Each cell has a rigid wall, a thin film of cytoplasm and a nucleus pushed aside by the large central vacuole.",
    };
  if (id === "core")
    return {
      kind: "core", seed: 29, profile: CORE,
      caption: "The basal plate: small, tightly packed cells with large nuclei. New scale leaves grow from here.",
    };
  if (id === "section")
    return {
      kind: "section", seed: 47, profile: fleshy(2),
      caption: "A slice through several scale leaves. Each band is fleshy storage tissue, bounded on both faces by a thin epidermis.",
    };
  const depth = Number(String(id).split("-")[1]);
  const d = Number.isFinite(depth) ? Math.max(0, Math.min(7, depth)) : 2;
  return {
    kind: "fleshy", seed: 61 + d * 7, profile: fleshy(d),
    caption: `Storage parenchyma from scale leaf ${d + 1}. Large, thin-walled cells filled with water-holding vacuoles; small air spaces sit where three cells meet.${d > 3 ? " Deeper layers have smaller, younger cells." : ""}`,
  };
}

export const STAINS = {
  none: { label: "Unstained", cyto: [228, 226, 216], wall: [146, 146, 136], nuc: [196, 194, 184], air: [70, 70, 66] },
  iodine: { label: "Iodine", cyto: [238, 206, 130], wall: [146, 92, 28], nuc: [104, 56, 14], air: [60, 38, 12] },
  methylene: { label: "Methylene blue", cyto: [206, 222, 240], wall: [58, 98, 170], nuc: [24, 42, 118], air: [18, 28, 70] },
};

function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(u, v, s) {
  const i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const cell = { wall: 0, f1: 0, i: 0, j: 0, sx: 0, sy: 0 };
// Nearest seed plus distance to the nearest Voronoi edge, in microns.
// The diagram is built on a square lattice in x-compressed space (x / aspect),
// which stretches cells into the elongated, pointed shapes of real epidermis.
function voronoi(u, v, p, seed) {
  const A = p.gx / p.gy, g = p.gy, cu = u / A;
  const j0 = Math.floor(v / g);
  let f1 = Infinity, f2 = Infinity, ax = 0, ay = 0, bx = 0, by = 0, ai = 0, aj = 0;
  for (let j = j0 - 1; j <= j0 + 1; j++) {
    const off = p.stagger && j & 1 ? 0.5 : 0;
    const i0 = Math.floor(cu / g - off);
    for (let i = i0 - 1; i <= i0 + 1; i++) {
      const px = (i + off + 0.5 + (hash(i, j, seed) - 0.5) * 2 * p.jitter) * g;
      const py = (j + 0.5 + (hash(i, j, seed + 1) - 0.5) * 2 * p.jitter) * g;
      const d = (cu - px) ** 2 + (v - py) ** 2;
      if (d < f1) {
        f2 = f1; bx = ax; by = ay;
        f1 = d; ax = px; ay = py; ai = i; aj = j;
      } else if (d < f2) {
        f2 = d; bx = px; by = py;
      }
    }
  }
  // Edge distance in compressed space, converted back through the bisector normal.
  const nx = bx - ax, ny = by - ay, len = Math.hypot(nx, ny);
  const compressed = (f2 - f1) / (2 * len);
  cell.wall = compressed / Math.hypot(nx / len / A, ny / len);
  cell.f1 = Math.sqrt(f1) / g;
  cell.i = ai; cell.j = aj; cell.sx = ax * A; cell.sy = ay;
  return cell;
}

const mix = (a, b, t, k) => a[k] + (b[k] - a[k]) * t;

/**
 * Paint a circular eyepiece field into RGBA `data` (size × size).
 * view: { tissue, mag, stain, panX, panY } with pan in microns.
 */
export function paintField(data, size, view) {
  const { profile: base, seed, kind } = view.tissue;
  const stain = STAINS[view.stain] ?? STAINS.iodine;
  const fov = fieldOfView(view.mag), um = fov / size;
  const radius = size / 2, wallMin = um * 1.1;
  const bubbles = [0, 1].map((n) => ({
    x: (hash(n, 3, seed) - 0.5) * 3000, y: (hash(n, 4, seed) - 0.5) * 2200,
    r: 120 + hash(n, 5, seed) * 260,
  }));
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const o = (py * size + px) * 4;
      const dx = px - radius + 0.5, dy = py - radius + 0.5, r = Math.hypot(dx, dy) / radius;
      if (r > 1) {
        data[o] = data[o + 1] = data[o + 2] = 6; data[o + 3] = 255;
        continue;
      }
      const u = view.panX + dx * um, v = view.panY + dy * um;
      let p = base, s = seed, cuticle = Infinity;
      if (kind === "section") {
        // Bands of fleshy tissue, each faced with flattened epidermal cells.
        const band = 640, inBand = ((v % band) + band) % band;
        const edge = Math.min(inBand, band - inBand);
        cuticle = edge;
        if (edge < 70) { p = EPIDERMIS; s = seed + 5; }
      }
      const c = voronoi(u, v, p, s);
      const wallWidth = Math.max(p.wall, wallMin);
      // Cytoplasm hugs the wall; the vacuole centre stays clear.
      const rim = Math.max(0, 1 - c.wall / (p.wall * 6 + um * 2));
      const grain = valueNoise(u / 2.5, v / 2.5, s + 9) - 0.5;
      const blot = valueNoise(u / 700, v / 700, s + 3);
      let t = 0.08 + rim * 0.35 + grain * (um < 2 ? 0.18 : 0.06) + (blot - 0.5) * 0.12;
      let R = mix(stain.cyto, stain.wall, Math.max(0, t), 0);
      let G = mix(stain.cyto, stain.wall, Math.max(0, t), 1);
      let B = mix(stain.cyto, stain.wall, Math.max(0, t), 2);
      if (hash(c.i, c.j, s + 7) < p.nucleus) {
        const nx = c.sx + (hash(c.i, c.j, s + 11) - 0.5) * p.gx * 0.45;
        const ny = c.sy + (hash(c.i, c.j, s + 12) - 0.5) * p.gy * 0.3;
        const nd = Math.hypot((u - nx) / p.stretch, v - ny) / p.nr;
        if (nd < 1.15) {
          const nucleolus = Math.hypot(u - nx - p.nr * 0.25, v - ny + p.nr * 0.15) < p.nr * 0.28;
          const k = nd < 1 ? (nucleolus ? 1 : 0.72 + (1 - nd) * 0.18) : (1.15 - nd) / 0.15 * 0.5;
          R += (stain.nuc[0] - R) * k; G += (stain.nuc[1] - G) * k; B += (stain.nuc[2] - B) * k;
        }
      }
      if (c.wall < wallWidth) {
        const k = 1 - (c.wall / wallWidth) * 0.4;
        R += (stain.wall[0] - R) * k; G += (stain.wall[1] - G) * k; B += (stain.wall[2] - B) * k;
      }
      // Intercellular air spaces where several cells meet appear dark.
      if (p.airspaces && c.f1 > 0.6 && c.wall < Math.max(p.wall * 2.2, um * 1.5)) {
        R += (stain.air[0] - R) * 0.75; G += (stain.air[1] - G) * 0.75; B += (stain.air[2] - B) * 0.75;
      }
      if (cuticle < wallWidth * 1.6) {
        R += (stain.wall[0] * 0.7 - R) * 0.9; G += (stain.wall[1] * 0.7 - G) * 0.9; B += (stain.wall[2] * 0.7 - B) * 0.9;
      }
      // Trapped air bubbles: thick dark ring, bright refracting centre.
      for (const b of bubbles) {
        const bd = Math.hypot(u - b.x, v - b.y) / b.r;
        if (bd < 1) {
          const ring = bd > 0.82 ? 0.9 : bd > 0.7 ? 0.35 : -0.15;
          const tone = ring > 0 ? stain.air : [255, 255, 255];
          const k = Math.abs(ring);
          R += (tone[0] - R) * k; G += (tone[1] - G) * k; B += (tone[2] - B) * k;
        }
      }
      // Eyepiece vignette.
      const vig = r > 0.8 ? 1 - ((r - 0.8) / 0.2) ** 2 * 0.75 : 1;
      data[o] = R * vig; data[o + 1] = G * vig; data[o + 2] = B * vig; data[o + 3] = 255;
    }
  }
  return data;
}

const ICON = "M10 3h4v9h-4zM8 15h8M12 12v3M17 8a7 7 0 0 1-2 12M6 21h12";
export const microscopeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON}"/></svg>`;

export function installMicroscope() {
  const dialog = document.createElement("dialog");
  dialog.className = "microscope";
  dialog.id = "microscope";
  dialog.setAttribute("aria-labelledby", "microscope-title");
  dialog.innerHTML = `
    <header>
      <h2 id="microscope-title"></h2>
      <button type="button" class="icon-button" data-close aria-label="Close microscope"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    </header>
    <div class="microscope-stage">
      <canvas width="480" height="480" aria-label="Microscope field of view. Drag to move the slide. Scroll to change magnification."></canvas>
      <div class="microscope-scale" aria-hidden="true"><i></i><span></span></div>
    </div>
    <div class="microscope-controls">
      <div class="microscope-mags" role="group" aria-label="Magnification">
        ${MAGNIFICATIONS.map((m) => `<button type="button" data-mag="${m}" aria-pressed="false">${m}×</button>`).join("")}
      </div>
      <label>Stain<select data-stain>${Object.entries(STAINS).map(([id, s]) => `<option value="${id}">${s.label}</option>`).join("")}</select></label>
      <label>Focus<input data-focus type="range" min="-1" max="1" step="0.02" value="0"></label>
    </div>
    <p class="microscope-caption"></p>`;
  document.body.append(dialog);
  const canvas = dialog.querySelector("canvas"), ctx = canvas.getContext("2d");
  const image = ctx.createImageData(canvas.width, canvas.height);
  const state = { tissue: tissueFor("epidermis"), label: "", mag: 100, stain: "iodine", panX: 0, panY: 0 };
  let queued = false;

  function draw() {
    queued = false;
    paintField(image.data, canvas.width, state);
    ctx.putImageData(image, 0, 0);
    const fov = fieldOfView(state.mag), bar = scaleBar(fov);
    dialog.querySelector(".microscope-scale i").style.width = `${(bar / fov) * 100}%`;
    dialog.querySelector(".microscope-scale span").textContent = bar >= 1000 ? `${bar / 1000} mm` : `${bar} µm`;
    dialog.querySelector("h2").textContent = `${state.label} · ${state.mag}×`;
    dialog.querySelectorAll("[data-mag]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.mag) === state.mag)));
  }
  const redraw = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };
  const setMag = (mag) => { state.mag = mag; redraw(); };

  dialog.querySelector("[data-close]").onclick = () => dialog.close();
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  dialog.querySelector(".microscope-mags").onclick = (e) => {
    const b = e.target.closest("[data-mag]");
    if (b) setMag(Number(b.dataset.mag));
  };
  dialog.querySelector("[data-stain]").onchange = (e) => { state.stain = e.target.value; redraw(); };
  dialog.querySelector("[data-focus]").oninput = (e) => {
    canvas.style.filter = `blur(${Math.abs(Number(e.target.value)) * 4}px)`;
  };
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const um = fieldOfView(state.mag) / canvas.clientWidth, limit = 4000;
    state.panX = Math.max(-limit, Math.min(limit, state.panX - (e.clientX - drag.x) * um));
    state.panY = Math.max(-limit, Math.min(limit, state.panY - (e.clientY - drag.y) * um));
    drag = { x: e.clientX, y: e.clientY };
    redraw();
  });
  const endDrag = () => { drag = null; };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const i = MAGNIFICATIONS.indexOf(state.mag) + (e.deltaY < 0 ? 1 : -1);
    if (MAGNIFICATIONS[i]) setMag(MAGNIFICATIONS[i]);
  }, { passive: false });
  dialog.addEventListener("keydown", (e) => {
    const i = MAGNIFICATIONS.indexOf(state.mag);
    if ((e.key === "+" || e.key === "=") && MAGNIFICATIONS[i + 1]) setMag(MAGNIFICATIONS[i + 1]);
    if (e.key === "-" && MAGNIFICATIONS[i - 1]) setMag(MAGNIFICATIONS[i - 1]);
  });

  return {
    open(id, label) {
      state.tissue = tissueFor(id);
      state.label = label;
      state.panX = state.panY = 0;
      dialog.querySelector("[data-stain]").value = state.stain;
      dialog.querySelector(".microscope-caption").textContent = state.tissue.caption;
      draw();
      if (!dialog.open) dialog.showModal();
    },
    close: () => dialog.close(),
    get isOpen() { return dialog.open; },
  };
}
