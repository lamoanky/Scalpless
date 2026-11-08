// Guided dissection lesson. Steps are derived from lab state on every change,
// so undo, reset and free exploration all keep the guidance truthful.
// Each check also passes once a later milestone is reached, so switching
// tools afterwards never sends the learner backwards.

const piece = (state, id) => state.pieces?.[id] ?? {};

export const LESSON_STEPS = [
  {
    id: "scalpel",
    title: "Pick up the scalpel",
    detail: "Press S, or choose the scalpel in the toolbar.",
    gesture: "Stick out just your index finger and hold it still for a moment. Your hand becomes the scalpel.",
    target: '[data-tool="scalpel"]',
    done: (s) => s.tool === "scalpel" || s.cut > 0,
  },
  {
    id: "incision",
    title: "Cut along the seam",
    detail: (s) =>
      `Drag along the pale line on the onion. It turns gold where you have cut. ${Math.round(s.cut * 100)}% done.`,
    gesture: (s) =>
      `Keep your index finger out and trace the pale line. Open your hand to lift the blade. ${Math.round(s.cut * 100)}% done.`,
    target: null,
    done: (s) => s.cutOpen,
  },
  {
    id: "forceps",
    title: "Switch to forceps",
    detail: "Press H, or choose the forceps in the toolbar.",
    gesture: "Pinch your thumb and index finger together. A pinch is the forceps.",
    target: '[data-tool="hand"]',
    done: (s) => s.tool === "hand" || piece(s, "section").detached,
  },
  {
    id: "section",
    title: "Lift the cut section away",
    detail: "Drag the wedge you cut off the onion and let go on the bench. This exposes the layers inside.",
    gesture: "Pinch the wedge you cut, move your hand to carry it off the onion, then open your hand to drop it.",
    target: null,
    done: (s) => s.available.some((p) => p.id === "layer-0"),
  },
  {
    id: "layer-0",
    title: "Peel the outer layer",
    detail: "Grab the exposed edge of the first fleshy layer and pull it all the way off.",
    gesture: "Pinch the exposed edge of the first fleshy layer and pull your hand away until it comes off. Open your hand to drop it.",
    target: null,
    done: (s) => piece(s, "layer-0").detached,
  },
  {
    id: "layer-1",
    title: "Peel the next layer",
    detail: "Same again. The thin skin on its inner face is the epidermis you will look at.",
    gesture: "Same again: pinch the edge and pull away. The thin skin on its inner face is the epidermis.",
    target: null,
    done: (s) => piece(s, "layer-1").detached,
  },
  {
    id: "epidermis",
    title: "Peel off the epidermis",
    detail: "It is the glowing film on the layer you just peeled. Drag from the pulsing orange ring a short way and let go. Or press Grasp & peel.",
    gesture: "It is the glowing film on the layer you just peeled. Pinch near the pulsing orange ring, pull a short way, then open your hand.",
    target: null,
    done: (s) => piece(s, "epidermis").detached,
  },
  {
    id: "microscope",
    title: "Inspect it under the microscope",
    detail: "Press M, or click the microscope button. Try 400× and the iodine stain.",
    gesture: "Press M, or click the microscope button. Try 400× and the iodine stain.",
    target: "#microscope-action",
    done: (s, inspected) => inspected.has("epidermis"),
  },
];

const text = (value, state) => (typeof value === "function" ? value(state) : value);

// mode is "webcam" or "mouse": the primary line follows the active input, and
// mouse users also see the gesture alternative.
export function lessonProgress(state, inspected = new Set(), mode = "mouse") {
  const index = LESSON_STEPS.findIndex((step) => !step.done(state, inspected));
  const current = index === -1 ? LESSON_STEPS.length : index;
  return {
    current,
    total: LESSON_STEPS.length,
    complete: index === -1,
    steps: LESSON_STEPS.map((step, i) => ({
      id: step.id,
      title: step.title,
      detail: text(mode === "webcam" ? step.gesture : step.detail, state),
      alternative:
        mode === "webcam" || step.id === "microscope"
          ? null
          : text(step.gesture, state),
      target: step.target,
      done: i < current,
    })),
  };
}

