# Scalpless

A scroll-driven landing page and hands-on 3D onion and frog dissection bench. The specimen, platform and instruments are rendered meshes, with direct surface contact, constrained peeling, and Rapier collisions for released tissue. Built with Vite, vanilla JavaScript and Three.js.

## Run

Requires Node.js 22.12+ or 24+ and a WebGL-capable browser.

```sh
npm install
npm run dev -- --port 5173
```

Open http://127.0.0.1:5173 for the landing page. Scroll to enter the frog lab, or use the arrow at the upper right. The direct frog route is http://127.0.0.1:5173/lab.html?specimen=frog; `/lab.html` still opens the onion. Keep the terminal running while using the app. The production build includes both entry pages.

## Landing page

The text-free opening is a live Three.js illustration: a seated blue spotted frog, five glass anatomy-study displays, light rings and a frosted reflective floor. All geometry and graphic textures are authored locally. The supplied reference guides the composition; this is a procedural interpretation, not the original image or an imported frog model. The display studies are decorative, not additional available specimens or a functioning microscope.

The opening and bench share one renderer and the same blue frog meshes. Scroll rotates the specimen belly-up, unfolds its limbs at the shoulders and hips, and brings the platform beneath it. The camera eases into the working view. There is no model swap or crossfade. At the end, the presentation transform becomes exactly the identity, physics resumes, and mouse/keyboard input passes to the existing lab controller. The blue specimen has the same supported abdominal incision, removable panel, organs, undo and reset. The copper specimen remains available at `/lab.html?specimen=frog`; the blue variant is `/lab.html?specimen=frog&appearance=blue`.

The icon-only entry controls have accessible names and visible keyboard focus. Reduced motion removes camera travel and rotation. Before entry, reverse scrolling restores the opening. Browser Back returns to the opening; `#lab` reloads into the lab, and the top-center return arrow starts a fresh visit. The lab loads inside a same-origin iframe, and its canvas renders both the opening and interactive bench. Tool input and physics stay locked until the frog has landed. Presentation messages are accepted only from the same-origin parent. Camera access remains opt-in through the lab's existing camera button.

`public/art/frog-landing-poster.webp` is a render of the opening scene used during loading and if WebGL/HDRI loading fails. The direct-lab arrow remains usable. Legacy onion landing artwork remains in `public/art/` but is no longer used by the landing page.

## Working at the bench

The bench starts with icons only, with a glass toolbar at the lower left. Opening the webcam button reveals an optional hand-control setup panel. Every control retains an accessible name and keyboard operation; status messages are announced to screen readers. The instructions below refer to those accessible names.

1. **Inspect (V):** left drag to orbit. Right drag or the arrow keys with the scene focused also orbit. Scroll or use **+/−** to zoom. The magnifier opens camera controls for zoom, orbit and return to the working view.
2. **Scalpel (S):** drag along the supported longitudinal seam on the front of the intact onion. The lightbulb reveals its guide. Short strokes accumulate, and releasing preserves partial progress. At least 90% of the seam must be covered; endpoint clicks and off-surface movements cannot substitute for tracing it. **Trace supported seam** is the keyboard-accessible equivalent.
3. **Forceps (H):** grasp the freed section and drag it away. Release to let it settle. The layers icon opens a tissue picker; choose a tissue icon, then use the lift arrow, directional pad and place icon. Their accessible names are **Lift selected piece** and **Place on bench**.
4. **Peel:** grasp the exposed edge of the outer skin and pull. Moving back relaxes the bend. Releasing a partial peel leaves it attached; grasp again to continue. Once detached, carry and place it. Fleshy layers use the same interaction. A thin epidermis patch becomes available on the first removed fleshy layer.
5. **While holding:** arrows move horizontally, **Page Up / Page Down** lift and lower, **Q / E** rotate a detached piece. The on-screen pad provides the same actions. **Escape** cancels the current manipulation.
6. **Undo (⌘/Ctrl Z)** restores the previous completed stroke or manipulation. **Reset (R)** restores the intact specimen, camera, tools and collection area.

There are no timing challenges. Controls have 48 px minimum targets, visible focus, native buttons, accessible names and brief screen-reader announcements. Reduced-motion preferences disable camera inertia, interface transitions and animated relaxation of released attached tissue. Direct manipulation and gravitational settling remain available.

