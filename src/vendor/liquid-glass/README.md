# Liquid Glass JS

Upstream: https://github.com/dashersw/liquid-glass-js/tree/78cb6ccb0b9987bb60a88b14ccbd13a9e6e8ab2a

Copyright (c) 2025 Armagan Amcalar, MIT. The license is kept alongside the source and shipped in `public/licenses/liquid-glass-LICENSE.txt`.

`container.js` and `glass.css` are vendored unchanged from that revision. `refraction.js` extracts the original fragment shader verbatim; it is not a rewritten approximation. Its rounded/circle/pill masks, refraction, blur, neutral tint and sampled gradients run unchanged. The lab uses the documented default optical parameters with tint opacity set to 0.08 for clear glass.

The integration in `src/liquid-glass.js` supplies the live lab framebuffer instead of a page snapshot. A GPU orientation pass converts it to the shader's top-down coordinates. Every panel uses the existing Three.js renderer; the original Container DOM lifecycle and html2canvas capture are not executed. No API-key field, DOM or camera-video capture is involved. Native elements retain their semantics, focus and existing handlers. The upstream stylesheet is retained as a reference; the app stylesheet preserves its existing layout and readable dark labels on the pale lab scene.

The frame copy is shared by visible panels, recreated on resize, and skipped while the UI is hidden for the landing. There is no separate animation loop. The organ slide renders over the glass after its pass, clearing depth only within its preview. CSS provides edge highlights and a translucent fallback.