const STORAGE_KEY = "scalpless.lesson.hidden";
const storage = {
  get() { try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; } },
  set(hidden) { try { localStorage.setItem(STORAGE_KEY, hidden ? "1" : "0"); } catch { /* private mode */ } },
};

export function installLesson({ lab, toggle, announce, restart, inputMode, inputHost }) {
  const card = document.createElement("section");
  card.className = "lesson";
  card.id = "lesson";
  card.setAttribute("aria-label", "Guided lesson");
  card.innerHTML = `
    <header>
      <span class="lesson-count"></span>
      <button type="button" class="lesson-close" aria-label="Hide guided lesson"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    </header>
    <h2 class="lesson-title"></h2>
    <p class="lesson-detail"></p>
    <p class="lesson-gesture"><span>With webcam</span> <span class="lesson-gesture-text"></span></p>
    <ol class="lesson-steps" aria-hidden="true"></ol>
    <button type="button" class="lesson-restart" hidden>Start over</button>`;
  document.querySelector("#bench").append(card);
  const inspected = new Set();
  let hidden = storage.get(), lastStep = -1, lastTarget = null;

  const setHidden = (value) => {
    hidden = value;
    storage.set(hidden);
    render(lab.getState());
  };
  card.querySelector(".lesson-close").onclick = () => { setHidden(true); toggle.focus(); };
  toggle.onclick = () => setHidden(!hidden);
  card.querySelector(".lesson-restart").onclick = () => {
    inspected.clear();
    restart();
  };
  window.addEventListener("microscope:open", (e) => {
    inspected.add(e.detail.id);
    render(lab.getState());
  });

  function render(state) {
    const progress = lessonProgress(state, inspected, inputMode());
    card.hidden = hidden;
    toggle.setAttribute("aria-pressed", String(!hidden));
    const step = progress.steps[progress.current];
    card.classList.toggle("is-complete", progress.complete);
    card.querySelector(".lesson-count").textContent = progress.complete
      ? "Lesson complete"
      : `Step ${progress.current + 1} of ${progress.total}`;
    card.querySelector(".lesson-title").textContent = progress.complete
      ? "You dissected an onion"
      : step.title;
    card.querySelector(".lesson-detail").textContent = progress.complete
      ? "Those brick-shaped cells are the classic onion epidermis. Explore freely, or start over."
      : step.detail;
    card.querySelector(".lesson-gesture").hidden = progress.complete || !step.alternative;
    card.querySelector(".lesson-gesture-text").textContent = step?.alternative ?? "";
    card.querySelector(".lesson-restart").hidden = !progress.complete;
    card.querySelector(".lesson-steps").replaceChildren(
      ...progress.steps.map((s, i) => {
        const li = document.createElement("li");
        if (s.done) li.className = "is-done";
        if (i === progress.current) li.className = "is-current";
        return li;
      }),
    );
    // Pulse the control the current step needs.
    const target = !hidden && step?.target ? document.querySelector(step.target) : null;
    if (target !== lastTarget) {
      lastTarget?.classList.remove("lesson-target");
      target?.classList.add("lesson-target");
      lastTarget = target;
    }
    if (progress.current !== lastStep) {
      if (lastStep !== -1 && progress.current > lastStep && !hidden) {
        card.classList.remove("is-advanced");
        void card.offsetWidth;
        card.classList.add("is-advanced");
        announce(progress.complete ? "Lesson complete." : `Step ${progress.current + 1}: ${step.title}.`);
      }
      lastStep = progress.current;
    }
  }
  lab.subscribe(render);
  // Switch wording when the webcam turns on or off.
  new MutationObserver(() => render(lab.getState())).observe(inputHost, {
    attributes: true,
    attributeFilter: ["data-input"],
  });
  render(lab.getState());
  return { render: () => render(lab.getState()) };
}
