import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RiggedHand } from './rigged-hand.js';
import {createSandbox} from './sandbox.js';
import {createMouseInput} from './mouse-input.js';
import {snapCutPoint,LAB} from './sandbox-state.js';
import { projectHand, projectTableHand, assignHands, handScreenPosition, PoseStabilizer, HandDistanceScale, cursorHeight } from './hand-pose.js';

function createScalpel() {
  const group=new THREE.Group();
  const steel=new THREE.MeshStandardMaterial({color:'#dce5ec',metalness:.85,roughness:.25});
  const grip=new THREE.MeshStandardMaterial({color:'#344a53',metalness:.35,roughness:.6});
  const handle=new THREE.Mesh(new THREE.BoxGeometry(.115,.75,.065),steel);
  handle.position.y=.02; group.add(handle);
  const pad=new THREE.Mesh(new THREE.BoxGeometry(.12,.36,.072),grip); group.add(pad);
  for(let i=0;i<6;i++) {
    const groove=new THREE.Mesh(new THREE.BoxGeometry(.125,.012,.075),steel);
    groove.position.y=-.14+i*.055; group.add(groove);
  }
  const shape=new THREE.Shape();
  shape.moveTo(-.055,.38);shape.lineTo(.08,.38);shape.lineTo(.08,.64);
  shape.quadraticCurveTo(.06,.84,-.055,.98);shape.lineTo(-.055,.38);
  const blade=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.018,bevelEnabled:false}),steel);
  blade.position.z=-.009;group.add(blade);group.visible=false;
  return group;
}

