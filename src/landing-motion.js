const clamp=n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));
const ease=(a,b,p)=>{const t=clamp((p-a)/(b-a));return t*t*(3-2*t);};

// Scrolling previews only the Blender frog. Entry is a separate, button-driven
// timeline, so reaching the bottom can never switch models or unlock the lab.
export function landingFrame(progress,{still=false,entry=0}={}) {
  const p=clamp(progress),e=clamp(entry),jump=Number(e>0);
  // Staged entry: the platform rises first, then the frog hops onto it with a
  // pirouette while the camera glides in; the live specimen takes over last.
  const stage=(a,b)=>still?jump:ease(a,b,e);
  return {
    progress:p,
    entryProgress:e,
    previewRotation:still?0:ease(.12,.88,p)*Math.PI,
    pose:stage(.25,.85),
    camera:stage(.05,1),
    platform:stage(0,.35),
    handoff:stage(.7,1),
    backdropOpacity:1-stage(.1,.6),
    panelSpread:0,
    panelsOpacity:1-stage(.1,.6),
    canEnter:e>=1,
  };
}