## Frog dissection

Scroll through the opening scene, choose the frog icon at the upper left of the bench, or open http://127.0.0.1:5173/lab.html?specimen=frog. Trace the hinted oval incision around the abdominal panel, lift it with forceps, then inspect and remove the heart, liver, two lungs, stomach and intestines. Move the liver aside to reach the deeper digestive organs. Mouse, keyboard, and the existing webcam adapter share the same lab actions. The onion icon returns to the onion bench; switching specimens starts a fresh session.

The custom frog has continuous tapered limbs, webbed feet, gold irises, authored 2K skin/tissue maps and irregular organ lobes. Natural ventral skin is the default; the layers button beside the specimen selector reveals a blue translucent anatomy view. This view does not change dissection progress, and reset restores natural skin. Organs remain pre-separated rigid pieces, and the abdominal panel combines skin and muscle. Connective-tissue cutting and detailed anatomical validation are not included. See [frog model resources and implementation notes](docs/frog-model.md) for the visual reference, supported workflow and import requirements for an exact licensed replacement.

The blue frog now uses exactly the same detailed geometry, UVs, normals, incision, organ positions and collision shapes as the copper frog. Its 2K exterior atlas is a blue recoloring of the same markings; skin grain, moist finish, eyes and internal tissues share the original material settings. `python3 scripts/prepare-blue-frog.py` regenerates that atlas. Both variants use the same lighting. Landing poses blend the shared detailed limbs into a crouch and restore the original lab vertices exactly; the skin coordinates stay fixed to the tissue. Decorative landing studies also come from this specimen definition.

`npm run test:frog` checks the frog workflow; `npm run capture:frog` also records a walkthrough.

## Guided lesson, microscope and cut feedback (onion)

- **Guided lesson:** an eight-step card (bottom left; toggle with the book icon) walks from picking up the scalpel to inspecting the epidermis. Steps derive from lab state, so undo moves the lesson back and switching tools never does. The control a step needs pulses. With the webcam active, each step leads with the hand gesture; with the mouse, a "With webcam" line shows the gesture alternative. Hiding the card is remembered per browser.
- **Seam outline:** with the scalpel selected, the incision path shows faintly; cut stretches glow gold, fresh cuts flash, and completing the incision lights the whole outline. Fast strokes are sub-sampled between pointer events, each sample still ray-tested against the seam.
- **Epidermis:** once fleshy layer 1 is off, its membrane glows and its grip ring pulses. Grabbing anywhere on that layer takes the membrane; a short pull (about 3 cm) peels it, and releasing past 60% finishes the peel.
- **Microscope (M):** the microscope button inspects the held or last picked-up onion piece in a procedural light-microscope view: 40×/100×/400×, unstained, iodine or methylene blue, focus, drag to pan and a live scale bar. Each tissue (epidermis, fleshy scale, cut section, core) has its own cell structure and caption.

## Webcam hand controls

Open the lab, click the **camera icon at the upper right**, then **Start camera** and allow your browser to use it. This requests video only. The landing page never starts the camera. Both labs load the pinned MediaPipe runtime, WASM and hand model from local app assets; frames stay in the browser and are not recorded or uploaded.

- The scalpel snaps to seam points within about 32 px, and a pinch snaps to the nearest grasp point within about 40 px, so tracing and pickup tolerate tracking jitter.
- Move your index fingertip to position the cursor. The view is mirrored horizontally. Movement sensitivity defaults to 1.50×; reduce it for finer tracing.
- Extend only your index, with the other fingers curled, for 0.3 seconds to activate the scalpel. Trace the supported seam. The lightbulb shows its position and remains usable during tracking. Partial strokes accumulate exactly as with the mouse.
- Pinch thumb and index together to grasp the freed section or an exposed layer edge. Keep pinching as you move to carry or peel; move back to relax a peel, and open the pinch to release. A held pinch also picks up tissue when its cursor reaches the surface.
- Show two unpinched hands and move them apart/together to zoom. A pinch takes priority over zoom.
- **Stop camera**, **Escape**, a mouse click in the scene, or a keyboard/tool operation returns to mouse control. Merely moving the mouse does not interrupt a gesture. Closing the setup panel keeps tracking active; the camera icon shows a green indicator.

