import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
// The pinned package does not export its WASM subpaths. Vite emits these URLs
// locally, so neither inference nor camera frames depend on a third-party CDN.
import simdLoader from "../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js?url";
import simdBinary from "../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm?url";
import plainLoader from "../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.js?url";
import plainBinary from "../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.wasm?url";

export async function loadHandTrackingModel() {
  const simd = await FilesetResolver.isSimdSupported();
  const fileset = {
    wasmLoaderPath: simd ? simdLoader : plainLoader,
    wasmBinaryPath: simd ? simdBinary : plainBinary,
  };
  const options = {
    baseOptions: {
      modelAssetPath: `${import.meta.env.BASE_URL}models/hand-tracking/hand_landmarker.task`,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
  };
  try {
    return await HandLandmarker.createFromOptions(fileset, options);
  } catch {
    options.baseOptions.delegate = "CPU";
    return HandLandmarker.createFromOptions(fileset, options);
  }
}
