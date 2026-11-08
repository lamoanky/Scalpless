import "./hand-tracking.css";
import { OnionHandInput } from "./onion-hand-input.js";
import { HandCameraSession } from "./hand-camera-session.js";

const edges = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
];

export function installHandTracking(bench, input) {
  const root = bench.host.closest(".bench");
  const launcher = document.createElement("button");
  launcher.id = "hand-tracking-open";
  launcher.className = "icon-button hand-tracking-launch";
  launcher.setAttribute("aria-label", "Hand tracking camera");
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("aria-controls", "hand-tracking-panel");
  launcher.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h12v14H4V5Zm12 5 5-3v10l-5-3M8 9v6m4-6v6"/></svg>';
  const panel = document.createElement("section");
  panel.id = "hand-tracking-panel";
  panel.className = "hand-tracking-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Hand tracking setup");
  panel.innerHTML = `
    <div class="tracking-heading"><h2>Hand controls</h2><button id="tracking-close" class="icon-button" aria-label="Close hand tracking setup"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></div>
    <div class="tracking-feed"><div class="tracking-media"><video id="tracking-video" autoplay muted playsinline></video><canvas id="tracking-overlay" width="640" height="480" aria-hidden="true"></canvas></div><span id="tracking-placeholder">Your camera preview</span></div>
    <p id="tracking-status" role="status">Camera off · mouse and keyboard ready.</p>
    <button id="tracking-toggle" class="tracking-action" aria-label="Start camera">Start camera</button>
    <p class="tracking-instructions">Pinch to grab and peel. Extend only your index for 0.3 seconds, then trace the highlighted seam to cut. Two open hands zoom.</p>
    <label>Camera<select id="tracking-device"><option value="">Default camera</option></select></label>
    <label>Camera rotation<select id="tracking-rotation"><option value="0">0°</option><option value="1">90°</option><option value="2">180°</option><option value="3">270°</option></select></label>
    <label>Movement sensitivity <output id="tracking-gain-value">1.50×</output><input id="tracking-gain" type="range" min="0.75" max="2.5" step="0.05" value="1.5"></label>
    <p class="tracking-note">Use the lightbulb for seam hints. Mouse, keyboard, or Esc returns control to you. Video is processed locally and is not recorded.</p>`;
  const cursor = document.createElement("div");
  cursor.className = "hand-cursor";
  cursor.hidden = true;
  cursor.setAttribute("aria-hidden", "true");
  bench.host.append(cursor);
  root.append(launcher, panel);
  const $ = (id) => panel.querySelector(`#${id}`);
  const video = $("tracking-video");
  // Set the properties too: dynamically inserted media must be muted before play().
  video.muted = true;
  const overlay = $("tracking-overlay"),
    ctx = overlay.getContext("2d");
  const adapter = new OnionHandInput((type, detail) => {
    window.dispatchEvent(new CustomEvent(type, { detail }));
  });
  let lastState = { hands: 0, mode: "idle" };
  const status = (text) => {
    if ($("tracking-status").textContent !== text)
      $("tracking-status").textContent = text;
  };
  const session = new HandCameraSession({
    video,
    input: adapter,
    loadModel: async () =>
      (await import("./hand-tracking-model.js")).loadHandTrackingModel(),
    requestCamera: (constraints) => {
      if (!isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new DOMException("Use localhost or HTTPS", "SecurityError");
      return navigator.mediaDevices.getUserMedia(constraints);
    },
    onActive(active) {
      input.setSource(active ? "webcam" : "pointer");
      launcher.classList.toggle("tracking-live", active);
      launcher.setAttribute(
        "aria-label",
        active ? "Hand tracking camera active" : "Hand tracking camera",
      );
      $("tracking-placeholder").hidden = active;
      $("tracking-device").disabled = active;
      if (active) refreshCameras();
    },
    onStatus(text, phase) {
      status(text);
      const textLabel =
        phase === "running"
          ? "Stop camera"
          : ["loading", "permission"].includes(phase)
            ? "Cancel camera startup"
            : "Start camera";
      $("tracking-toggle").textContent = textLabel;
      $("tracking-toggle").setAttribute("aria-label", textLabel);
      panel.dataset.phase = phase;
    },
    onFrame(state, result) {
      lastState = state;
      cursor.hidden = !state.point || !session.running;
      if (state.point) {
        cursor.style.left = `${state.point.x * 100}%`;
        cursor.style.top = `${state.point.y * 100}%`;
        cursor.dataset.mode = state.mode;
        cursor.style.setProperty("--hold", state.hold || 0);
      }
      if (session.running)
        status(
          !state.hands
            ? "Camera on · hold a hand in view."
            : state.mode === "hand"
              ? "Pinch held · move to peel or carry; open to release."
              : state.mode === "scalpel"
                ? "Scalpel active · trace the seam to cut."
                : state.hands === 2
                  ? "Two hands · move apart or together to zoom."
                  : state.hold
                    ? "Hold the index-only pose to activate the scalpel…"
                    : "Hand detected · pinch to grab or point to cut.",
        );
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      if (panel.hidden) return;
      (result.landmarks || []).forEach((hand, index) => {
        ctx.strokeStyle = index ? "#fbc8ea" : "#80e9ff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (const [a, b] of edges) {
          ctx.moveTo(hand[a].x * 640, hand[a].y * 480);
          ctx.lineTo(hand[b].x * 640, hand[b].y * 480);
        }
        ctx.stroke();
        for (const i of [4, 8]) {
          ctx.beginPath();
          ctx.arc(hand[i].x * 640, hand[i].y * 480, 7, 0, Math.PI * 2);
          ctx.fillStyle = "white";
          ctx.fill();
        }
      });
    },
  });
  async function refreshCameras() {
    try {
      const selected = $("tracking-device").value;
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === "videoinput",
      );
      $("tracking-device").replaceChildren(
        new Option("Default camera", ""),
        ...devices.map(
          (d, i) => new Option(d.label || `Camera ${i + 1}`, d.deviceId),
        ),
      );
      $("tracking-device").value = selected;
    } catch {
      /* The default camera remains available without enumeration. */
    }
  }
  function setPanel(open) {
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    if (open) $("tracking-toggle").focus();
    else launcher.focus();
  }
  launcher.onclick = () => setPanel(panel.hidden);
  $("tracking-close").onclick = () => setPanel(false);
  $("tracking-toggle").onclick = () => {
    if (session.running || session.pending) session.stop();
    else session.start($("tracking-device").value);
  };
  $("tracking-gain").oninput = (event) => {
    adapter.reset();
    adapter.movementSensitivity = Number(event.target.value);
    $("tracking-gain-value").textContent =
      `${adapter.movementSensitivity.toFixed(2)}×`;
  };
  $("tracking-rotation").onchange = (event) => {
    adapter.reset();
    adapter.rotation = Number(event.target.value);
    panel.querySelector(".tracking-media").style.transform =
      `scaleX(-1) rotate(${adapter.rotation * 90}deg) scale(${adapter.rotation % 2 ? 0.75 : 1})`;
  };
  const stopForPointer = () =>
    session.stop("Hand controls stopped · mouse and keyboard ready.");
  input.onTakeover(stopForPointer);
  root.addEventListener(
    "pointerdown",
    (event) => {
      if (session.pending && event.target.closest(".scene")) stopForPointer();
    },
    true,
  );
  // Explicit bench actions take ownership before changing controller state.
  root.addEventListener(
    "click",
    (event) => {
      if (
        (session.running || session.pending) &&
        !event.target.closest("#hints") &&
        event.target.closest(
          ".controls-area button,.context-controls button,.manipulation-pad button",
        )
      )
        stopForPointer();
    },
    true,
  );
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && (session.running || session.pending)) session.stop();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (session.running || session.pending) session.stop();
      if (!panel.hidden) setPanel(false);
    }
  });
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) session.stop();
    else session.dispose();
  });
  return {
    stop: () => session.stop(),
    getDebug: () => ({
      running: session.running,
      pending: session.pending,
      source: input.source,
      hands: lastState.hands,
      mode: lastState.mode,
      point: lastState.point || null,
      liveTracks:
        session.stream?.getTracks().filter((t) => t.readyState === "live")
          .length || 0,
    }),
  };
}