Choose a connected camera before starting. Camera rotation supports sideways mounts. Tracking loss, stalled video, disconnecting the camera, leaving the page or hiding the tab ends active cuts and releases held tissue. Cancelling startup also stops any camera stream that arrives after a delayed permission response. Camera denial leaves the mouse controls available and offers a retry.

The integration reuses `GestureTracker`, stable hand assignment and the branch's visibility guard. It maps the tracked fingertip/pinch into the active specimen canvas, then uses the existing ray contact, cut coverage, constrained peeling and release physics. It does not apply the practice sandbox's unrelated world coordinates to the onion. Height and full rigged-hand visualization remain available in the retained sandbox rather than driving this screen-based bench adapter. Camera pose accuracy still depends on lighting, visibility and the actual webcam.

The original gesture sandbox is preserved at `npm run gesture:sandbox` → http://localhost:3000; its detailed setup and rigged-hand behavior are in [README-3D.md](README-3D.md). It is separate from the Vite landing/lab routes and retains its original CDN dependencies.

## Architecture

- `src/specimens/onion.js`: replaceable procedural specimen definition, closed shells, capped faces, materials, cut region, grasp points, membrane and constrained deformation.
- `src/specimens/frog.js`: custom ventral frog, abdominal panel, six organ pieces, access rules and collision components.
- `src/lab-controller.js`: attachment/separation state, seam coverage, manipulation, completed-operation snapshots, undo/reset and observable state.
- `src/input.js`: mouse/keyboard adapter, input ownership and the existing six `input:*` event listeners.
- `src/onion-hand-input.js`: gesture recognition adapter using the merged branch's `gestures.js`, `hand-pose.js` and `tracking-quality.js`.
- `src/hand-camera-session.js`, `src/hand-tracking.js`: cancellable webcam/model lifetime, opt-in setup, preview, cursor and failure recovery.
- `src/hand-tracking-model.js`: lazy, local MediaPipe loading with GPU/CPU fallback. No wand implementation.
- `src/physics.js`: Rapier world, stationary specimen colliders, compound colliders for thin shells, held kinematic bodies, released dynamic bodies, platform and bench contacts.
- `src/scene.js`: HDRI lighting, physical instruments and user-controlled camera.
- `src/render-pipeline.js`: subtle highlight bloom, SMAA antialiasing, ACES output for the 3D scene, and a final composite over the original-image backdrop.
- `src/contact-shadows.js`: live height-weighted, blurred contact occlusion from deformed specimen meshes.
- `src/lab-environment.js`: transparent reflection/shadow catchers and a two-tier white/cyan platform; shared platform bounds keep rendering and collisions aligned.
- `src/domain.js`: cut coverage and snapshot history independent of rendering.
- `src/main.js`, `lab.html`, `src/style.css`: bench bootstrap, render loop and compact accessible controls.
- `src/landing.js`, `src/landing-motion.js`, `index.html`, `src/landing.css`: reversible scroll presentation, input handoff and responsive icon controls.
- `src/landing-scene.js`, `src/landing-frog.js`: shared blue exterior, shoulder/hip posing, glass displays, procedural textures and reflected floor.
- `src/landing-presentation.js`: validates parent messages, applies scroll presentation and releases input/physics after the final pose. Controller actions and camera controls remain unchanged after entry.
- `src/organ-slide.js`, `src/organ-guide.js`: independent held/collected-organ study view and concise anatomy/context metadata.
- `src/teaching-chat.js`, `src/teaching-session.js`, `src/teaching-request.js`: chat UI, cancellable same-origin requests and bounded Gemini transport.
- `server/tutor.mjs`: optional loopback teaching proxy; no client credentials or camera data are accepted.

The specimen stays stationary during cutting. Attached tissue is deformed around its basal attachment with bounded displacement; separation progress is stored separately from its current bend. A detached shell retains its shape and becomes a rigid body. Collision geometry approximates its volume using smaller convex patches to preserve concavity. Held pieces follow constrained targets; release transfers them back to simulation with restrained motion.

