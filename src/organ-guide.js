// Educational copy is independent of rendering and of dissection operations.
// This is a gross-anatomy study display, not histology or a working microscope.
export const ORGAN_GUIDE = Object.freeze({
  heart: {
    name: "Heart", system: "Circulation", number: "01",
    description: "A frog's heart has two atria and one ventricle. It moves blood through the body and toward the lungs and skin for gas exchange.",
    observe: "Find the pointed ventricle below the two smaller atria.",
  },
  liver: {
    name: "Liver", system: "Digestion & metabolism", number: "02",
    description: "The large, three-lobed liver produces bile, processes nutrients and stores energy. It covers much of the digestive tract in this specimen.",
    observe: "Compare the three lobes and their broad, smooth surfaces.",
  },
  "lung-left": {
    name: "Left lung", system: "Respiration", number: "03",
    description: "This thin-walled sac exchanges oxygen and carbon dioxide with the blood. Adult frogs also exchange gases across their moist skin.",
    observe: "Notice the sac-like form. The fine internal partitions are simplified here.",
  },
  "lung-right": {
    name: "Right lung", system: "Respiration", number: "04",
    description: "The paired lungs sit beside the heart. Air is pushed into them by movements of the mouth floor, rather than by a mammalian diaphragm.",
    observe: "Compare its shape with the other lung. Left and right refer to the frog.",
  },
  stomach: {
    name: "Stomach", system: "Digestion", number: "05",
    description: "The muscular stomach stores food and begins breaking it down with acid and enzymes before passing it into the small intestine.",
    observe: "Follow the wider sac toward its narrower outlet.",
  },
  intestines: {
    name: "Intestines", system: "Digestion & absorption", number: "06",
    description: "The coiled small intestine continues digestion and absorbs nutrients. The wider large intestine leads toward the cloaca. This model combines them into one removable piece.",
    observe: "Trace the coils and look for the change in tube width.",
  },
});

export function heldOrgan(state) {
  return state.specimen === "frog" && state.held &&
    state.pieces?.[state.held]?.detached && Object.hasOwn(ORGAN_GUIDE, state.held)
    ? state.held : null;
}

// Completed collections live in controller snapshots, so undo/reset restore
// the previous study as well as the actual specimen.
export function studyOrgan(state) {
  return heldOrgan(state) ?? (state.specimen === "frog" &&
    state.pieces?.[state.lastCollected]?.collected &&
    Object.hasOwn(ORGAN_GUIDE, state.lastCollected) ? state.lastCollected : null);
}

// Presentation history follows controller-owned collections. Undo/cancel/reset
// prune entries without retaining a second copy of dissection state.
export function studyHistory(state, previous = []) {
  if (state.specimen !== "frog") return [];
  const held = heldOrgan(state);
  const eligible = id => Object.hasOwn(ORGAN_GUIDE, id) &&
    (id === held || state.pieces?.[id]?.collected);
  return [...new Set([...previous, ...Object.keys(state.pieces ?? {}), held])].filter(eligible);
}

// Only these coarse fields may leave the lab when a question is submitted.
// No positions, video, landmarks, URLs, identifiers or credentials are included.
export function teachingContext(state, study = null) {
  const frog = state.specimen === "frog";
  const name = id => frog ? (ORGAN_GUIDE[id]?.name ?? (id === "abdomen" ? "Abdominal panel" : null))
    : id === "section" ? "Onion section" : id === "epidermis" ? "Epidermis patch"
      : /^layer-\d+$/.test(id ?? "") ? `Fleshy layer ${id.split("-")[1]}` : null;
  return {
    specimen: frog ? "frog" : "onion",
    tool: ["inspect", "scalpel", "hand"].includes(state.tool) ? state.tool : "inspect",
    incision: state.cutOpen ? "open" : state.cut > 0 ? "partial" : "intact",
    held: name(state.held), selected: name(state.selected), study: name(study),
    removed: Object.entries(state.pieces ?? {}).filter(([, value]) => value.detached)
      .map(([id]) => name(id)).filter(Boolean).slice(0, 16),
    available: (state.available ?? []).map(part => name(part.id)).filter(Boolean).slice(0, 16),
  };
}