export async function createHandScene(container) {
  const loader=new GLTFLoader();
  const models=await Promise.all([loader.loadAsync(new URL('./assets/left-hand.glb',import.meta.url).href),loader.loadAsync(new URL('./assets/right-hand.glb',import.meta.url).href)]);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor('#102720');
  renderer.domElement.setAttribute('aria-label', 'Live 3D virtual hands');
  container.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  let inputSource=document.getElementById('input-source').value;
  const sandbox=createSandbox(scene,()=>inputSource);
  const camera = new THREE.PerspectiveCamera(43, 1, .1, 60);
  camera.position.set(0, 5.8, 8.5); camera.lookAt(0, 0, -.4);
  scene.add(new THREE.HemisphereLight('#effff5', '#21483f', 2.6));
  const key = new THREE.DirectionalLight('#ffffff', 3); key.position.set(-3, 5, 6); scene.add(key);
  const rim = new THREE.DirectionalLight('#70edc6', 2); rim.position.set(4, 1, -3); scene.add(rim);
  const grid = new THREE.GridHelper(24, 32, '#396f59', '#254b3c'); grid.position.y = -1.1; scene.add(grid);
  const hands = { Left: new RiggedHand(scene,models[0],'#9cddc5','Left',createScalpel()), Right: new RiggedHand(scene,models[1],'#edca94','Right',createScalpel()) };
  const mouse=createMouseInput(renderer.domElement,camera,()=>inputSource==='mouse');
  let mousePoint=null,mouseMode='hand';
  const mouseTool=createScalpel();scene.add(mouseTool);
  const mouseMove=event=>{
    if(inputSource!=='mouse' || event.detail.source!=='mouse')return;
    mousePoint=event.detail.world;mouseMode=event.detail.mode;
  };
  window.addEventListener('input:move',mouseMove);
  const cursor=new THREE.Group();scene.add(cursor);cursor.visible=false;
  const cursorMaterial=new THREE.MeshBasicMaterial({color:'#d9f868',depthTest:false});
  const dot=new THREE.Mesh(new THREE.SphereGeometry(.065,16,12),cursorMaterial);
  dot.renderOrder=5;cursor.add(dot);
  const footprint=new THREE.Mesh(new THREE.RingGeometry(.09,.13,32),new THREE.MeshBasicMaterial({color:'#d9f868',side:THREE.DoubleSide,transparent:true,opacity:.7}));
  footprint.rotation.x=-Math.PI/2;cursor.add(footprint);
  footprint.material.depthTest=false;footprint.renderOrder=6;
  const crossGeometry=new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-.23,0,0),new THREE.Vector3(-.12,0,0),new THREE.Vector3(.12,0,0),new THREE.Vector3(.23,0,0),
    new THREE.Vector3(0,0,-.23),new THREE.Vector3(0,0,-.12),new THREE.Vector3(0,0,.12),new THREE.Vector3(0,0,.23),
  ]);
  const crosshair=new THREE.LineSegments(crossGeometry,new THREE.LineBasicMaterial({color:'#ffe59a',depthTest:false}));crosshair.renderOrder=6;cursor.add(crosshair);
  let visualSnap=false;
  const stemGeometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
  const stem=new THREE.Line(stemGeometry,new THREE.LineDashedMaterial({color:'#d9f868',dashSize:.08,gapSize:.045,transparent:true,opacity:.75}));cursor.add(stem);
  // Public XYZ: red = across table, green = along table, blue = height.
  const axes=new THREE.Group();
  for(const [end,color] of [[[.3,0,0],'#ed7272'],[[0,0,-.3],'#70d6a1'],[[0,.3,0],'#72b6ff']]) {
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(...end)]),new THREE.LineBasicMaterial({color,depthTest:false}));
    line.renderOrder=5;axes.add(line);
  }
  cursor.add(axes);
  let cursorLabel=null,cursorMode='idle';
  const publishCursor=detail=>window.dispatchEvent(new CustomEvent('tracking:cursor3d',{detail}));
  let latest = null, lastFrame = performance.now(), lastSeen = 0;
  const previous = {}, detectedAt = {};
  const stabilizer=new PoseStabilizer();
  const distanceTracker=new HandDistanceScale();
  let cameraMode='flat';
  let motionSensitivity=1.5;
  let angled=false;
  function updateView() {
    camera.position.set(angled?4:0,cameraMode==='flat'?8:5.8,cameraMode==='flat'?7.5:8.5);
    camera.lookAt(0,0,cameraMode==='flat'?0:-.4);
  }
  updateView();
  const zoomInput=event=>{
    if((event.detail.source||'webcam')!==inputSource)return;
    const target=new THREE.Vector3(0,0,cameraMode==='flat'?0:-.4);
    const offset=camera.position.clone().sub(target),length=THREE.MathUtils.clamp(offset.length()*Math.exp(-event.detail.delta),6,18);
    camera.position.copy(target).add(offset.setLength(length));camera.lookAt(target);mouse.move();
  };
  window.addEventListener('input:zoom',zoomInput);
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  const ray=new THREE.Ray(),plane=new THREE.Plane();
  function screenMappedPose(image,world,aspect,label,distanceScale) {
    if(cameraMode==='flat') return projectTableHand(image,world,aspect,distanceScale,motionSensitivity);
    camera.updateMatrixWorld();
    const pose=projectHand(image,world,aspect,label);
    const screen=handScreenPosition(image,motionSensitivity);
    // Intersect a screen ray with a camera-facing plane. This keeps the travel
    // proportional to the display even when its aspect ratio or view changes.
    const direction=new THREE.Vector3(screen.x*2-1,1-screen.y*2,.5).unproject(camera).sub(camera.position).normalize();
    ray.set(camera.position,direction);
    // Keep a fixed interaction plane; noisy palm-size estimates must not make
    // the rendered hand bob toward and away from the viewing camera.
    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),new THREE.Vector3(0,.15,1.15));
    const destination=ray.intersectPlane(plane,new THREE.Vector3());
    if(!destination) return pose;
    const center=new THREE.Vector3();
    for(const index of [0,5,9,13,17]) center.add(new THREE.Vector3(pose[index].x,pose[index].y,pose[index].z).multiplyScalar(.2));
    const offset=destination.sub(center);
    return pose.map(p=>({x:p.x+offset.x,y:p.y+offset.y,z:p.z+offset.z}));
  }
  renderer.setAnimationLoop(now => {
    const dt = Math.min((now - lastFrame) / 1000, .1); lastFrame = now;
    Object.values(hands).forEach(h => { if (!latest || now - lastSeen > 500) h.group.visible = false; });
    if(inputSource==='webcam' && latest && now-lastSeen>500){sandbox.cancel();publishCursor(null);latest=null;cursorLabel=null;}
    if (inputSource==='webcam' && latest && now - lastSeen <= 500) {
      const seen = new Set();
      latest.landmarks.forEach((image, i) => {
        const label = latest.assignments[i];
        seen.add(label);
        const distanceScale=cameraMode==='flat'?latest.distanceScales[i]:1;
        hands[label].update(screenMappedPose(image, latest.worldLandmarks?.[i], latest.aspect, label,distanceScale), dt, latest.held?.[i],distanceScale);
      });
      Object.entries(hands).forEach(([label, h]) => { if (!seen.has(label) && now-(detectedAt[label]||0)>180) h.group.visible = false; });
    }
    if(inputSource==='mouse')Object.values(hands).forEach(hand=>{hand.group.visible=false;});
    const active=hands[cursorLabel];
    cursor.visible=inputSource==='mouse'?!!mousePoint:!!active?.group.visible;
    if(inputSource==='mouse')cursorMaterial.color.set(mouseMode==='scalpel'?'#ffcc70':'#70e6cf');
    mouseTool.visible=inputSource==='mouse' && mouseMode==='scalpel' && !!mousePoint;
    if(mouseTool.visible){mouseTool.position.set(mousePoint.x,mousePoint.y+.98,mousePoint.z);mouseTool.rotation.z=Math.PI;}
    if(cursor.visible) {
      const grip=inputSource==='webcam'?active.group.localToWorld(active.points[4].clone().lerp(active.points[8],.5)):null;
      const rawTip=inputSource==='mouse'?new THREE.Vector3(mousePoint.x,mousePoint.y,mousePoint.z):cursorMode==='hand'?grip:active.scalpel.visible?active.scalpel.localToWorld(new THREE.Vector3(-.055,.98,0)):active.group.localToWorld(active.points[8].clone());
      const scalpelMode=inputSource==='mouse'?mouseMode==='scalpel':cursorMode==='scalpel';
      const snap=scalpelMode?snapCutPoint(rawTip,visualSnap):{point:rawTip,snapped:false,onGuide:false};
      visualSnap=snap.snapped;
      const tip=new THREE.Vector3(snap.point.x,snap.point.y,snap.point.z);
      if(snap.snapped){
        if(inputSource==='mouse')mouseTool.position.add(tip.clone().sub(rawTip));
        else active.scalpel.position.add(active.group.worldToLocal(tip.clone()).sub(active.group.worldToLocal(rawTip.clone())));
      }
      const color=scalpelMode?(snap.onGuide?'#7dffbd':snap.snapped?'#ffe59a':'#f5c37b'):cursorMode==='hand' || inputSource==='mouse'?'#70e6cf':'#d9f868';
      cursorMaterial.color.set(color);footprint.material.color.set(color);crosshair.material.color.set(color);
      dot.position.copy(tip);axes.position.copy(tip);
      dot.scale.setScalar(scalpelMode?1.35:1);axes.visible=!scalpelMode;
      footprint.position.set(tip.x,scalpelMode?LAB.padY+.025:-1.09,tip.z);footprint.scale.setScalar(scalpelMode?1.75:1);
      crosshair.visible=scalpelMode;crosshair.position.set(tip.x,LAB.padY+.03,tip.z);
      const positions=stemGeometry.attributes.position;
      positions.setXYZ(0,tip.x,scalpelMode?LAB.padY+.025:-1.09,tip.z);positions.setXYZ(1,rawTip.x,rawTip.y,rawTip.z);
      positions.needsUpdate=true;stem.computeLineDistances();stem.frustumCulled=false;
      publishCursor({label:inputSource==='mouse'?'Mouse':cursorLabel,z:cursorHeight(tip.y),world:{x:tip.x,y:tip.y,z:tip.z},rawWorld:{x:rawTip.x,y:rawTip.y,z:rawTip.z},gripWorld:grip?{x:grip.x,y:grip.y,z:grip.z}:null});
    }else{visualSnap=false;}
    sandbox.update(dt);
    renderer.render(scene, camera);
  });
  return {
    setMotionSensitivity(value){motionSensitivity=THREE.MathUtils.clamp(Number(value)||1.5,.75,2.5);},
    setInputSource(source){mouse.cancel();sandbox.cancel();inputSource=source;mousePoint=null;this.clear();},
    setMouseTool(tool){return mouse.setTool(tool);},
    setMouseHeight(value){mouse.setHeight(value);},
    resetSandbox(){mouse.cancel();sandbox.reset();},
    setCursor(label,mode) {cursorLabel=label;cursorMode=mode;cursorMaterial.color.set(mode==='scalpel'?'#ffcc70':mode==='hand'?'#70e6cf':'#d9f868');},
    setCameraMode(mode) {cameraMode=mode;this.clear();updateView();},
    resetHandSize() {distanceTracker.reset();},
    setScalpel(label) { Object.entries(hands).forEach(([name,hand])=>{hand.scalpel.visible=name===label;}); },
    update(result, aspect, held) {
      const now=performance.now();
      for(const label of ['Left','Right']) if(now-(detectedAt[label]||0)>300) delete previous[label];
      const assignments=assignHands(result.landmarks,result.handedness.map(h=>h[0]?.categoryName),previous);
      const filtered=assignments.map((label,i)=>stabilizer.update(label,result.landmarks[i],result.worldLandmarks?.[i],now));
      const distanceScales=assignments.map((label,i)=>distanceTracker.update(label,filtered[i].image,filtered[i].world,aspect,now));
      assignments.forEach((label,i)=>{ previous[label]={...result.landmarks[i][0]}; detectedAt[label]=now; });
      latest = { ...result, landmarks:filtered.map(p=>p.image), worldLandmarks:filtered.map(p=>p.world), aspect, assignments, held,distanceScales }; lastSeen = now;
    },
    clear() { latest = null;visualSnap=false;sandbox.cancel();cursor.visible=false;cursorLabel=null;publishCursor(null); stabilizer.reset();distanceTracker.reset(); for(const label of ['Left','Right']) { delete previous[label]; delete detectedAt[label]; hands[label].group.visible=false; hands[label].scalpel.visible=false; } },
    setAngle(value) { angled=value;updateView(); },
    dispose() {
      mouse.dispose();sandbox.dispose();window.removeEventListener('input:move',mouseMove);window.removeEventListener('input:zoom',zoomInput);
      observer.disconnect(); renderer.setAnimationLoop(null);
      scene.traverse(object => { object.geometry?.dispose(); if (object.material) object.material.dispose(); });
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
