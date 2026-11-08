import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RiggedHand} from '../rigged-hand.js';
import {projectTableHand,projectHand} from '../hand-pose.js';
import {GestureSession} from './gesture-session.js';
import {mapGesturePointer,heightFromHandScale} from './gesture-mapping.js';

const edges=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];

export function installGestureCamera(bench,lab){
  const $=id=>document.getElementById(id),video=$('gesture-video'),overlay=$('gesture-overlay'),ctx=overlay.getContext('2d');
  const session=new GestureSession();
  const cursor=new THREE.Mesh(new THREE.SphereGeometry(.0019,16,10),new THREE.MeshBasicMaterial({color:'#37debe',depthTest:false}));
  cursor.renderOrder=30;cursor.visible=false;bench.scene.add(cursor);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.0038,.0055,32),new THREE.MeshBasicMaterial({color:'#37debe',side:THREE.DoubleSide,depthTest:false}));
  ring.renderOrder=30;ring.visible=false;bench.scene.add(ring);
  const hands={};let viewPromise,model,stream,running=false,starting=false,requestId=0,raf,lastVideo=-1,lastDetection=0;
  const button=$('gesture-toggle'),feedback=$('gesture-feedback');
  async function loadViews(){
    if(!viewPromise)viewPromise=(async()=>{
      const loader=new GLTFLoader();
      const models=await Promise.all([loader.loadAsync(new URL('../assets/left-hand.glb',import.meta.url).href),loader.loadAsync(new URL('../assets/right-hand.glb',import.meta.url).href)]);
      ['Left','Right'].forEach((label,i)=>{
        const hand=new RiggedHand(bench.scene,models[i],i?'#b6d4ee':'#83d5cb',label,new THREE.Group(),{unitScale:.045});
        hand.mesh.material.transparent=true;hand.mesh.material.opacity=.42;hand.mesh.material.depthWrite=false;
        hands[label]=hand;
      });
    })().catch(error=>{viewPromise=null;console.error('Hand model unavailable',error);});
    return viewPromise;
  }
  function hideHands(){cursor.visible=ring.visible=false;Object.values(hands).forEach(hand=>{hand.group.visible=false;});}
  function reset(){session.reset();hideHands();lab.gesturePinchHeld=false;}
  function stop(message='Webcam off. Mouse and keyboard controls are ready.'){
    requestId++;running=false;starting=false;cancelAnimationFrame(raf);
    stream?.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;lastVideo=-1;
    reset();bench.gesturesActive=false;bench.host.dataset.input='mouse';
    ctx.clearRect(0,0,overlay.width,overlay.height);$('gesture-preview').hidden=true;
    button.disabled=false;button.textContent='Enable webcam';button.setAttribute('aria-pressed','false');
    feedback.textContent=message;$('gesture-readout').textContent='Mouse / keyboard';
  }
  function draw(raw){
    ctx.clearRect(0,0,overlay.width,overlay.height);ctx.lineWidth=2.5;
    raw.landmarks.forEach((hand,index)=>{
      ctx.strokeStyle=index?'#ffd39b':'#81f2d2';ctx.fillStyle=ctx.strokeStyle;
      for(const [a,b] of edges){ctx.beginPath();ctx.moveTo(hand[a].x*overlay.width,hand[a].y*overlay.height);ctx.lineTo(hand[b].x*overlay.width,hand[b].y*overlay.height);ctx.stroke();}
      for(const p of hand){ctx.beginPath();ctx.arc(p.x*overlay.width,p.y*overlay.height,3,0,Math.PI*2);ctx.fill();}
    });
  }
  function loop(){
    if(!running)return;
    try{
      if(video.readyState>=2 && video.currentTime!==lastVideo){
        lastVideo=video.currentTime;const now=performance.now();
        const raw=model.detectForVideo(video,now);lastDetection=now;
        const state=session.process(raw,now,video.videoWidth/video.videoHeight);draw(raw);
        const text=state.point?`${state.gesture} · Z ${Math.round(state.point.z*100)}%`:state.gesture;
        if($('gesture-readout').textContent!==text)$('gesture-readout').textContent=text;
        const help=state.hands?'Pinch to grasp and peel. Extend only index to cut.':'Hover your hand in view; keep fingers separated.';
        if(feedback.textContent!==help)feedback.textContent=help;
      }else if(performance.now()-lastDetection>500){reset();}
      raf=requestAnimationFrame(loop);
    }catch(error){stop(`Tracking stopped: ${error.message}. Mouse controls are available.`);console.error(error);}
  }
  async function start(){
    if(running || starting)return;
    const id=++requestId;starting=true;button.disabled=true;button.textContent='Starting…';feedback.textContent='Loading hand tracking, then requesting camera access…';
    try{
      if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)throw new Error('Use localhost or HTTPS for webcam access');
      loadViews();
      if(!model){
        const version='0.10.22-rc.20250304';
        const sdk=await import(/* @vite-ignore */ `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}/vision_bundle.mjs`);
        const vision=await sdk.FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}/wasm`);
        const options={baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.6,minHandPresenceConfidence:.6,minTrackingConfidence:.6};
        try{model=await sdk.HandLandmarker.createFromOptions(vision,options);}catch{options.baseOptions.delegate='CPU';model=await sdk.HandLandmarker.createFromOptions(vision,options);}
      }
      if(id!==requestId)return;
      const cameraStream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:960},height:{ideal:720},facingMode:'user'},audio:false});
      if(id!==requestId){cameraStream.getTracks().forEach(track=>track.stop());return;}
      stream=cameraStream;video.srcObject=stream;await video.play();
      if(id!==requestId)return;
      overlay.width=video.videoWidth;overlay.height=video.videoHeight;
      running=true;starting=false;bench.gesturesActive=true;bench.host.dataset.input='webcam';lastDetection=performance.now();
      lab.endCut();lab.endGrab();lab.gesturePinchHeld=false;
      $('gesture-preview').hidden=false;button.disabled=false;button.textContent='Stop webcam';button.setAttribute('aria-pressed','true');
      stream.getVideoTracks()[0].addEventListener('ended',()=>{if(running)stop('Camera disconnected. Mouse controls are ready.');});
      loop();
    }catch(error){
      if(id!==requestId)return;
      const message=error.name==='NotAllowedError'?'Camera access denied. Allow it in the browser and retry.':error.name==='NotFoundError'?'No webcam found. Connect a camera and retry.':error.message;
      stop(`${message} Mouse controls are available.`);
    }
  }
  function pointerWorld(pointer){
    if(!lab.pointerRay(pointer))return null;
    const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(bench.camera.getWorldDirection(new THREE.Vector3()),bench.controls.target);
    const point=lab.raycaster.ray.intersectPlane(plane,new THREE.Vector3());
    if(point)point.y+=(pointer.z-.5)*.16;
    return point;
  }
  function update(dt){
    if(!running || !session.frame?.hands.length){hideHands();return;}
    const frame=session.frame,seen=new Set(),primary=session.tracker.primaryLabel;
    frame.hands.forEach((hand,i)=>{
      const label=frame.labels[i],view=hands[label];seen.add(label);
      const isPrimary=label===primary;
      const point=isPrimary?session.pointer:mapGesturePointer({x:1-hand.image[8].x,y:hand.image[8].y,z:heightFromHandScale(frame.scales[i])},session.movementGain);
      if(!point)return;
      const target=isPrimary?(lab.held?.point||lab.hover?.point||pointerWorld(point)):pointerWorld(point);
      if(!target)return;
      if(view && $('gesture-show-hands').checked){
        const pose=(session.flat?projectTableHand(hand.image,hand.world,frame.aspect):projectHand(hand.image,hand.world,frame.aspect,label)).map(p=>({x:p.x*.045,y:p.y*.045,z:p.z*.045}));
        view.update(pose,dt,frame.held[i],frame.scales[i]);
        const control=session.frame.state.mode==='hand' && isPrimary?view.points[4].clone().lerp(view.points[8],.5):view.points[8].clone();
        const actual=view.group.localToWorld(control);
        view.group.position.add(target.clone().sub(actual));
      }else if(view)view.group.visible=false;
      if(isPrimary){
        const locked=Boolean(lab.hover||lab.held);cursor.visible=true;ring.visible=locked;
        const color=lab.cutting?'#36e5bd':lab.held?'#4bd8ec':locked?'#71edcf':'#ffca80';
        cursor.material.color.set(color);ring.material.color.set(color);cursor.position.copy(target);
        ring.position.copy(target);ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),lab.hover?.normal||bench.camera.getWorldDirection(new THREE.Vector3()).negate());
      }
    });
    Object.entries(hands).forEach(([label,hand])=>{if(!seen.has(label))hand.group.visible=false;});
  }
  button.addEventListener('click',()=>running?stop():start());
  $('gesture-mode').addEventListener('change',()=>{reset();session.flat=$('gesture-mode').value==='flat';});
  $('gesture-rotation').addEventListener('change',()=>{reset();session.rotation=Number($('gesture-rotation').value);});
  $('gesture-motion').addEventListener('input',event=>{session.movementGain=Number(event.target.value);$('gesture-motion-value').textContent=`${session.movementGain.toFixed(2)}×`;});
  $('gesture-calibrate').addEventListener('click',()=>{session.distance.reset();feedback.textContent='Neutral height set. Lift away from the lens to raise held tissue.';});
  document.addEventListener('visibilitychange',()=>{if(document.hidden && (running||starting))stop();});
  window.addEventListener('pagehide',()=>{stop();model?.close();model=null;});
  return {update,reset,stop,getDebug:()=>({active:running,starting,hands:session.frame?.labels||[],modelsLoaded:Object.keys(hands).length,visibleHands:Object.entries(hands).filter(([,hand])=>hand.group.visible).map(([label])=>label),gesture:session.frame?.state.gesture||'Off',pointer:session.pointer})};
}
