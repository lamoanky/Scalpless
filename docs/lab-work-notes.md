# Frog lab implementation notes

## Baseline — 8 November 2026

Started on `viv-app` at `16fb4af`. Reviewed the existing tracked diff and the three untracked landing modules. The prior shared-frog landing feature is preserved separately in `6a9b38b`, including its required runtime loading poster. QA images and recordings remain in ignored `output/`. A binary diff and copies of the previously untracked files were saved in ignored `output/goal-baseline/` before editing.

Baseline checks all passed: 80 unit tests, production build, onion browser flow, natural and blue frog browser flows, landing handoff, and simulated hand-tracking integration. No known baseline test failures. These camera checks use simulated landmarks, not a person's webcam.

## Reflective environment

Compared the environment history at `197e4d3`, `0168bf8`, and current HEAD with the reference backdrop and existing onion/frog captures. The current shared `createLabEnvironment` already retains the original retouched blue grid, reflective floor, and raised white/cyan platform; the old platform differs only in its white pigment. The embedded landing was hiding that reflection and leaving its presentation floor active after entry.

The presentation backdrop and floor now blend out as the platform rises. The original laboratory reflection returns before tools become active. The actual frog meshes, physics, incision coverage and camera handoff are preserved. Native control targets remain 48 px; desktop controls sit closer to the lower edge.

Validation: production build and landing browser checks passed, including same-mesh continuity, final identity transform, shared reflection, reverse scroll, history, cut/lift/place/undo/reset, narrow viewport, and reduced motion.

## Organ study and compact controls

Added a small microscope-slide-inspired study for each of the six removable organ pieces. It is a separate scene with shared geometry/materials, drawn through the existing renderer into a scissored view. Study rotation changes only its clone; it does not add physics bodies, reparent live tissue, or modify the controller. It closes when the organ is released, cancelled, undone or reset. The movement button keeps the nine native movement controls available without leaving them expanded over a small-screen specimen.

Validation: 82 unit tests passed. Build, natural/blue study flows, 390/320 px layouts, all six natural-frog organ removals, and onion dissection passed. A test assertion was corrected to allow Rapier's float32 rounding of a held organ and continued settling of an already placed panel; no specimen behavior was changed. Sampled headless Chrome throughput was approximately 60 fps idle and 53 fps during frog manipulation, 60 fps for onion manipulation. These are local diagnostics, not a hardware guarantee.

## Teaching chat

Added explicit-send Gemini questions with bounded conversation history and an optional coarse lab-state payload. The browser key stays in a private in-memory session and goes only in Google's request header. The optional Node loopback proxy uses a server environment key, fixed upstream endpoint, origin checks, size/concurrency/rate limits and timeouts. Provider errors are not reflected or logged. No dependencies were added. The default model was checked against Google's current catalog; the model name remains configurable.

Validation: 92 unit tests passed, including real HTTP tests of the local proxy with a mocked upstream. The production build and browser teaching checks passed: no-key/no-auto-send, explicit connection setup, contextual follow-ups, opt-out, markup escaping, quota failure, cancellation/late replies, forgetting keys, keyboard isolation, specimen switching, 390/320 px and short landscape viewports. All provider requests used dummy test credentials and intercepted replies. Actual Gemini generation and account-specific access remain unverified until a real key is supplied.

The input/camera adapter, recognizers, LabController and physics are byte-for-byte unchanged from the preserved baseline. See the README's camera merge notes for DOM visibility coordination and the remaining real-camera checks.

## Final verification and artifacts

All checks pass: 92 unit tests, production build, onion workflow, natural and blue frog workflows (all six organs), landing continuity/history, organ studies, teaching chat, simulated camera integration, and the retained gesture sandbox. Targeted reruns cover the final fixes below. Latest sampled manipulation averages were approximately 59.5 fps for the recorded natural frog, 58.5 fps for blue, and 59.8 fps for onion.

- Updated the old icon-only assertion to accept native accessible names on the new text buttons. The initial bench still has no visible copy.
- Replaced onion placement checks based on group origins with precise world-space mesh bounds. A released, rotated patch can have an origin below the floor while its actual vertices rest above it. Observed captures show the patch seated on other tissue; no physics or interaction logic was changed. Bounds and rigid-body diagnostics are captured for future failures.
- Corrected transparent reflection sampling during the landing blend so uncovered texels do not darken the blue room. The extra presentation color work is skipped after entry.
- Verified that hiding the interface also hides the scissored organ view without changing dissection state, and that Escape acts on the study only when it has focus.
- Verified network failure, cancelled/late responses, context opt-out, route-based key lifetime, and short landscape layouts. API output is rendered as plain text.
- Restarted the old Vite dev/preview processes to pick up the proxy configuration. Both ports correctly returned the no-key 503 response through the real optional local proxy. The temporary no-key proxy was stopped after this check, so `npm run tutor` can be started normally with the user's configuration.

