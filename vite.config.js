import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import { createTutorHandler } from "./server/tutor.mjs";
import { DEFAULT_MODEL } from "./src/teaching-request.js";

// Serves /api/tutor from the dev and preview servers. GEMINI_API_KEY comes from
// .env.local (git-ignored) and stays server-side: only VITE_ variables reach
// the client bundle. The camera/gesture pipeline has no dependency on it.
function tutor(mode) {
  const env = loadEnv(mode, process.cwd(), "GEMINI_");
  const handler = createTutorHandler({
    key: env.GEMINI_API_KEY?.trim() ?? "",
    model: env.GEMINI_MODEL?.trim() || DEFAULT_MODEL,
    // A coarse code only: no key, prompt or provider payload is logged.
    onFailure: (code) => console.warn(`[tutor] Gemini request failed: ${code}`),
  });
  // Returns nothing: Vite would run a returned function as a post-hook.
  const mount = (server) => {
    server.middlewares.use((req, res, next) =>
      req.url === "/api/tutor" || req.url === "/api/tutor/status"
        ? handler(req, res)
        : next(),
    );
  };
  return {
    name: "scalpless-tutor",
    configureServer: mount,
    configurePreviewServer: mount,
  };
}

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [tutor(mode)],
  // Prebundle the lazy camera SDK at startup. Otherwise the first camera click
  // can trigger Vite's dependency-discovery reload and cancel permission setup.
  optimizeDeps: { include: ["@mediapipe/tasks-vision"] },
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
}));
