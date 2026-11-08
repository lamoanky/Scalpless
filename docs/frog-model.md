# Frog specimen

Open `/lab.html?specimen=frog`, or choose the frog icon at the upper left of the bench. The landing page uses the blue variant (`&appearance=blue`), keeping the same meshes from the opening through rotation onto the platform and interactive dissection. The copper version remains the default on this direct route.

This is a custom frog with reference-guided proportions and simplified ventral anatomy. It is not an anatomical scan or a validated training model. No third-party frog mesh or textures are bundled.

The natural-skin view uses a rounded jaw, lateral gold irises, continuous tapered limbs with shallow muscle contours, four forelimb digits, five webbed hindlimb digits, and authored textures. The latest exterior reference guides copper-orange skin, golden flank patches, irregular chestnut abdominal markings, darker webbing and a wet, pebbled surface. Organ surfaces have irregular lobes, fine mottling and restrained vascular detail.

The layers button beside the specimen selector toggles **Translucent anatomy view**. It reveals the existing organs plus illustrative muscle, vessel and distal-bone detail under a blue skin envelope. This is a view setting: it does not complete a cut, detach tissue, change selection, or add undo history. Reset returns to natural skin. The native button supports keyboard activation and exposes its pressed state to assistive technology.

Visual reference: [3D Molier's Frog Anatomy Complete Body Transparent Skin](https://www.turbosquid.com/3d-models/3d-frog-anatomy-complete-body-transparent-skin-1780569). Its preview informed the eyes, webbing and translucent presentation. The marketplace mesh, textures and full anatomical systems are not included; exact asset integration requires the licensed source files.

## Supported workflow

1. Start with the abdominal panel in place. Select the scalpel and enable the lightbulb hint to reveal its oval incision. Short strokes accumulate to the same 90% coverage threshold as the onion. The native trace button provides a keyboard equivalent.
2. Use forceps to lift and move the panel. It stays where you manipulate it; release returns it to Rapier simulation.
3. Inspect and remove the heart, three-lobed liver, left lung and right lung. Moving the liver away makes the stomach and intestines selectable.
4. Carry and rotate each piece, release it on the bench, or use the place button. Undo restores the previous operation. Reset restores all attachments, the intact panel, and the working camera.

Each removable organ is a pre-separated rigid piece. Grasping an accessible organ releases its attachment. The panel combines the skin and abdominal wall; arbitrary incisions, pinning multiple flaps, and cutting vessels or connective tissue are not simulated. Vessel and mesenteric details are attached visual geometry. The simplified organ shapes and their placement need subject-matter review before instructional use. Optional webcam controls share the same controller and six `input:*` events; physical-hand accuracy requires a live camera check.

Anatomical layout reference: [Carolina's frog dissection guide](https://knowledge.carolina.com/discipline/life-science/anatomy-and-physiology/frog-dissection/), particularly the ventral orientation, three liver lobes, and organ overview. The source is a reference, not an endorsement or validation of this model.

## Resources for a more realistic replacement

- **Best asset:** a `.glb` / `.gltf` or `.blend` frog with separately named body, abdominal wall, heart, liver, lungs, stomach, and intestines. A single exterior mesh cannot expose organs by itself.
- Include color, roughness and normal textures, and a license that permits bundling the model and textures in a web app. An untextured anatomical model is still useful; materials can be authored here.
- Closed surfaces and thickness are helpful for removed pieces. Please include the specimen's approximate size and species if known. A ventral pose with spread legs is ideal.
- A labeled internal-anatomy image or course dissection guide helps verify positions, proportions and the intended removable structures. Dorsal/ventral/side photos are helpful for appearance; a photograph alone cannot supply unseen anatomy.
- Collider shapes, interaction metadata, incision paths, and input integration are implemented in this repo; they do not need to come with the art asset.

The [NIH 3D Frog Dissection Kit](https://3d.nih.gov/entries/268) is a possible source to evaluate: its entry describes a frog body and six puzzle-piece organs shared under CC BY. It has not been downloaded or used here; suitability and attribution details still need checking before import.

## Implementation boundary

`src/specimens/frog.js` owns the assembly, stable part IDs, grasp points, incision, access rules, view setting and collider components. `frog-anatomy.js` defines the shared torso/cover outline, thin cover, asymmetric liver lobes, lung sacs and digestive paths. `frog-surfaces.js` supplies general continuous surfaces and re-exports the independent `frog-materials.js` appearance layer. Regenerate the current exterior atlas and micro-detail with `python3 scripts/prepare-frog-exterior.py`, the iris/legacy maps with `python3 scripts/prepare-frog-textures.py`, and packed organ detail with `python3 scripts/prepare-frog-detail.py` (Pillow and NumPy). The shared controller owns cut coverage, attachments, transforms, undo, input contact and placement. Body and organ meshes are batched by material; separate collision components preserve the cavity. Anatomy-only overlays never compete with the specimen's raycast targets or create physics bodies.

Every mesh's geometry is baked into part-local coordinates, with identity mesh transforms. `initialPosition` is the part group's world translation. The liver uses one convex collider per lobe. The 1.1 mm abdominal wall uses 24 small convex patches: a single broad, thin hull was unstable at this scale when landing on the tray lip. The incision, visible opening and cover collision patches derive from the same surface definition. Grasp points and body collision arcs follow the reshaped anatomy. An imported model adapter must bake mesh transforms (including nested hierarchy transforms) or supply equivalent part-local geometry before using the shared physics helpers. World matrices must not be applied twice. Retain the `abdomen`, `heart`, `liver`, `lung-left`, `lung-right`, `stomach`, and `intestines` IDs when replacing the current asset.

Run `npm run test:frog` for partial/invalid/repeated cuts, manual panel separation, access to deeper organs, surface grabbing of every organ, controller events, placement, undo/reset/cancellation, mobile rendering, and switching back to onion. `npm run capture:frog` also saves a browser recording under `output/frog-walkthrough.webm`. Tests use the actual mesh raycasts and Rapier world. Screenshots and reports are generated under `output/` and are not committed.

## Tissue and shape pass

The 27 batched anatomical meshes use `MeshPhysicalMaterial`. Following approval to reshape the specimen, the torso, abdominal wall, head profile, limb transitions, liver, heart, lungs, stomach and intestinal folds were refined. The cavity has sloping flanks and a shared irregular rim instead of a circular bowl edge; the cover has a thin closed edge and pink inner tissue. Three asymmetric, thin-edged liver lobes replace rounded masses. Lung sacs taper toward their attachments, the stomach follows a wider J-shaped curve, and narrow intestinal loops cross at different heights. Vessel curves are projected onto the organ surfaces so they remain in contact.

The same eight part IDs, group hierarchy, batched mesh names and organ availability rules remain. The shared controller, click handlers, input adapters, undo and camera controls are unchanged. Specimen-specific incision points, grasp locations and collision geometry were updated to match the new surfaces.

| Tissue | Base color | Roughness | Clearcoat / roughness |
| --- | --- | --- | --- |
| Heart | `#ac5960` | .36 | .90 / .16 |
| Liver | `#4b2522` | .33 | .96 / .16 |
| Lungs | `#9e5c6e` | .44 | .80 / .20 |
| Stomach | `#d6c5cf` | .38 | .90 / .18 |
| Intestines | `#454a2d` | .42 | .85 / .19 |
| Muscle | `#b55d62` | .40 | .85 / .15 |
| Cavity lining | `#704044` | .44 | .80 / .20 |
| Skin / abdominal panel | Authored copper / gold / chestnut atlas | .40 | .72 / .17 |

These are base values, with local color and roughness modulation. The supplied exploded-organ reference now guides the darker brown liver, granular pink lung surfaces, pale vascular tissue and olive digestive tissue. Colors are visually interpreted, not calibrated measurements. The image is unlabeled; it is used for appearance, not to infer missing structures or rename the existing anatomy.

Eight deterministic 1024px RGB data textures carry low-frequency mottling, micro-height and thin branching capillaries. They use linear color space, mipmaps and opaque channels (no data in transparent pixels). The current exterior color atlas is 2048px and the iris 1024px. The old olive/cream maps remain in the asset directory but are no longer loaded. Old generic organ normal/roughness maps are no longer loaded. Skin, muscle, general organ and membrane detail have separate patterns, supplemented by pitted lung texture, short liver wrinkles, digestive folds and a more distinct branching vascular pattern for pale tissue. Skin now uses `exterior-detail.png`: irregular gland cells and broken fine wrinkles. The clearcoat shading normal follows the micro-detail with a per-tissue strength, so wet reflections no longer hide the surface grain. These changes do not displace vertices.

Every render mesh has UVs, including the new shapes, but lobes pinch at poles, tapered tubes stretch, and batched components share overlapping UV islands. The new tissue/color detail therefore uses three-axis projection in part-local coordinates. Surface-gradient bump perturbs only shading normals; texture detail stays attached when a piece is moved or rotated. The copper exterior adds a deliberately authored part-local XZ color atlas shared by skin and abdominal wall, so large markings remain continuous across their seam. It is not projected from the photograph. Its micro-detail remains triplanar; steep sidewalls have less color variation than a fully painted 3D asset. The iris retains its original radial UV mapping. Triplanar blending can soften fine vessels where the axes meet; it is not a vascular anatomy map.

Lungs use .07 transmission with millimetre-scale thickness, warm attenuation and sheen. This approximates thin moist tissue; it is not volumetric subsurface scattering. The intact abdominal wall uses an opaque exterior matching the surrounding skin, with a pink inner face; this avoids a pale refractive border around the detachable panel. The separate translucent anatomy toggle keeps its alpha-based visibility behavior.

The frog bench uses the existing studio HDRI with a warmer key, restrained blue rim, filtered shadows, ACES and sRGB. A 12-sample half-resolution SSAO pass with a 9 mm local radius reuses the beauty depth buffer and applies bilateral reconstruction for moving organ contacts. Depth samples are reconstructed at texel centers to avoid false flat-surface banding. It adds one fullscreen draw, not a geometry/normal scene render. The original floor contact shadows remain. Onion lighting and AO settings stay as before.

Run `node scripts/capture-frog-appearance.mjs` for working, oblique, overhead, close, translucent, held-organ and deeper-organ screenshots plus shader-error, material, browser texture-decode and FPS reports. `CAPTURE_DPR=2` captures 3200×2000 PNGs. The frog's internal render resolution is capped at 1.1 DPR to budget for transmission and contact occlusion on Retina laptops; the onion retains its 1.5 cap. All captures use the existing UI operations; no geometry or camera implementation is changed for screenshots.

Remaining limits: removed organs and the thin abdominal wall still move as rigid pieces, without soft-tissue deformation. The custom shapes are simplified and joints/webbing remain stylized. Fat bodies, kidneys, brain and bladder are absent. The specimen remains in its ventral dissection pose; the reference's full anatomy and crouched exterior pose are not reproduced. A scanned or expertly sculpted model would still improve silhouette and anatomical fidelity.

Validation includes closed detachable surfaces and outward normals, a gap-free torso/lining rim, skin containment over the liver and lungs, contact along all 96 incision samples, and rotated Rapier releases of the liver and abdominal wall on the tray lip and collection floor.

Final local validation: 82 unit tests, the frog browser interaction check, and the production build passed. The latest copper-exterior interaction check at 1600×1000 CSS pixels measured approximately 60 fps idle and 55 fps manipulating an organ, with no browser errors. Earlier high-DPI appearance captures ranged from 50 to 60 fps. These are local browser measurements, not a guarantee of a locked 60 fps on every device.

The copper exterior pass changes the skin palette, microstructure, mouth pigment, eye orientation, jaw profile and shallow limb contours. The blue anatomy toggle, organ materials, incision surface, grasp metadata and controller remain as before. The supplied exterior photograph is a visual target; this is still custom procedural geometry, not a reconstruction of that specimen.

Exterior close-up review also removed the redundant raised incision ring, projected the mouth crease onto the revised head surface, and inset the forelimb roots into the torso. The visible incision guide is still controlled by hints and uses the unchanged supported seam.

## Continuous blue landing specimen

The blue exterior is authored in `src/landing-frog.js`. Its torso and abdominal panel share the existing incision surface. The anatomy, guide, grasp points and collision shapes receive the same local height transform so contact remains aligned. Limb vertices rotate around fixed shoulder/hip pivots during entry; their final collision shapes are baked in lab coordinates. The controller, input events and physics implementation are unchanged. The same mesh UUIDs survive opening, rotation and handoff. Native blue-skin reset returns to the landed pose; it does not restart the landing animation.

Blue-variant validation also covers manual partial/repeated incisions and mouse removal of all six organs. The taller cover uses its transformed tissue point for clearance checks, so tipping it beside the specimen correctly exposes the organs. Blue lighting uses neutral tone mapping; the direct copper specimen retains ACES.