The development app remains available on port 5173, with production preview on 4173. Ignored artifacts include `output/frog-lab-final.png` (3200 × 2000), `output/frog-walkthrough.webm` (46 seconds), organ/chat desktop and mobile screenshots, and `output/final-checks/` logs. The initial final-batch log retains the obsolete assertion failure; the subsequent `onion-recheck.log` contains the passing corrected workflow. No QA images, videos, build output or credentials are committed.

Not externally verified: real Gemini generation/account access (no real key used) and recognition accuracy on a person's webcam. Model anatomy remains the existing simplified educational illustration and needs subject-matter validation before instructional deployment.

## Organ collection after drop

Frog organs now leave the bench, picking and physics when released; the last organ's information and independent 3D study remain open. A newly held organ replaces that study. Collection and the last-study ID belong to controller snapshots, so undo restores the organ and previous study, cancellation preserves the previous collection, and reset clears everything. The abdominal panel and onion retain physical placement. Contact-shadow proxies already respect source visibility, so removed organs leave no shadow behind.

This follow-up narrowly changes LabController release/state handling; the input/camera adapters and Rapier implementation remain untouched. Mouse release, native placement and `input:pinchend` use the same collection path. Tracking-loss release therefore also collects an organ and remains undoable. The README documents the added `collected` and `lastCollected` fields.

Validation: 93 unit tests, production build, full natural/blue frog dissection, onion interaction checks, organ-study checks at desktop/390/320 px, and mocked teaching-chat checks passed. Coverage includes all six organ removals, hidden meshes and absent bodies, liver access after release near its attachment, successive collections, restored study rendering after undo, cancellation and reset. Visually inspected `output/organ-collected-restored-natural.png`; the liver is absent from the bench while its readable study and 3D preview remain visible. No real API request or webcam was used.

## Clear liquid glass and reference typography

The final UI combines clear rounded glass with the reference's spaced uppercase Orbitron study typography. The upstream `liquid-glass-js` Container source and stylesheet are vendored unchanged at revision `78cb6ccb0b9987bb60a88b14ccbd13a9e6e8ab2a`. The fragment shader is extracted verbatim and uses its default optical settings with a clear 0.08 neutral tint. A small Three.js adapter supplies the live lab framebuffer, converts its orientation, and renders each surface at the upstream CSS-pixel density before compositing. This preserves the original optics without adding contexts, page snapshots or camera/key-field capture. Licenses and the font ship locally.

The organ study is transparent over the same glass and has an etched, slightly angled slide. No specimen, controller, input/camera adapter or physics logic changed. Dropped-organ collection, the persistent study and all native controls remain intact.

Validation: 93 unit tests and the production build passed, as did the original-shader/Retina/resize checks, natural and blue organ-study flows, mocked teaching chat, the full blue frog flow, onion interactions and landing continuity/history/reduced-motion checks. There were no GPU/runtime errors in the dedicated glass check. Final samples: approximately 57 fps in the 2× glass capture, 59 fps during frog manipulation and 59 fps during onion manipulation. The frog test's specimen-switch wait now waits for the new route and specimen rather than accepting the outgoing page's ready flag; failure diagnostics also preserve the original error during navigation.

Reviewed screenshots are in ignored `output/liquid-glass-desktop.png`, `liquid-glass-lung.png`, `liquid-glass-tools.png` and the 390/320 px captures. No generated captures, build output or credentials are committed.

## Shared detailed blue and copper frog

Started from a clean `viv-app` tree at `5677035`. The blue specimen now uses the copper frog's exact body and organ geometry, UVs, normals, incision and collision shapes. Its 2K atlas recolors the original exterior markings into cyan/blue while retaining their detail; both colors share the same material response and lab lighting. Removed the separate faceted blue mesh and its stretched anatomy. Controller, input/camera adapters and physics implementation are unchanged.

The landing's central frog remains the actual interactive specimen. A presentation-only joint blend crouches the shared detailed limbs, keeps skin texture coordinates fixed, and restores the original lab vertices exactly before interaction. Decorative studies also clone this definition. The existing runtime loading poster was regenerated from the updated scene without interface icons; QA screenshots and recordings remain ignored. The underlying model is still the existing simplified educational frog, not a scan or a newly validated anatomical model.

Validation: 95 unit tests, production build, exact natural/blue mesh and collider comparison (76,005 vertices and 81 collider shapes), full natural/blue dissection, organ collection/study persistence and narrow layouts, and the landing continuity/history/reduced-motion checks passed. The first landing run lost its Chrome process; a fresh complete run passed without app errors. Visual review covered both intact and opened blue specimens and the crouched landing. The final recorded scroll transition averaged approximately 57 fps; lab manipulation samples were approximately 54 fps for blue and 59 fps for copper. These local headless-browser measurements are diagnostics, not a hardware guarantee.

Artifacts: `output/frog-matched-blue.png`, `output/frog-matched-open-blue.png`, matching copper views, and the landing screenshots/video from `npm run capture:landing`. No real API calls or webcam capture were used.

## Automatic server chat and matching typography

Removed the Gemini connection menu, browser key/model inputs and direct-provider branch from the teaching session. Questions now go to the existing same-origin `/api/tutor` endpoint without a setup step, including after specimen-route changes. Opening the panel and selecting a suggested question still send nothing. The key and model remain server configuration; `.env.local` was not read or changed. The existing local tutor was already listening on port 8787.

