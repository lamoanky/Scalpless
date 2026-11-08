# Frog lab implementation notes

## Baseline — 8 November 2026

Started on `viv-app` at `16fb4af`. Reviewed the existing tracked diff and the three untracked landing modules. The prior shared-frog landing feature is preserved separately in `6a9b38b`, including its required runtime loading poster. QA images and recordings remain in ignored `output/`. A binary diff and copies of the previously untracked files were saved in ignored `output/goal-baseline/` before editing.

Baseline checks all passed: 80 unit tests, production build, onion browser flow, natural and blue frog browser flows, landing handoff, and simulated hand-tracking integration. No known baseline test failures. These camera checks use simulated landmarks, not a person's webcam.

## Reflective environment

Compared the environment history at `197e4d3`, `0168bf8`, and current HEAD with the reference backdrop and existing onion/frog captures. The current shared `createLabEnvironment` already retains the original retouched blue grid, reflective floor, and raised white/cyan platform; the old platform differs only in its white pigment. The embedded landing was hiding that reflection and leaving its presentation floor active after entry.

The presentation backdrop and floor now blend out as the platform rises. The original laboratory reflection returns before tools become active. The actual frog meshes, physics, incision coverage and camera handoff are preserved. Native control targets remain 48 px; desktop controls sit closer to the lower edge.

Validation: production build and landing browser checks passed, including same-mesh continuity, final identity transform, shared reflection, reverse scroll, history, cut/lift/place/undo/reset, narrow viewport, and reduced motion.
