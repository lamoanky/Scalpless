export const LAB={floor:-1.1,cubeHalf:.325,padY:-.88,padZ:-1.25,trayX:2.25,trayZ:1.15,trayY:-.96};
export const guide=Array.from({length:41},(_,i)=>({x:-1.5+i*3/40,z:LAB.padZ+Math.sin(i/40*Math.PI)*.16}));
const copy=p=>({x:p.x,y:p.y,z:p.z});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

export function nearestCutGuide(point){
  let best={distance:Infinity,x:point.x,z:point.z};
  for(let i=1;i<guide.length;i++){
    const a=guide[i-1],b=guide[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(dx*dx+dz*dz)));
    const x=a.x+dx*t,z=a.z+dz*t,distance=Math.hypot(point.x-x,point.z-z);
    if(distance<best.distance)best={distance,x,z};
  }
  return best;
}

export function snapCutPoint(point,wasSnapped=false){
  const inside=Math.abs(point.x)<=1.85 && Math.abs(point.z-LAB.padZ)<=.85;
  const snapped=inside && Math.abs(point.y-LAB.padY)<=(wasSnapped ? .95 : .65);
  const adjusted={...point,y:snapped?LAB.padY:point.y};
  return {point:adjusted,snapped,onGuide:snapped && nearestCutGuide(adjusted).distance<.2};
}

export class SandboxState {
  constructor(){this.reset();}
  reset(){
    this.cube={x:-2.25,y:LAB.floor+LAB.cubeHalf,z:1.15};this.cursor=null;
    this.grabbed=false;this.pinchHeld=false;this.reach=.23;this.cutting=false;this.placed=false;this.falling=false;this.velocity=0;
    this.covered=new Set();this.strokes=[];this.previousCut=null;this.tool='hand';this.snapped=false;this.onGuide=false;this.rawCursor=null;this.message='Grab the cube and drop it in the tray.';
  }
  get progress(){return this.covered.size/guide.length;}
  get cutComplete(){return this.progress>=.9;}
  get nearCube(){return !!this.cursor && Math.hypot(...['x','y','z'].map(axis=>Math.max(0,Math.abs(this.cursor[axis]-this.cube[axis])-LAB.cubeHalf)))<this.reach;}
  get onTray(){return Math.abs(this.cube.x-LAB.trayX)<.58 && Math.abs(this.cube.z-LAB.trayZ)<.58;}
  get touchingPad(){return !!this.cursor && Math.abs(this.cursor.y-LAB.padY)<.2 && Math.abs(this.cursor.x)<1.85 && Math.abs(this.cursor.z-LAB.padZ)<.85;}
  move(point,tool=this.tool){
    if(!point || !['x','y','z'].every(k=>Number.isFinite(point[k]))) return;
    this.rawCursor=copy(point);this.tool=tool;
    const snap=tool==='scalpel' || this.cutting?snapCutPoint(point,this.snapped):{point,snapped:false,onGuide:false};
    this.snapped=snap.snapped;this.onGuide=snap.onGuide;point=snap.point;
    this.cursor=copy(point);
    if(this.pinchHeld && !this.grabbed)this.grab();
    if(this.grabbed){
      this.cube={x:Math.max(-3.8,Math.min(3.8,point.x+this.offset.x)),y:Math.max(LAB.floor+LAB.cubeHalf,Math.min(2.5,point.y+this.offset.y)),z:Math.max(-3.5,Math.min(3.5,point.z+this.offset.z))};
    }
    if(this.cutting)this.cutAt(point);
  }
  grab(){
    if(this.grabbed || !this.nearCube)return false;
    this.offset={x:this.cube.x-this.cursor.x,y:this.cube.y-this.cursor.y,z:this.cube.z-this.cursor.z};
    this.grabbed=true;this.falling=false;this.velocity=0;this.message='Cube grabbed. Move it over the tray, then release.';return true;
  }
  beginPinch(point,reach=.23){this.endCut();this.reach=reach;this.pinchHeld=true;this.move(point,'hand');if(!this.grabbed)this.message='Pinch held. Move your thumb and index toward the cube to pick it up.';}
  release(){
    this.pinchHeld=false;
    if(!this.grabbed)return;
    this.grabbed=false;this.falling=true;this.velocity=0;this.message=this.onTray?'Dropping into the tray…':'Cube released. Drop it inside the tray to finish the grab task.';
  }
  startCut(){this.release();this.cutting=true;this.tool='scalpel';this.previousCut=null;if(this.rawCursor)this.move(this.rawCursor,'scalpel');}
  endCut(){this.cutting=false;this.previousCut=null;}
  cutAt(point){
    if(!this.touchingPad){this.previousCut=null;return;}
    const previous=this.previousCut;
    // Interpolate real strokes, but never draw across a tracking teleport.
    const steps=previous && distance(previous,point)<.85?Math.max(1,Math.ceil(distance(previous,point)/.04)):1;
    for(let i=1;i<=steps;i++){
      const t=i/steps,p=previous && steps>1?{x:previous.x+(point.x-previous.x)*t,y:point.y,z:previous.z+(point.z-previous.z)*t}:copy(point);
      this.strokes.push({x:p.x,y:LAB.padY+.012,z:p.z,break:(!previous || steps===1 && distance(previous,point)>=.85)&&i===1});
      guide.forEach((g,index)=>{if(Math.hypot(p.x-g.x,p.z-g.z)<.17)this.covered.add(index);});
    }
    this.strokes=this.strokes.slice(-1800);this.previousCut=copy(point);
    this.message=this.cutComplete?(this.placed?'Both tasks complete. Reset to practice again.':'Cut complete! The guide has been traced.'):'Blade touching pad. Follow the dotted line.';
  }
  tick(dt){
    if(!this.falling)return;
    this.velocity-=9.8*Math.min(dt,.05);this.cube.y+=this.velocity*Math.min(dt,.05);
    const floor=(this.onTray?LAB.trayY:LAB.floor)+LAB.cubeHalf;
    if(this.cube.y<=floor){this.cube.y=floor;this.falling=false;if(this.onTray){this.placed=true;this.message=this.cutComplete?'Both tasks complete. Reset to practice again.':'Cube placed! Select the scalpel and trace the pad guide.';}}
  }
  cancel(){this.release();this.endCut();this.cursor=null;this.rawCursor=null;this.snapped=false;this.onGuide=false;this.tool='idle';}
}
