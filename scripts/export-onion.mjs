import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
const chrome =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(chrome) ? { executablePath: chrome } : {}),
});
try {
  const page = await browser.newPage();
  await page.goto(process.env.PREVIEW_URL || "http://127.0.0.1:5173");
  await page.waitForFunction(
    () => document.documentElement.dataset.ready === "true",
  );
  // Vite transforms these project modules and their bare Three.js imports.
  const exports = await page.evaluate(async () => {
    const [{ createOnion }, THREE, { GLTFExporter }, { GLTFLoader }] =
      await Promise.all([
        import("/src/specimens/onion.js"),
        import("/node_modules/three/build/three.module.js"),
        import("/node_modules/three/examples/jsm/exporters/GLTFExporter.js"),
        import("/node_modules/three/examples/jsm/loaders/GLTFLoader.js"),
      ]);
    const scene = new THREE.Scene(),
      specimen = await createOnion(scene),
      model = new THREE.Group();
    model.name = "Scalpless reference onion";
    model.userData = {
      source: "User supplied design/reference.png",
      method:
        "Hand-modeled nested shells with authored 4K PBR maps in the reference palette. Hidden surfaces are inferred.",
      units: "meters",
      supportedCut: "one longitudinal seam",
      peelableLayers: 8,
    };
    for (const part of specimen.parts.values()) {
      if (part.id === "epidermis") continue;
      part.group.position.set(0, 0, 0);
      model.add(part.group);
    }
    specimen.roots.position.set(0, 0, 0);
    model.add(specimen.roots);
    // Rest arrays are runtime deformation caches, not glTF metadata.
    model.traverse((o) => {
      if (o.isMesh) o.geometry.userData = {};
    });
    const results = [];
    for (const variant of ["intact", "cutaway"]) {
      specimen.parts.get("section").group.visible = variant === "intact";
      const data = await new GLTFExporter().parseAsync(model, {
        binary: true,
        onlyVisible: true,
        maxTextureSize: 4096,
      });
      const loaded = await new GLTFLoader().parseAsync(data, "");
      let meshes = 0,
        vertices = 0,
        invalid = 0;
      const textureSizes = new Set();
      loaded.scene.traverse((o) => {
        if (o.isMesh) {
          meshes++;
          const p = o.geometry.attributes.position;
          vertices += p.count;
          for (const attribute of [
            p,
            o.geometry.attributes.uv,
            o.geometry.attributes.normal,
          ]) {
            if (!attribute) continue;
            for (const n of attribute.array) if (!Number.isFinite(n)) invalid++;
          }
          const materials = Array.isArray(o.material)
            ? o.material
            : [o.material];
          for (const m of materials)
            for (const map of [m.map, m.normalMap, m.roughnessMap]) {
              if (map?.image)
                textureSizes.add(`${map.image.width}×${map.image.height}`);
            }
        }
      });
      if (meshes < 9 || invalid) throw new Error(`Invalid ${variant} model`);
      if (!textureSizes.has("4096×2048"))
        throw new Error("4K skin texture was lost in export");
      const bytes = new Uint8Array(data);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 32768)
        binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      results.push({
        variant,
        data: btoa(binary),
        meshes,
        vertices,
        bytes: bytes.length,
        textureSizes: [...textureSizes],
      });
    }
    return results;
  });
  await mkdir("public/models/onion", { recursive: true });
  const manifest = [];
  for (const item of exports) {
    const path = `public/models/onion/onion-reference-${item.variant}.glb`;
    await writeFile(path, Buffer.from(item.data, "base64"));
    manifest.push({
      variant: item.variant,
      file: path,
      meshes: item.meshes,
      vertices: item.vertices,
      bytes: item.bytes,
      textureSizes: item.textureSizes,
    });
  }
  await writeFile(
    "public/models/onion/manifest.json",
    JSON.stringify(
      {
        source: "design/reference.png",
        method:
          "Reference-guided modeling; hidden geometry inferred; reference-matched palette with synthesized native 4K skin detail.",
        models: manifest,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(manifest, null, 2));
} finally {
  await browser.close();
}