The original supplied design is preserved in `design/reference.png`. Runtime geometry is generated in code. The skin uses authored 4096 × 2048 color, normal and roughness maps; the cut faces use 2048 × 2048 color and normal maps. These synthesize fine fibers and wrinkles in the reference palette rather than claiming to recover photographic detail from the small reference. The specimen and tools remain live 3D objects. Educational UI is confined to the optional teaching panel and the small held-organ study slide.

## Organ study slides

Picking up a detached frog heart, liver, lung, stomach or intestine opens a small glass study slide. It shows only the organ label and actual 3D geometry. The teaching chat opens alongside it and begins explaining the organ automatically. Drag the study view or focus it and use the arrow keys to rotate the study; Home restores its angle. This is a gross-anatomy 3D view, not microscopic tissue imagery.

The live organ stays in your forceps until you drop it or use Place on bench. Releasing an organ removes it from the bench, picking and physics, while its rotatable study and chat stay open. Picking up another organ adds it to the study history. The abdominal panel and onion tissue still settle physically on the bench.

Scroll over the organ panel, swipe its label horizontally, or use its previous/next arrows to revisit earlier organs. Page Up/Down also browses history; arrow keys on the label browse, while arrow keys on the preview rotate. Browsing never changes the specimen or physics. Undo/cancel remove invalid history entries; reset clears the history. Previously shown explanations are reused in this tab.

The slide is a read-only clone rendered through the existing WebGL renderer; it is never added to Rapier or the picking hierarchy. Undo restores the removed organ and the previous study; cancelling a new grab also restores the previous study. Reset returns every organ and clears the slide. Minimize it with its close button and reopen it with the slide icon, including after release. Opening the study never steals focus during a drag.

The four-arrow button beside the tissue actions expands native movement controls. These start collapsed on smaller screens; the existing movement and rotation keyboard shortcuts remain available. Every button retains a 48 px target and visible keyboard focus.

### Clear liquid-glass interface

