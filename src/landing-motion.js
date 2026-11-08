const clamp=n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));
const ease=(a,b,p)=>{const t=clamp((p-a)/(b-a));return t*t*(3-2*t);};

// One specimen, one renderer. Scroll changes only its rigid pose, the camera,
// and the platform position; it never changes opacity or replaces the model.
export function landingFrame(progress,{still=false}={}) {
  const p=clamp(progress),end=Number(p>=.82);
  return {
    progress:p,
    pose:still?end:ease(.12,.88,p),
    camera:still?end:ease(.04,.94,p),
    platform:still?end:ease(.36,.87,p),
    panelSpread:still?end:ease(.02,.46,p),
    panelsOpacity:still?1-end:1-ease(.18,.5,p),
    canEnter:p>=.995,
  };
}