The teaching panel now shares the organ study's locally bundled Orbitron font, uppercase styling, heading weight and tracking. Message text, question input, buttons and supporting labels use the same visual treatment with smaller-screen adjustments. The original liquid-glass shader, specimen interactions and camera adapters are unchanged. Updated README setup instructions and removed references to the deleted browser connection.

Validation: baseline and final 95 unit tests passed, as did the production build and updated teaching browser checks. Coverage includes automatic server submission with no credential fields or direct Google requests, context/history and opt-out, organ-study/input isolation, cancellation and retry, unconfigured/rate-limited/offline errors, escaped answer text, frog/onion routes, 390/320 px widths and short landscape. Desktop/mobile screenshots were visually inspected in ignored `output/teaching-answer.png`, `teaching-mobile-320.png` and `teaching-landscape.png`. Responses were mocked; no live Gemini request or real-key validation was performed.

## Label-only organ history and automatic explanations

Removed the requested chat title, introductory sentence, initial ready message and teacher disclaimer. Organ studies now contain only the organ label, live 3D preview and icon controls. Their label strip is a native horizontal scroll-snap history. Wheel scrolling, label swiping, previous/next buttons and Page Up/Down select earlier held/collected organs without changing controller or physics state. History is pruned from authoritative attachment/collection state on undo, cancellation and reset. Minimizing and restoring retain the selected history entry.

Opening a study opens chat alongside it, immediately shows authored organ information, and requests an explanation from the existing server connection. Revisits reuse the displayed explanation; unavailable-service errors retain the authored information. The coarse teaching context now distinguishes the reviewed `study` from the physically held/selected part. Late responses are ignored after study changes, close, cancellation or reset. Chat does not take focus during a dissection drag. Desktop panels sit beside one another; narrow layouts stack them and reserve space for placement/tool controls, including while the study is minimized.

The main implementation was committed concurrently as `9058706` during verification; that commit was preserved. Follow-up changes document the behavior and fix hidden-scroller restoration and mobile control clearance. No camera/input adapter, specimen geometry, controller or physics implementation changed. Interaction/capture scripts mock the tutor endpoint because organ opening now deliberately sends requests; no real Gemini calls or `.env.local` access were used for validation.

Validation: 96 unit tests, production build, teaching browser checks, natural/blue organ-study history and undo/reset, desktop/390/320 px layouts, short landscape, glass rendering and the full six-organ blue frog flow passed. The first narrow-layout run found chat overlapping placement controls; the layout was corrected and rechecked. Rapid-switch/reset tests verify stale-answer cancellation and offline reference fallback. Sampled blue manipulation throughput was approximately 58 fps; the 2× glass check with both panels open averaged approximately 43 fps, without GPU/runtime errors. Screenshots remain in ignored `output/organ-study-*.png`, `output/teaching-*.png` and `output/liquid-glass-*.png`.

## Reference glass chatbot

Restyled the chat to match the supplied blue-glass image: rounded double rim, soft blue frost, spaced Orbitron label, header rule, single pill-shaped question selector with a blue orb/chevron, glossy checked state, inset text field, circular blue send button and lower-right Clear action. The selector is a native details dropdown; choosing an idea fills the composer and closes the dropdown without sending. The native checkbox remains the accessible interactive control under its decorative surface. Styles are isolated in `src/teaching-style.css`; the original liquid-glass shader and server transport are unchanged.

Widened the desktop chat to 400 px and adjusted the adjacent organ study spacing. Narrow layouts keep the existing tool/placement clearance. On short screens, only conversation/composer content scrolls, keeping the decorated outer frame stationary. Automatic organ explanations, cached revisits, history browsing and reset/undo behavior are preserved.

Validation: 96 unit tests, production build, teaching and natural/blue organ-study browser checks passed. The dropdown, context checkbox, no-auto-send behavior, mocked server errors/cancellation and mobile/short layouts were exercised. Fixed a decorative-checkmark pointer interception found by the browser check. Visually reviewed the final desktop, 320/390 px and landscape captures, including a 2× display capture with no runtime/GPU errors. No real model requests or `.env.local` access were needed. Ignored artifacts include `output/chat-reference-retina.png`, `chat-reference-desktop.png`, `chat-reference-study.png`, `chat-reference-mobile.png` and the final `output/teaching-landscape.png`.

## Concise teaching replies and restored glossy glass

The server system instruction and automatic organ prompt now request 1–3 short sentences, at most 45 words, without headings, lists or filler. Responses are not mechanically truncated. The local tutor process was restarted to load the instruction. Following the updated visual direction, restored the existing shiny liquid-glass controls, bright rims and translucent surfaces; the temporary flat-button styling was removed. The original shader and lab interactions remain unchanged.

Validation: all 96 unit tests, production build and teaching browser checks passed. Visually reviewed the restored desktop panel and 320 px layout. Browser requests were mocked; live Gemini adherence was not tested. The separately staged frog model was preserved and excluded from this change. No credentials or generated captures are included.
