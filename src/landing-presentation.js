import { landingFrame } from './landing-motion.js';

// Input stays locked during the Blender preview and the button-driven handoff.
// Physics resumes once the live specimen is at its exact bench transform.
export async function createLandingPresentation(bench,specimen,{glass}={}) {
  const embedded=parent!==window&&new URLSearchParams(location.search).get('embed')==='landing';
  if(!embedded)return {paused:false,locked:false,ready(){},update(){},getDebug:()=>null};
  document.documentElement.classList.add('landing-preview');
  const {createLandingScene}=await import('./landing-scene.js');
  const stage=await createLandingScene(bench,specimen);
  const startButton=window.frameElement?.ownerDocument.querySelector('.start-dissection');
  glass?.addPanel(startButton);
  let frame=landingFrame(0),active=false,idleTime=0;
  let still=matchMedia('(prefers-reduced-motion: reduce)').matches;
  bench.controls.enabled=false;
  const presentation={
    paused:false,locked:true,needsRender:true,
    ready(){parent.postMessage({type:'scalpless:lab-ready'},location.origin);},
    update(dt=0){
      if(!active){
        if(!still&&frame.entryProgress===0)idleTime+=dt;
        // A slow ±6° sway settles before the model handoff begins.
        const settle=Math.min(1,frame.entryProgress/.4);
        const idleRotation=still?0:Math.sin(idleTime*.5)*.1*(1-settle*settle*(3-2*settle));
        stage.update({...frame,idleRotation});
      }
      presentation.needsRender=!active&&!still&&frame.entryProgress===0;
    },
    getDebug:()=>({...stage.getDebug(),active}),
  };
  addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='scalpless:landing-frame')return;
    const nextActive=event.data.active===true;
    still=event.data.still===true;
    frame=landingFrame(event.data.progress,{still,entry:event.data.entryProgress});
    // Entry must always land at the exact final pose, including hash reload.
    if(nextActive)frame=landingFrame(1,{entry:1});
    if(active!==nextActive){
      if(nextActive){stage.update(frame);stage.finish();bench.controls.update();}
      else idleTime=0;
      active=nextActive;presentation.locked=!active;bench.controls.enabled=active;
      document.documentElement.classList.toggle('landing-preview',!active);
    }
    presentation.needsRender=true;
  });
  const resize=new ResizeObserver(()=>{presentation.needsRender=true;});
  resize.observe(bench.host);
  if(startButton)resize.observe(startButton);
  stage.update(frame);
  return presentation;
}