The toolbar, specimen controls and panels use the original shader from [dashersw/liquid-glass-js](https://github.com/dashersw/liquid-glass-js), pinned to revision `78cb6ccb0b9987bb60a88b14ccbd13a9e6e8ab2a`. Its fragment shader is extracted unchanged from the vendored source. Clear neutral tint, rounded/pill surfaces and live refraction replace the opaque blue treatment. The organ study and teaching chat share the reference's spaced, uppercase Orbitron lettering, bundled locally with its font license.

The chat adds the supplied reference's luminous blue glass rim, inset composer, glossy checkbox and circular send control. Its single rounded question selector expands into a keyboard-accessible list; selecting a prompt fills the composer without sending it. Native checkbox behavior, focus indicators, server requests and automatic organ explanations are preserved. Short layouts scroll the conversation/composer inside a fixed glass frame.

An adapter feeds only the rendered lab scene into the shader using the existing Three.js renderer. It does not snapshot the page, camera preview or API-key fields. The glass uses CSS-resolution targets, matching the library's canvas density; the specimen, native UI text and organ study keep full display resolution. There is no additional WebGL context or animation loop. Native buttons, focus, shortcuts, input ownership and dissection state stay in their existing modules. The upstream MIT license is included with the source and in the built site's `licenses/` directory.

The descriptions are concise classroom summaries, checked against the [NWTC frog laboratory manual](https://bio.libretexts.org/Courses/Northeast_Wisconsin_Technical_College/General_Biology_Laboratory_Manual/Laboratory_14%3A_Vertebrates/14.02%3A_Amphibian_%28Frog%29_Dissection). The model remains a simplified educational illustration.

## Gemini teaching chat

Use the speech-bubble button at the upper right. Ask a question and press **Send** (or Enter; Shift+Enter adds a line). Suggested questions only fill the composer; they do not send a request. The panel can explain anatomy, organ function and the current virtual lab step. It never operates the tools. Its answers are AI-generated and should be checked with a teacher.

Gemini is instructed to reply in 1–3 short sentences, with at most 45 words, for both questions and automatic organ explanations. This is a model instruction, not a hard truncation of the response.

The chat automatically uses the same-origin server connection; there is no browser key entry or connection menu. No question or lab state is transmitted on startup or opening the chat manually. Opening a new organ study automatically requests its explanation; submitting a question sends a follow-up request. An authored reference explanation appears immediately and remains available if the server is unavailable. Revisiting an organ reuses its displayed explanation instead of repeating the request. Switching studies, closing chat or resetting cancels pending replies so late responses cannot replace the active explanation. The optional **Share current lab state** checkbox includes the specimen, tool, incision stage, held/selected tissue, the organ being reviewed, and available/removed part names. It excludes webcam images, landmarks, coordinates and identifying data. Up to six completed exchanges are sent for follow-up context; the conversation is held only in memory for the current page. Turning off context sharing omits the current state, but previous answers may still mention earlier lab state. Reloading the page starts a fresh conversation and also restarts the lab.

### Local server setup

The browser sends only questions/history/coarse context to `/api/tutor`. The Gemini key and model selection stay on the server. No new dependencies are required.

1. Create **`.env.local` in the project root**, which Git ignores. Add `GEMINI_API_KEY=your-key` using your editor. Optionally set `GEMINI_MODEL=gemini-3.5-flash-lite`. Never use a `VITE_` prefix for credentials, since Vite exposes those variables in client bundles.
2. Run `npm start` (or `npm run dev` / `npm run preview`). Vite serves `/api/tutor` itself; no second terminal is needed. Restart after changing `.env.local`. (`npm run tutor` still starts the same handler standalone on `127.0.0.1:8787` for other hosts.)
3. Open an organ study for an automatic explanation, or open the chat and ask a question. No connection selection or key entry is needed in the app.

The default text model is `gemini-3.5-flash-lite`; use `GEMINI_MODEL` on the server if your account requires another supported text model. Model availability, quotas and account eligibility can change. The server uses the [generateContent REST API](https://ai.google.dev/api/generate-content), with classroom-focused system instructions and explicit safety settings. Automated checks use mocked replies, not a live account.

The tutor route accepts JSON POSTs from localhost/127.0.0.1 ports 3000, 5173 and 4173, limits request size and concurrency, rate-limits submissions, and times out provider calls. It returns fixed error messages and does not log prompts, credentials, provider payloads or answers; the dev server logs only a coarse failure code such as `[tutor] Gemini request failed: credentials` (bad key) or `model` (unavailable model). A missing key returns an unconfigured-service response. No-key, unavailable-network, timeout, blocked-response, model-access and quota states preserve the lab and allow retry; there are no automatic retries or startup requests. **Stop** and closing the panel cancel a pending request and ignore late replies.

For deployment, supply an authenticated same-origin `/api/tutor` route with a server secret manager, per-user authorization/quotas and the appropriate origin policy. Do not publish this loopback development service as an unauthenticated public proxy. The production static build alone cannot provide that route.

## Integration contract

Dispatch `CustomEvent`s on `window`. Coordinates are normalized **0…1 within the scene**, with the origin at its top-left.

| Event              | Detail                                          |
| ------------------ | ----------------------------------------------- |
| `input:move`       | `{ x, y, mode: 'scalpel' \| 'hand' \| 'idle' }` |
| `input:pinchstart` | `{ x, y }`                                      |
| `input:pinchend`   | `{ x, y }`                                      |
| `input:cutstart`   | `{ x, y }`                                      |
| `input:cutend`     | `{ x, y }`                                      |
| `input:zoom`       | `{ delta }` — positive moves closer             |

Start events select the corresponding tool. Move events update contact or the held target; end events commit the stroke or release the piece. The pointer adapter sends these same six events. Keyboard buttons use the same controller actions without requiring precise pointer positioning. Camera events add `source: 'webcam'`; they are accepted only while the camera owns input. A tracking-loss move also carries `lost: true` to clear hover feedback. The recognizer's additive `z` is preserved, but the lab controller uses canvas X/Y ray contact and its existing manipulation plane, rather than interpreting monocular height as physical depth.

`lab:statechange` publishes a cloned state object: `tool`, `hints`, `cut`, `cutOpen`, `held`, `lastCollected`, `selected`, `undo`, `available` and per-piece `detached`, `collected`, `separation`, `bend`, `direction`. Collected organs stay detached but are hidden, excluded from `available` and absent from physics. `lastCollected` identifies the persistent study; it and collection state are included in undo snapshots. The organ study and teaching panel observe the controller through its subscription interface; future integrations can use this event. `window.__scalpless.getDebug()` provides diagnostics and projected contact points for repeatable browser validation; it is not an action API.

### Camera vision merge notes

The input/camera adapters, root gesture recognizers, six events and Rapier implementation are unchanged. The controller now collects frog organs on release, including `input:pinchend`; adapters do not need separate collection logic. Tracking-loss release follows the same rule and remains undoable. Continue sending normalized scene coordinates through the existing adapter; do not target the organ study view as a second lab canvas. The study uses the main renderer's scissor/viewport and restores both after drawing. No additional render loop or WebGL context is introduced.

The new panels subscribe to lab state. Organ studies and teaching chat remain visible together; camera setup temporarily suspends the study and closes chat. The study opening callback requests teaching through the existing server adapter, without tool actions. Chat fields and study rotation consume their own keyboard input so shortcut letters and arrows cannot cut, reset, rotate or move tissue while typing/inspecting a study. The new UI never starts or stops the camera. Only the **setup panel** is closed when switching between camera settings and chat; a running tracking session continues. Existing deliberate scene/tool input still takes ownership through the camera adapter. Panel visibility is coordinated in `main.js` by observing `#hand-tracking-panel`; keep that ID and `#tracking-close` or update the observer if the incoming branch changes its UI.

Vite adds only an optional `/api/tutor` dev/preview proxy; keep the existing MediaPipe prebundle setting when merging its configuration. No webcam image, landmark or audio is included in teaching requests. The remaining merge checks are a real-person webcam run on both specimen routes and confirming normalized X/Y alignment after viewport/camera changes. Automated tracking checks use simulated camera frames and known landmarks, so they do not establish real-hand accuracy.

## Validation and artifacts

Start the local server, then:

```sh
npm test                  # cut coverage, undo and deterministic landing motion
npm run build             # production bundle
npm run test:browser      # browser interaction and accessibility-size checks
npm run test:study        # independent organ view, undo/reset and narrow layouts
npm run test:glass        # original glass shader, resize, Retina/mobile and controls
npm run test:frog-variants # exact blue/copper geometry and collider parity (Vite dev server)
npm run test:teaching     # mock server replies, typography/errors, input isolation and mobile
npm run test:landing      # same-mesh handoff, scroll, history and mobile checks
FROG_APPEARANCE=blue npm run test:frog  # blue specimen contact and organ-removal checks
npm run test:tracking     # camera lifecycle and gesture-driven onion workflow
npm run test:sandbox      # retained branch's rigged-hand sandbox browser checks
npx playwright install ffmpeg # once, for video recording
npm run capture           # PNGs and a recorded cut–peel–place walkthrough
npm run capture:landing   # recorded landing-page scroll walkthrough
```

Capture scripts use installed Google Chrome on macOS. Set `CHROME_PATH` to another Chromium executable, or install Playwright Chromium with `npx playwright install chromium`. Set `PREVIEW_URL` to test a different local server; set `HIGH_RES=1` for 2× PNG output. Landing checks default to port 4173 (the production preview); bench checks and captures default to port 5173. Exports are in ignored `output/`, including `scalpless-bench.png`, `scalpless-cutaway.png`, `scalpless-peeling.png`, `scalpless-dissection.png`, `scalpless-walkthrough.webm` and `validation.json`. Landing outputs include `landing-hero.png`, `landing-transition.png`, `landing-interactive.png`, mobile views, `landing-validation.json` and `scalpless-landing-scroll.webm`.

Browser checks verify the icon-only initial bench and the presence of accessible button names, then exercise partial/repeated strokes, endpoint clicks, invalid contact, interrupted drags, camera/tool ownership, manual section movement, reversible peeling, detached placement, further layers, epidermis removal, undo, reset while holding, release outside the tray and keyboard equivalents. Additional screenshots expose the reverse angle and a smaller viewport. Frame-rate samples are diagnostics for the local browser, not a guarantee for every GPU.

`test:tracking` first loads the actual local MediaPipe model with Chrome's simulated camera. It then supplies known landmarks at the detector boundary to test gesture recognition through real onion picking, partial cuts, pinch placement, reversible peeling, tracking-loss release, zoom and input ownership. It also checks camera denial and the mobile setup panel. Camera lifecycle unit tests cover cancellation, late permission responses, disconnects, stalled frames and retry. These checks do not measure recognition accuracy on a person's live webcam.

## Deliberate limits

This is an educational MVP approximation, not a validated tissue or surgical simulator. The onion supports one prepared longitudinal incision, nested removable half-shells, and one membrane patch. The frog supports one prepared abdominal opening and six removable organ pieces. It does not perform arbitrary mesh cutting, unrestricted tearing or full soft-body physics. A single supported incision unlocks a pre-segmented section. The onion remains stabilized on the platform, and placed concave shells use approximate collision shapes.

A future imported model needs closed removable parts, attachments, cut regions and physical metadata. The frog has a separate specimen definition. A wand can adapt to the existing input contract. Photograph-to-dissection would first need specimen identification and a prepared anatomical asset; unseen internal anatomy is not reconstructed here.

Microscopy, quizzes, wand input, n8n and deployment are deferred. The optional local teaching proxy is limited to Gemini questions; it is not an authenticated production backend.

## Reference onion model

The current specimen was remodeled against the supplied onion image: a fuller, asymmetric bulb, torn paper neck, root tuft and broader exposed cut face. The exterior maps use synthesized fibers, wrinkles and pigment variation at native 4K resolution. Meridian UVs follow surface distance, longitude wraps continuously across the two halves, and shared-edge normals remove the artificial lighting seam. The pearly cut faces have shaded purple membranes, subtle fibers and varied layer thickness. Hidden surfaces and internal geometry are inferred; this is a reference-guided model, not a recovered 3D scan or a claim of exact photographic reconstruction.

Self-contained GLB exports are included:

- `public/models/onion/onion-reference-intact.glb` — complete assembly with separately named section and peelable shells.
- `public/models/onion/onion-reference-cutaway.glb` — exposed cutaway variant.
- `public/models/onion/textures/` — color, tangent-space normal, roughness and height maps.

The live lab uses the parametric definition so it retains deformation caches, attachments and collision metadata. GLBs are reusable static model exports; importing one into another renderer does not automatically transfer the dissection controller. The membrane is omitted from the intact GLB to keep its initially hidden state from appearing over the specimen in other viewers.

With the Vite **development server** running, regenerate and validate the model exports with `npm run model:export`. The exporter reimports both GLBs and checks their mesh coordinates. `npm run model:preview` renders both exported models to `output/onion-reference-models.png`. Both scripts require the development server because they import the project modules. Rebuilding the source texture maps uses `python3 scripts/prepare-onion-textures.py` (Pillow and NumPy).

The current environment uses the supplied blue reference as a static image backdrop. Removed tissue can be placed beside the raised 3D platform. Live reflections and shadows are composited over the image and follow the camera and placed pieces.

## Rendering quality

The intact specimen remains the initial view. Removing the section reveals the improved interior; lighting changes do not advance the dissection state. Skin, flesh and the glossy platform use physical materials with separate roughness and surface-normal detail. A local 2K [Studio Small 09 HDRI](https://polyhaven.com/a/studio_small_09), by Sergej Majboroda (CC0), supplies soft reflections; credits are in `public/environments/LICENSE.md`.

Directional shadows are supplemented by a blurred, height-weighted contact capture beneath the specimen. Its proxy meshes share the deforming geometry, so the shadow changes during peeling and lifting. Detached pieces still cast shadows on the bench. The blue backdrop is a retouched copy of the original image. It is composited after the live scene is tone mapped, preserving the image’s original colors. Bloom is restricted to strong highlights; SMAA precedes the output transform, and device pixel ratio is capped at 1.5 to control GPU load. Scene state and interactions are independent of these effects.

### Original-image background

`public/art/lab-reference-background.webp` comes from `design/reference.png`. Baked-in cards, the onion, platform, instruments and toolbar are masked out; hidden blue surface regions are filled from surrounding source pixels, with grid segments continued through the retouched areas. The untouched source remains in `design/`. This is conventional image retouching, not a generated image or an exact recovery of hidden pixels.

Regenerate it with `python3 scripts/prepare-lab-background.py` (Pillow and NumPy). The background uses centered cover framing at every viewport size. The specimen, platform, tools, shadows and dissection remain real 3D; the backdrop itself stays fixed when orbiting.
