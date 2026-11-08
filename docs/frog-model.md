# Frog specimen

Open `/lab.html?specimen=frog`, or choose the frog icon at the upper left of the bench. The landing page's frog card links here too.

This is a custom frog with reference-guided proportions and simplified ventral anatomy. It is not an anatomical scan or a validated training model. No third-party frog mesh or textures are bundled.

The natural-skin view uses a broad jaw, gold irises, continuous tapered limbs, four forelimb digits, five webbed hindlimb digits, and authored 2K color, normal and roughness maps. A pale ventral surface blends into mottled olive flanks. Organ surfaces have irregular lobes, fine mottling and restrained vascular detail.

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

`src/specimens/frog.js` owns the assembly, stable part IDs, grasp points, incision, access rules, view setting and collider components. `frog-surfaces.js` supplies continuous surface geometry and PBR materials. Regenerate the authored maps with `python3 scripts/prepare-frog-textures.py` (Pillow and NumPy). The shared controller owns cut coverage, attachments, transforms, undo, input contact and placement. Body and organ meshes are batched by material; separate collision components preserve the cavity. Anatomy-only overlays never compete with the specimen's raycast targets or create physics bodies.

Every mesh's geometry is baked into part-local coordinates, with identity mesh transforms. `initialPosition` is the part group's world translation. The liver uses one convex collider per lobe to keep its thin, irregular shape stable after rotated releases. An imported model adapter must bake mesh transforms (including nested hierarchy transforms) or supply equivalent part-local geometry before using the shared physics helpers. World matrices must not be applied twice. Retain the `abdomen`, `heart`, `liver`, `lung-left`, `lung-right`, `stomach`, and `intestines` IDs when replacing the current asset.

Run `npm run test:frog` for partial/invalid/repeated cuts, manual panel separation, access to deeper organs, surface grabbing of every organ, controller events, placement, undo/reset/cancellation, mobile rendering, and switching back to onion. `npm run capture:frog` also saves a browser recording under `output/frog-walkthrough.webm`. Tests use the actual mesh raycasts and Rapier world. Screenshots and reports are generated under `output/` and are not committed.
