import * as THREE from 'three';
import {LAB,snapCutPoint} from './sandbox-state.js';

export function createMouseInput(canvas,camera,enabled){
  let tool='hand',height=.11,last=null,dragging=false,surfaceAttached=false;
  const ray=new THREE.Raycaster(),plane=new THREE.Plane(),listeners=[];
  const emit=(type,world)=>window.dispatchEvent(new CustomEvent(`input:${type}`,{detail:{x:Math.max(0,Math.min(1,world.x/8+.5)),y:Math.max(0,Math.min(1,world.z/8+.5)),z:height,world:{x:world.x,y:world.y,z:world.z},mode:tool,source:'mouse'}}));
  function position(){
    if(!last)return null;
    const box=canvas.getBoundingClientRect();camera.updateMatrixWorld();
    ray.setFromCamera(new THREE.Vector2((last.x-box.left)/box.width*2-1,1-(last.y-box.top)/box.height*2),camera);
    plane.set(new THREE.Vector3(0,1,0),-(height*3.2-1.1));
    const point=ray.ray.intersectPlane(plane,new THREE.Vector3());
    if(point && tool==='scalpel'){
      plane.set(new THREE.Vector3(0,1,0),-LAB.padY);
      const surface=ray.ray.intersectPlane(plane,new THREE.Vector3());
      if(surface){
        const candidate={x:surface.x,y:point.y,z:surface.z};
        const snap=snapCutPoint(candidate,surfaceAttached);surfaceAttached=snap.snapped;
        if(snap.snapped)return new THREE.Vector3(candidate.x,candidate.y,candidate.z);
      }
    }else surfaceAttached=false;
    return point;
  }
  function move(){const world=position();if(enabled()&&world)emit('move',world);}
  function end(){if(!dragging)return;const world=position();dragging=false;if(world)emit(tool==='hand'?'pinchend':'cutend',world);}
  const on=(target,name,fn,options)=>{target.addEventListener(name,fn,options);listeners.push([target,name,fn,options]);};
  on(canvas,'pointermove',event=>{if(!enabled())return;last={x:event.clientX,y:event.clientY};move();});
  on(canvas,'pointerdown',event=>{
    if(!enabled() || event.button!==0)return;
    event.preventDefault();canvas.focus({preventScroll:true});last={x:event.clientX,y:event.clientY};move();
    const world=position();if(!world)return;dragging=true;canvas.setPointerCapture(event.pointerId);emit(tool==='hand'?'pinchstart':'cutstart',world);
  });
  on(canvas,'pointerup',end);on(canvas,'pointercancel',end);on(canvas,'lostpointercapture',end);
  on(canvas,'wheel',event=>{if(!enabled())return;event.preventDefault();window.dispatchEvent(new CustomEvent('input:zoom',{detail:{delta:Math.max(-.15,Math.min(.15,-event.deltaY*.001)),source:'mouse'}}));},{passive:false});
  on(window,'blur',end);
  canvas.tabIndex=0;canvas.style.touchAction='none';
  return {
    setTool(value){end();tool=value;surfaceAttached=false;height=tool==='scalpel' ? .072 : .11;move();return height;},
    setHeight(value){height=Math.max(0,Math.min(1,Number(value)));move();},
    move,cancel:end,
    dispose(){end();listeners.forEach(([target,name,fn,options])=>target.removeEventListener(name,fn,options));},
  };
}
