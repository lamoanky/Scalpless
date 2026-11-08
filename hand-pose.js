// World landmarks provide articulation; a palm-local frame aims hands inward.
// Webcam depth is estimated from apparent palm size, not measured by a depth sensor.
export function projectHand(image, world, aspect = 4 / 3, handedness = 'Left') {
  const wrist = image[0];
  const palmSize = Math.max(0.04, Math.hypot(image[9].x - wrist.x, image[9].y - wrist.y));
  const depth = Math.max(-1.2, Math.min(1.2, (palmSize - 0.18) * 7));
  const local = image.map((p, i) => world?.[i] ? {
    x: -(world[i].x - world[0].x) * 14,
    y: -(world[i].y - world[0].y) * 14,
    z: (world[i].z - world[0].z) * 14,
  } : {
    x: -(p.x - wrist.x) * 6 * aspect,
    y: -(p.y - wrist.y) * 6,
    z: (p.z - wrist.z) * 6 * aspect,
  });
  // Rebase the entire pose into a palm-local frame: finger articulation survives,
  // while a camera-facing palm becomes a first-person hand over the workbench.
  const dot = (a, b) => a.x*b.x + a.y*b.y + a.z*b.z;
  const sub = (a, b) => ({ x:a.x-b.x, y:a.y-b.y, z:a.z-b.z });
  const unit = (p, fallback) => {
    const length = Math.hypot(p.x,p.y,p.z);
    return length < 1e-6 ? fallback : {x:p.x/length,y:p.y/length,z:p.z/length};
  };
  const cross = (a,b) => ({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
  const along = unit(local[9], {x:0,y:1,z:0});
  const rawAcross = sub(local[5], local[17]);
  const parallel = dot(rawAcross, along);
  const across = unit({x:rawAcross.x-along.x*parallel,y:rawAcross.y-along.y*parallel,z:rawAcross.z-along.z*parallel}, Math.abs(along.x) < .9 ? unit(cross(along,{x:0,y:0,z:1}),{x:1,y:0,z:0}) : {x:0,y:1,z:0});
  const normal = unit(cross(across,along), {x:0,y:0,z:1});
  const side = handedness === 'Right' ? 1 : -1;
  // Preserve roll relative to camera horizontal instead of erasing it by
  // rebuilding a fixed palm frame. Positive z keeps the pose's handedness:
  // negating all three axes previously reflected the palm and finger curls.
  const horizontal = {x:-side,y:0,z:0};
  const hAlong = dot(horizontal,along);
  const reference = unit({x:horizontal.x-along.x*hAlong,y:-along.y*hAlong,z:-along.z*hAlong}, across);
  const roll = Math.atan2(dot(cross(reference,across),along),dot(reference,across));
  const forward = unit({x:-side*.38,y:-.12,z:-1});
  const targetAcross = unit({x:-side,y:0,z:.38});
  const targetNormal = unit(cross(targetAcross,forward));
  // Re-orthogonalize to preserve segment lengths and pinch distances.
  const targetForward = unit(cross(targetNormal,targetAcross));
  const rolledAcross = {
    x:targetAcross.x*Math.cos(roll)-targetNormal.x*Math.sin(roll),
    y:targetAcross.y*Math.cos(roll)-targetNormal.y*Math.sin(roll),
    z:targetAcross.z*Math.cos(roll)-targetNormal.z*Math.sin(roll),
  };
  const rolledNormal = cross(rolledAcross,targetForward);
  const anchor = {
    x: side*1.65 + Math.max(-1.1,Math.min(1.1,(.5-wrist.x)*2.8)),
    y: .15 + Math.max(-.6,Math.min(.8,(.55-wrist.y)*1.8)),
    z: 1.65 - depth*.5,
  };
  return local.map(p => {
    const u=dot(p,across), v=dot(p,along), n=dot(p,normal);
    return {
      x:anchor.x+u*rolledAcross.x+v*targetForward.x+n*rolledNormal.x,
      y:anchor.y+u*rolledAcross.y+v*targetForward.y+n*rolledNormal.y,
      z:anchor.z+u*rolledAcross.z+v*targetForward.z+n*rolledNormal.z,
    };
  });
}

// Match both detections together; one noisy handedness label must not swap arms.
export function assignHands(landmarks, labels, previous = {}) {
  if (!landmarks.length) return [];
  const cost = (index, label) => {
    const wrist=landmarks[index][0], last=previous[label];
    const motion=last ? Math.hypot(wrist.x-last.x,wrist.y-last.y) : 0;
    return motion + (labels[index]===label ? 0 : last ? .035 : .5);
  };
  if (landmarks.length===1) return [cost(0,'Left')<=cost(0,'Right')?'Left':'Right'];
  return cost(0,'Left')+cost(1,'Right')<=cost(0,'Right')+cost(1,'Left') ? ['Left','Right'] : ['Right','Left'];
}

// Use the palm center instead of the wrist so a rotation doesn't sweep the hand
// across the display. Preserve almost the full camera range with a small margin.
export function handScreenPosition(image,sensitivity=1) {
  const indices=[0,5,9,13,17];
  const center=indices.reduce((sum,i)=>({x:sum.x+image[i].x/5,y:sum.y+image[i].y/5}),{x:0,y:0});
  const bounded=n=>Math.max(0,Math.min(1,n));
  const x=bounded(.5+(center.x-.5)*sensitivity),y=bounded(.5+(center.y-.5)*sensitivity);
  return {x:.08+.84*(1-x), y:.1+.8*y};
}

// Looking upward requires a half-turn from the camera-facing coordinate frame:
// negative camera depth points DOWN toward the lens, not up through the palm.
export function projectTableHand(image,world,aspect=4/3,distanceScale=1,sensitivity=1) {
  const center=[0,5,9,13,17].reduce((s,i)=>({x:s.x+image[i].x/5,y:s.y+image[i].y/5}),{x:0,y:0});
  const gain=n=>Math.max(-.5,Math.min(.5,(n-.5)*sensitivity));
  const anchor={x:-gain(center.x)*8,z:gain(center.y)*8,y:.15+3.4*sensitivity*(1/distanceScale-1)};
  const local=image.map((p,i)=>world?.[i] ? {x:-(world[i].x-world[0].x)*14,y:(world[i].z-world[0].z)*14,z:(world[i].y-world[0].y)*14} : {x:-(p.x-image[0].x)*6*aspect,y:(p.z-image[0].z)*6*aspect,z:(p.y-image[0].y)*6});
  const palm=[0,5,9,13,17].reduce((s,i)=>({x:s.x+local[i].x/5,y:s.y+local[i].y/5,z:s.z+local[i].z/5}),{x:0,y:0,z:0});
  return local.map(p=>({x:anchor.x+p.x-palm.x,y:anchor.y+p.y-palm.y,z:anchor.z+p.z-palm.z}));
}

export function apparentPalmSize(image,world,aspect=4/3) {
  const pairs=[[0,5],[0,9],[0,13],[0,17],[5,17],[5,13],[9,17]];
  const ratios=[],fallback=[];
  for(const [a,b] of pairs) {
    const projected=Math.hypot((image[a].x-image[b].x)*aspect,image[a].y-image[b].y);
    if(projected>.015) fallback.push(projected);
    if(world?.[a] && world?.[b]) {
      const planar=Math.hypot(world[a].x-world[b].x,world[a].y-world[b].y);
      const length=Math.hypot(planar,world[a].z-world[b].z);
      if(planar>.01 && planar/Math.max(length,.001)>.45) ratios.push(projected/planar);
    }
  }
  const values=ratios.length>=3?ratios:fallback;
  if(values.length<3) return null;
  values.sort((a,b)=>a-b);
  return {value:values[Math.floor(values.length/2)],source:ratios.length>=3?'world':'image'};
}

export class HandDistanceScale {
  constructor() {this.hands=new Map();}
  reset() {this.hands.clear();}
  update(label,image,world,aspect,now) {
    const sample=apparentPalmSize(image,world,aspect);
    let state=this.hands.get(label);
    if(!sample) return state?.scale||1;
    if(!state || now-state.seen>1500 || state.source!==sample.source) {
      state={baseline:sample.value,source:sample.source,log:0,scale:1,seen:now};
      this.hands.set(label,state);return 1;
    }
    const dt=Math.max(0,Math.min((now-state.seen)/1000,.1));
    const target=Math.log(Math.max(.6,Math.min(1.6,sample.value/state.baseline)));
    // A deadband and rate limit keep size estimates from reintroducing flutter.
    if(Math.abs(target-state.log)>.015) state.log+=(Math.max(-.12,Math.min(.12,target-state.log)))*(1-Math.exp(-dt*8));
    state.scale=Math.exp(state.log);state.seen=now;
    return state.scale;
  }
}

// Public input Z is vertical height, even though Three.js uses world Y as up.
// 0 = table surface, 1 = 3.2 scene units above it; this is not a metric reading.
export function cursorHeight(worldY) {
  return Math.max(0,Math.min(1,(worldY+1.1)/3.2));
}

export function rotateCameraResult(result, turns=0) {
  const count=((turns%4)+4)%4;
  if(!count) return result;
  const rotate=(p,center)=>{
    let x=p.x-center,y=p.y-center;
    for(let i=0;i<count;i++) [x,y]=[-y,x];
    return {...p,x:x+center,y:y+center};
  };
  return {...result,landmarks:result.landmarks.map(hand=>hand.map(p=>rotate(p,.5))),worldLandmarks:result.worldLandmarks?.map(hand=>hand.map(p=>rotate(p,0)))};
}

// Adaptive low-pass filtering runs once per webcam observation. Low-amplitude
// jitter gets strong smoothing; intentional movement gets a faster response.
export class PoseStabilizer {
  constructor() { this.hands=new Map(); }
  reset() { this.hands.clear(); }
  update(label,image,world,now) {
    const clone=points=>points?.map(p=>({x:p.x,y:p.y,z:p.z||0}));
    const relative=world?.map(p=>({x:p.x-world[0].x,y:p.y-world[0].y,z:p.z-world[0].z}));
    let state=this.hands.get(label);
    if(!state || now-state.seen>350 || !!state.world!==!!relative) {
      state={image:clone(image),world:clone(relative),seen:now,candidates:new Map(),jump:null};
      this.hands.set(label,state);
      return {image:state.image,world:state.world};
    }
    const dt=Math.max(.001,Math.min((now-state.seen)/1000,.1));
    const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
    const center=p=>[0,5,9,13,17].reduce((s,i)=>({x:s.x+p[i].x/5,y:s.y+p[i].y/5}),{x:0,y:0});
    const currentCenter=center(image),lastCenter=center(state.image);
    if(distance(currentCenter,lastCenter)>.22) {
      if(!state.jump || distance(currentCenter,state.jump)>.06) {
        state.jump=currentCenter;state.seen=now;
        return {image:state.image,world:state.world};
      }
    }
    state.jump=null;
    const coherentWorld=new Set();
    if(relative && state.world) {
      // Several neighboring joints moving together is articulation, not an
      // isolated bad landmark. Don't hold a whole moving finger as an outlier.
      for(const group of [[0,5,9,13,17],[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]]) {
        const moving=group.filter(i=>distance(state.world[i],relative[i])>.035);
        if(moving.length>=2) group.forEach(i=>coherentWorld.add(i));
      }
    }
    const smooth=(previous,samples,isWorld)=>previous.map((old,i)=>{
      let sample=samples[i];
      if(![sample.x,sample.y,sample.z||0].every(Number.isFinite)) return {...old};
      let delta=distance(old,sample);
      if(isWorld && delta>.045 && !coherentWorld.has(i)) {
        const candidate=state.candidates.get(i);
        if(!candidate || distance(candidate,sample)>.02) {state.candidates.set(i,{...sample});return {...old};}
      }
      state.candidates.delete(i);
      const deadband=isWorld ? .0008 : .0015;
      if(delta<deadband) return {...old};
      const cutoff=(isWorld?1.5:2)+Math.min(18,delta/dt*(isWorld?15:4));
      const alpha=1-Math.exp(-2*Math.PI*cutoff*dt);
      return {x:old.x+(sample.x-old.x)*alpha,y:old.y+(sample.y-old.y)*alpha,z:old.z+((sample.z||0)-old.z)*alpha};
    });
    // Keep world outlier candidates independent of the image-coordinate filter.
    if(relative) state.world=smooth(state.world,relative,true);
    const candidates=state.candidates;state.candidates=new Map();
    state.image=smooth(state.image,image,false);state.candidates=candidates;
    state.seen=now;
    return {image:state.image,world:state.world};
  }
}
