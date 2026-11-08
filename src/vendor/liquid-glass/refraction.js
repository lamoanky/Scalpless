// The upstream source is vendored byte-for-byte, including its original GLSL.
// Import as text: its DOM snapshot/WebGL lifecycle is never executed. This lets
// the lab use the exact shader with its existing renderer and live scene input.
import source from "./container.js?raw";

export const glassFragment = source.match(/const fsSource = `([\s\S]*?)`/)[1];
