import * as THREE from 'three';
import {SandboxState,LAB,guide} from './sandbox-state.js';

export function createSandbox(scene,source){
  const state=new SandboxState(),root=new THREE.Group();scene.add(root);
  const material=(color,roughness=.65)=>new THREE.MeshStandardMaterial({color,roughness});
  const cube=new THREE.Mesh(new THREE.BoxGeometry(.65,.65,.65),material('#e8b771',.4));root.add(cube);
  const edge=new THREE.LineSegments(new THREE.EdgesGeometry(cube.geometry),new THREE.LineBasicMaterial({color:'#fff1c8'}));cube.add(edge);
  const pad=new THREE.Mesh(new THREE.BoxGeometry(3.8,.18,1.8),material('#b57272'));
  pad.position.set(0,LAB.padY-.09,LAB.padZ);root.add(pad);
  const tray=new THREE.Mesh(new THREE.BoxGeometry(1.95,.14,1.95),material('#6d8c8b',.3));tray.position.set(LAB.trayX,LAB.trayY-.07,LAB.trayZ);root.add(tray);
  for(const [x,z,w,d] of [[-.95,0,.08,1.95],[.95,0,.08,1.95],[0,-.95,1.95,.08],[0,.95,1.95,.08]]){
    const rail=new THREE.Mesh(new THREE.BoxGeometry(w,.17,d),material('#a7c9c3',.3));rail.position.set(LAB.trayX+x,LAB.trayY+.05,LAB.trayZ+z);root.add(rail);
  }
  const target=new THREE.Mesh(new THREE.RingGeometry(.48,.51,48),new THREE.MeshBasicMaterial({color:'#b5e1c8',side:THREE.DoubleSide}));target.rotation.x=-Math.PI/2;target.position.set(LAB.trayX,LAB.trayY+.006,LAB.trayZ);root.add(target);
  const bandPositions=[];
  for(let i=1;i<guide.length;i++){
    const a=guide[i-1],b=guide[i];
    for(const p of [{x:a.x,z:a.z-.2},{x:b.x,z:b.z-.2},{x:a.x,z:a.z+.2},{x:a.x,z:a.z+.2},{x:b.x,z:b.z-.2},{x:b.x,z:b.z+.2}])bandPositions.push(p.x,LAB.padY+.008,p.z);
  }
  const bandGeometry=new THREE.BufferGeometry();bandGeometry.setAttribute('position',new THREE.Float32BufferAttribute(bandPositions,3));
  const band=new THREE.Mesh(bandGeometry,new THREE.MeshBasicMaterial({color:'#ffe59a',transparent:true,opacity:.25,side:THREE.DoubleSide,depthWrite:false}));root.add(band);
  const dots=guide.map(p=>{const dot=new THREE.Mesh(new THREE.SphereGeometry(.045,12,8),new THREE.MeshBasicMaterial({color:'#fff0b2'}));dot.position.set(p.x,LAB.padY+.025,p.z);root.add(dot);return dot;});
  const nextDot=new THREE.Mesh(new THREE.SphereGeometry(.075,16,10),new THREE.MeshBasicMaterial({color:'#ffffff'}));root.add(nextDot);
  const strokeGeometry=new THREE.BufferGeometry();
  const strokePositions=new Float32Array(1800*18);strokeGeometry.setAttribute('position',new THREE.BufferAttribute(strokePositions,3));strokeGeometry.setDrawRange(0,0);
  const strokes=new THREE.Mesh(strokeGeometry,new THREE.MeshBasicMaterial({color:'#8f243e',side:THREE.DoubleSide}));strokes.frustumCulled=false;root.add(strokes);
  const handlers=[];
  const listen=(name,fn)=>{const handler=e=>{if((e.detail?.source||'webcam')===source())fn(e.detail);};window.addEventListener(name,handler);handlers.push([name,handler]);};
  const point=detail=>detail.world||{x:(detail.x-.5)*8,y:detail.z*3.2-1.1,z:(detail.y-.5)*8};
  listen('input:move',detail=>{if(detail.mode==='idle' && detail.lost){state.cancel();return;}state.move(point(detail),detail.mode);});
  listen('input:pinchstart',detail=>state.beginPinch(point(detail),(detail.source||'webcam')==='webcam' ? .38 : .23));
  listen('input:pinchend',()=>state.release());
  listen('input:cutstart',detail=>{state.move(point(detail),'scalpel');state.startCut();});
  listen('input:cutend',()=>state.endCut());
  let lastSummary='';
  function update(dt){
    state.tick(dt);cube.position.set(state.cube.x,state.cube.y,state.cube.z);
    cube.material.color.set(state.grabbed?'#65d6ba':state.nearCube?'#ffe087':state.placed?'#8bdba2':'#e8b771');
    cube.material.emissive.set(state.nearCube?'#3b2610':'#000000');
    tray.material.color.set(state.grabbed && state.onTray?'#4dbb95':state.placed?'#4b977c':'#6d8c8b');
    pad.material.color.set(state.snapped?'#dca69b':state.cutComplete?'#77aa8c':'#b57272');
    pad.material.emissive.set(state.snapped?'#281413':'#000000');
    band.material.color.set(state.onGuide?'#77ffc6':'#ffe59a');
    dots.forEach((dot,i)=>dot.material.color.set(state.covered.has(i)?'#66eeaf':'#fbe3b5'));
    const next=guide.find((_,i)=>!state.covered.has(i));nextDot.visible=!!next;
    if(next){nextDot.position.set(next.x,LAB.padY+.05,next.z);nextDot.scale.setScalar(1+Math.sin(performance.now()*.005)*.15);}
    let vertices=0;
    for(let i=1;i<state.strokes.length;i++){
      if(state.strokes[i].break)continue;
      const a=state.strokes[i-1],b=state.strokes[i],length=Math.hypot(b.x-a.x,b.z-a.z);
      if(length<.0001)continue;
      const dx=-(b.z-a.z)/length*.027,dz=(b.x-a.x)/length*.027;
      for(const [p,sign] of [[a,-1],[b,-1],[a,1],[a,1],[b,-1],[b,1]]){strokePositions[vertices*3]=p.x+dx*sign;strokePositions[vertices*3+1]=LAB.padY+.018;strokePositions[vertices*3+2]=p.z+dz*sign;vertices++;}
    }
    strokeGeometry.attributes.position.needsUpdate=true;strokeGeometry.setDrawRange(0,vertices);
    const hint=state.snapped?(state.onGuide?(state.cutting?'On guide — keep tracing the glowing lane.':'Surface locked. Drag along the glowing lane to cut.'):'Surface locked — move the ring onto the dotted guide.'):state.cutting?'Move over the practice pad and lower slightly to snap onto it.':state.nearCube && !state.grabbed?'Cube within reach. Pinch or drag to grab.':state.message;
    const summary={placed:state.placed,cutComplete:state.cutComplete,progress:Math.round(state.progress*100),grabbed:state.grabbed,touching:state.touchingPad&&state.cutting,snapped:state.snapped,onGuide:state.onGuide,cutting:state.cutting,message:state.cutComplete?state.message:hint};
    const key=JSON.stringify(summary);if(key!==lastSummary){lastSummary=key;window.dispatchEvent(new CustomEvent('sandbox:change',{detail:summary}));}
  }
  return {state,update,reset(){state.reset();lastSummary='';},cancel(){state.cancel();},dispose(){handlers.forEach(([name,handler])=>window.removeEventListener(name,handler));root.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});root.removeFromParent();}};
}
