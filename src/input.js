import { INPUT_EVENTS } from "./domain.js";

export function installInput(lab, bench) {
  const canvas = bench.renderer.domElement;
  let active = null,
    right = false;
  const detail = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
      mode: lab.tool === "inspect" ? "idle" : lab.tool,
    };
  };
  const send = (type, data = {}) =>
    window.dispatchEvent(new CustomEvent(type, { detail: data }));
  const handlers = {
    "input:move": (e) => lab.move(e.detail || {}),
    "input:pinchstart": (e) => {
      if (lab.tool !== "hand") lab.setTool("hand");
      lab.beginGrab(e.detail || {});
    },
    "input:pinchend": () => lab.endGrab(),
    "input:cutstart": (e) => {
      if (lab.tool !== "scalpel") lab.setTool("scalpel");
      lab.beginCut(e.detail || {});
    },
    "input:cutend": () => lab.endCut(),
    "input:zoom": (e) => {
      if (Number.isFinite(e.detail?.delta))
        bench.zoom(Math.max(-2, Math.min(2, e.detail.delta)));
    },
  };
  INPUT_EVENTS.forEach((type) => window.addEventListener(type, handlers[type]));
  // Capture phase establishes tool ownership before OrbitControls sees a pointer.
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button === 2) {
        right = true;
        return;
      }
      if (e.button !== 0) return;
      bench.host.focus({ preventScroll: true });
      if (lab.tool === "inspect") {
        const instrument = lab.instrumentAt(detail(e));
        if (instrument) {
          lab.setTool(instrument);
          e.stopImmediatePropagation();
          e.preventDefault();
        }
        return;
      }
      active = lab.tool;
      canvas.setPointerCapture(e.pointerId);
      send(
        active === "scalpel" ? "input:cutstart" : "input:pinchstart",
        detail(e),
      );
      e.stopImmediatePropagation();
      e.preventDefault();
    },
    true,
  );
  canvas.addEventListener("pointermove", (e) => {
    if (!(e.buttons & 2)) send("input:move", detail(e));
  });
  canvas.addEventListener("pointerup", (e) => {
    if (e.button === 2) {
      right = false;
      return;
    }
    if (!active) return;
    const tool = active;
    active = null;
    send(tool === "scalpel" ? "input:cutend" : "input:pinchend", detail(e));
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
  });
  const cancel = () => {
    active = null;
    right = false;
    lab.cancel();
  };
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("lostpointercapture", () => {
    if (active) cancel();
  });
  canvas.addEventListener("pointerleave", () => {
    if (!active && !lab.held) {
      lab.hover = null;
      bench.restTools();
    }
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      send("input:zoom", { delta: -Math.sign(e.deltaY) * 0.6 });
    },
    { passive: false },
  );
  window.addEventListener("blur", cancel);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancel();
  });
  window.addEventListener("keydown", (e) => {
    if (e.target.matches("input,select,textarea,[contenteditable=true]"))
      return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === "z") {
      e.preventDefault();
      lab.undo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (["v", "s", "h"].includes(key)) {
      lab.setTool({ v: "inspect", s: "scalpel", h: "hand" }[key]);
      return;
    }
    if (key === "escape") {
      cancel();
      return;
    }
    if (key === "r") {
      lab.reset();
      return;
    }
    if (key === "+" || key === "=") {
      e.preventDefault();
      bench.zoom(1);
      return;
    }
    if (key === "-") {
      bench.zoom(-1);
      return;
    }
    if (lab.held) {
      const moves = {
        arrowleft: [-1, 0, 0],
        arrowright: [1, 0, 0],
        arrowup: [0, 0, -1],
        arrowdown: [0, 0, 1],
        pageup: [0, 1, 0],
        pagedown: [0, -1, 0],
      };
      if (moves[key]) {
        e.preventDefault();
        lab.moveHeld(...moves[key]);
        return;
      }
      if (key === "q" || key === "e") {
        lab.rotateHeld(key === "q" ? -1 : 1);
        return;
      }
    } else if (e.target === bench.host) {
      const orbit = {
        arrowleft: [-0.12, 0],
        arrowright: [0.12, 0],
        arrowup: [0, -0.1],
        arrowdown: [0, 0.1],
      };
      if (orbit[key]) {
        e.preventDefault();
        bench.orbit(...orbit[key]);
      }
    }
  });
}
