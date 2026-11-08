import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  base: "./",
  // Prebundle the lazy camera SDK at startup. Otherwise the first camera click
  // can trigger Vite's dependency-discovery reload and cancel permission setup.
  optimizeDeps: { include: ["@mediapipe/tasks-vision"] },
  // Optional local tutor; the camera/gesture pipeline has no dependency on it.
  server: { proxy: { "/api/tutor": "http://127.0.0.1:8787" } },
  preview: { proxy: { "/api/tutor": "http://127.0.0.1:8787" } },
  build: {
    chunkSizeWarningLimit: 5500,
    rolldownOptions: {
      input: {
        landing: fileURLToPath(new URL("./index.html", import.meta.url)),
        lab: fileURLToPath(new URL("./lab.html", import.meta.url)),
        sandbox: fileURLToPath(
          new URL("./gesture-sandbox.html", import.meta.url),
        ),
      },
    },
  },
});
