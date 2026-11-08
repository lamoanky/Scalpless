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
  const height =
    p <= 0.52
      ? mix(mobile ? 1.22 : 1.85, middleHeight, first)
      : mix(middleHeight, lastHeight, second);
  return {
    progress: p,
    height: still ? lastHeight : height,
    x: still
      ? mobile
        ? 0.62
        : 0.715
      : p <= 0.52
        ? mix(mobile ? 0.92 : 0.96, mobile ? 0.6 : 0.73, first)
        : mix(mobile ? 0.6 : 0.73, mobile ? 0.62 : 0.715, second),
    y: still
      ? mobile
        ? 0.695
        : 0.54
      : p <= 0.52
        ? mix(mobile ? 1.02 : 1, mobile ? 0.71 : 0.56, first)
        : mix(mobile ? 0.71 : 0.56, mobile ? 0.695 : 0.54, second),
    rotation: -0.18 + (still ? 0 : Math.PI * 2 * (first + second)),
    panels: still ? panels.map((_, i) => Number(i === active)) : panels,
    active,
    gallery: still ? Number(active === 2) : revealCollection,
    orbit: still ? 0 : revealExplore * (1 - revealCollection),
  };
}
