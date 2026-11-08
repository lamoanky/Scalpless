import { landingFrame } from './landing-motion.js';

// Input is locked while the same specimen is being posed above its bench.
// Physics resumes only after the presentation root is exactly the identity.
export async function createLandingPresentation(bench,specimen) {
  const embedded=parent!==window&&new URLSearchParams(location.search).get('embed')==='landing';
  if(!embedded)return {paused:false,locked:false,ready(){},update(){},getDebug:()=>null};
  document.documentElement.classList.add('landing-preview');
  const {createLandingScene}=await import('./landing-scene.js');
  const stage=createLandingScene(bench,specimen);
  let frame=landingFrame(0),active=false;
  bench.controls.enabled=false;
  const presentation={
    paused:false,locked:true,needsRender:true,
    ready(){parent.postMessage({type:'scalpless:lab-ready'},location.origin);},
    update(){if(!active)stage.update(frame);presentation.needsRender=false;},
    getDebug:()=>({...stage.getDebug(),active}),
  };
  addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='scalpless:landing-frame')return;
    const nextActive=event.data.active===true;
    frame=landingFrame(event.data.progress,{still:event.data.still===true});
    // Entry must always land at the exact final pose, including hash reload.
    if(nextActive)frame=landingFrame(1);
    if(active!==nextActive){
      if(nextActive){stage.update(frame);stage.finish();bench.controls.update();}
      active=nextActive;presentation.locked=!active;bench.controls.enabled=active;
      document.documentElement.classList.toggle('landing-preview',!active);
    }
    presentation.needsRender=true;
  });
  new ResizeObserver(()=>{presentation.needsRender=true;}).observe(bench.host);
  stage.update(frame);
  return presentation;
}
