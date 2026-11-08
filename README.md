# Scalpless

A hands-on 3D onion dissection bench. The specimen, platform and instruments are rendered meshes, with direct surface contact, constrained peeling, and Rapier collisions for released tissue. Built with Vite, vanilla JavaScript and Three.js.

## Run

Requires Node.js 22.12+ or 24+ and a WebGL-capable browser.

```sh
npm install
npm run dev -- --port 5173
```

Open http://127.0.0.1:5173. Keep the terminal running while using the bench.

## Working at the bench

The visible interface uses icons only, with a glass toolbar at the lower left. Branding, captions, tool labels, keyboard badges, instructional text and visible notifications are omitted. Every control retains an accessible name and keyboard operation; status messages are announced to screen readers. The instructions below refer to those accessible names.

1. **Inspect (V):** left drag to orbit. Right drag or the arrow keys with the scene focused also orbit. Scroll or use **+/−** to zoom. The magnifier opens camera controls for zoom, orbit and return to the working view.
2. **Scalpel (S):** drag along the supported longitudinal seam on the front of the intact onion. The lightbulb reveals its guide. Short strokes accumulate, and releasing preserves partial progress. At least 90% of the seam must be covered; endpoint clicks and off-surface movements cannot substitute for tracing it. **Trace supported seam** is the keyboard-accessible equivalent.
3. **Forceps (H):** grasp the freed section and drag it away. Release to let it settle. The layers icon opens a tissue picker; choose a tissue icon, then use the lift arrow, directional pad and place icon. Their accessible names are **Lift selected piece** and **Place on bench**.
4. **Peel:** grasp the exposed edge of the outer skin and pull. Moving back relaxes the bend. Releasing a partial peel leaves it attached; grasp again to continue. Once detached, carry and place it. Fleshy layers use the same interaction. A thin epidermis patch becomes available on the first removed fleshy layer.
5. **While holding:** arrows move horizontally, **Page Up / Page Down** lift and lower, **Q / E** rotate a detached piece. The on-screen pad provides the same actions. **Escape** cancels the current manipulation.
6. **Undo (⌘/Ctrl Z)** restores the previous completed stroke or manipulation. **Reset (R)** restores the intact specimen, camera, tools and collection area.

There are no timing challenges. Controls have 48 px minimum targets, visible focus, native buttons, accessible names and brief screen-reader announcements. Reduced-motion preferences disable camera inertia, interface transitions and animated relaxation of released attached tissue. Direct manipulation and gravitational settling remain available.

## Architecture

- `src/specimens/onion.js`: replaceable procedural specimen definition, closed shells, capped faces, materials, cut region, grasp points, membrane and constrained deformation.
- `src/lab-controller.js`: attachment/separation state, seam coverage, manipulation, completed-operation snapshots, undo/reset and observable state.
- `src/input.js`: mouse/keyboard adapter and the existing six `input:*` event listeners. No camera, hand tracking or wand code.
- `src/physics.js`: Rapier world, stationary specimen colliders, compound colliders for thin shells, held kinematic bodies, released dynamic bodies, platform and bench contacts.
- `src/scene.js`: HDRI lighting, physical instruments and user-controlled camera.
- `src/render-pipeline.js`: subtle highlight bloom, SMAA antialiasing, ACES output for the 3D scene, and a final composite over the original-image backdrop.
- `src/contact-shadows.js`: live height-weighted, blurred contact occlusion from deformed specimen meshes.
- `src/lab-environment.js`: transparent reflection/shadow catchers and a two-tier white/cyan platform; shared platform bounds keep rendering and collisions aligned.
- `src/domain.js`: cut coverage and snapshot history independent of rendering.
- `src/main.js`, `index.html`, `src/style.css`: bootstrap, render loop and compact accessible controls.

The specimen stays stationary during cutting. Attached tissue is deformed around its basal attachment with bounded displacement; separation progress is stored separately from its current bend. A detached shell retains its shape and becomes a rigid body. Collision geometry approximates its volume using smaller convex patches to preserve concavity. Held pieces follow constrained targets; release transfers them back to simulation with restrained motion.

The original supplied design is preserved in `design/reference.png`. Runtime geometry is generated in code. The skin uses authored 4096 × 2048 color, normal and roughness maps; the cut faces use 2048 × 2048 color and normal maps. These synthesize fine fibers and wrinkles in the reference palette rather than claiming to recover photographic detail from the small reference. The specimen and tools remain live 3D objects, and floating educational panels are omitted.

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

Start events select the corresponding tool. Move events update contact or the held target; end events commit the stroke or release the piece. The pointer adapter sends these same six events. Keyboard buttons use the same controller actions without requiring precise pointer positioning.

`lab:statechange` publishes a cloned state object: `tool`, `hints`, `cut`, `cutOpen`, `held`, `selected`, `undo`, `available` and per-piece `detached`, `separation`, `bend`, `direction`. Future educational UI can observe it. `window.__scalpless.getDebug()` provides diagnostics and projected contact points for repeatable browser validation; it is not an action API.

## Validation and artifacts

Start the local server, then:

```sh
npm test                  # coverage, invalid contacts, threshold and undo tests
npm run build             # production bundle
npm run test:browser      # browser interaction and accessibility-size checks
npx playwright install ffmpeg # once, for video recording
npm run capture           # PNGs and a recorded cut–peel–place walkthrough
```

Capture scripts use installed Google Chrome on macOS. Set `CHROME_PATH` to another Chromium executable, or install Playwright Chromium with `npx playwright install chromium`. Set `PREVIEW_URL` to test a different local server; set `HIGH_RES=1` for 2× PNG output. Exports are in ignored `output/`, including `scalpless-bench.png`, `scalpless-cutaway.png`, `scalpless-peeling.png`, `scalpless-dissection.png`, `scalpless-walkthrough.webm` and `validation.json`.

Browser checks verify the absence of visible interface text and the presence of accessible button names, then exercise partial/repeated strokes, endpoint clicks, invalid contact, interrupted drags, camera/tool ownership, manual section movement, reversible peeling, detached placement, further layers, epidermis removal, undo, reset while holding, release outside the tray and keyboard equivalents. Additional screenshots expose the reverse angle and a smaller viewport. Frame-rate samples are diagnostics for the local browser, not a guarantee for every GPU.

## Deliberate limits

This is an educational MVP approximation, not a validated tissue or surgical simulator. It supports one prepared longitudinal incision, nested removable half-shells, and one membrane patch. It does not perform arbitrary mesh cutting, unrestricted tearing or full soft-body physics. A single supported incision unlocks a pre-segmented section. The onion remains stabilized on the platform, and placed concave shells use approximate collision shapes.

A future imported model needs closed removable parts, attachments, cut regions and physical metadata. A frog should be a separate specimen definition. A wand can adapt to the existing input contract. Photograph-to-dissection would first need specimen identification and a prepared anatomical asset; unseen internal anatomy is not reconstructed here.

Chatbot panels, microscopy, quizzes, gesture tracking, n8n, backend services and deployment are deferred.

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
