const clamp=n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));
const ease=(a,b,p)=>{const t=clamp((p-a)/(b-a));return t*t*(3-2*t);};

// Scrolling previews only the Blender frog. Entry is a separate, button-driven
// timeline, so reaching the bottom can never switch models or unlock the lab.
export function landingFrame(progress,{still=false,entry=0}={}) {
  const p=clamp(progress),e=clamp(entry),travel=still?Number(e>0):ease(0,1,e);
  return {
    progress:p,
    entryProgress:e,
    previewRotation:still?0:ease(.12,.88,p)*Math.PI,
    pose:travel,
    camera:travel,
    platform:still?travel:ease(.18,.85,e),
    handoff:still?travel:ease(.6,.94,e),
    backdropOpacity:1-(still?travel:ease(.25,.9,e)),
    panelSpread:0,
    panelsOpacity:1-(still?travel:ease(.25,.9,e)),
    canEnter:e>=1,
  };
}
