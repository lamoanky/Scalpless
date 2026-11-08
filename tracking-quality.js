const chains = [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
export const fingerNames = ['thumb','index','middle','ring','pinky'];

// Geometric warning, not a MediaPipe confidence score. Very short projected
// segments cannot provide a reliable observation of flexion from one camera.
export function assessHand(image, aspect = 4/3) {
  const planar = (a,b) => Math.hypot((a.x-b.x)*aspect,a.y-b.y);
  const palm = Math.max(planar(image[5],image[17]),planar(image[0],image[9])*.7,.025);
  return chains.map(chain => {
    let path=0,short=0,depth=0;
    for(let j=1;j<chain.length;j++) {
      const a=image[chain[j-1]],b=image[chain[j]],length=planar(a,b);
      path+=length;
      if(length/palm<.075) short++;
      depth+=Math.abs((a.z-b.z)*aspect);
    }
    const projection=path/Math.max(Math.hypot(path,depth),.001);
    return { uncertain:path/palm<.38 || short>=2 || projection<.42, projection };
  });
}

export class VisibilityGuard {
  constructor() { this.states=new Map(); }
  reset() { this.states.clear(); }
  update(label, quality, now) {
    let state=this.states.get(label);
    if(!state || now-state.seen>300) state=quality.map(q=>({held:q.uncertain,clearSince:null}));
    quality.forEach((q,i)=>{
      const finger=state[i];
      if(q.uncertain) { finger.held=true; finger.clearSince=null; }
      else if(finger.held) {
        finger.clearSince ??= now;
        if(now-finger.clearSince>=120) finger.held=false;
      }
    });
    state.seen=now; this.states.set(label,state);
    return state.map(f=>f.held);
  }
}
