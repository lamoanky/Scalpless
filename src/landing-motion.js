const clamp = (n) => Math.min(1, Math.max(0, n));
const mix = (a, b, t) => a + (b - a) * t;
const ease = (a, b, p) => {
  const t = clamp((p - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// The landing motion is derived from scroll position, never a timed tour.
// Reversing the scroll reproduces exactly the same model pose.
export function landingFrame(
  progress,
  { mobile = false, aspect = 1.6, still = false } = {},
) {
  const p = clamp(progress),
    first = ease(0, 0.52, p),
    second = ease(0.52, 1, p);
  const modelReveal = still ? 0 : ease(0.08, 0.28, p);
  const revealExplore = ease(0.18, 0.34, p),
    revealCollection = ease(0.66, 0.82, p);
  const panels = [
    1 - revealExplore,
    revealExplore * (1 - revealCollection),
    revealCollection,
  ];
  const active = panels.indexOf(Math.max(...panels));
  const middleHeight = mobile ? Math.min(0.48, aspect * 0.92) : 0.8;
  const lastHeight = mobile ? Math.min(0.25, aspect * 0.56) : 0.42;
  // Keep the photograph's neck near 67% of the viewport at different desktop
  // aspect ratios, matching the reference without covering the navigation.
  const openingX = mobile ? 0.92 : 0.67 + 0.58 / Math.max(aspect, 1);
  const height =
    p <= 0.52
      ? mix(mobile ? 1.22 : 2.05, middleHeight, first)
      : mix(middleHeight, lastHeight, second);
  return {
    progress: p,
    height: still ? lastHeight : height,
    x: still
      ? mobile
        ? 0.62
        : 0.715
      : p <= 0.52
        ? mix(openingX, mobile ? 0.6 : 0.73, first)
        : mix(mobile ? 0.6 : 0.73, mobile ? 0.62 : 0.715, second),
    y: still
      ? mobile
        ? 0.695
        : 0.54
      : p <= 0.52
        ? mix(mobile ? 1.02 : 1, mobile ? 0.71 : 0.56, first)
        : mix(mobile ? 0.71 : 0.56, mobile ? 0.695 : 0.54, second),
    // Keep the cut face aligned while the photograph dissolves into the mesh.
    // The full turn begins once most of that blend has finished.
    rotation:
      -0.18 + (still ? 0 : Math.PI * 2 * (ease(0.22, 0.52, p) + second)),
    modelReveal,
    photoOpacity: 1 - modelReveal,
    tilt: still ? -0.025 : mix(0.35, -0.025, ease(0.28, 0.52, p)),
    photoAlignment: still ? 0 : 1 - ease(0.28, 0.52, p),
    laboratory: still ? Number(active > 0) : ease(0.12, 0.48, p),
    panels: still ? panels.map((_, i) => Number(i === active)) : panels,
    active,
    gallery: still ? Number(active === 2) : revealCollection,
    orbit: still ? 0 : revealExplore * (1 - revealCollection),
  };
}
