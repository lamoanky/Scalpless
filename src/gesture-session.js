import {GestureTracker} from '../gestures.js';
import {assignHands,rotateCameraResult,PoseStabilizer,HandDistanceScale} from '../hand-pose.js';
import {assessHand,VisibilityGuard} from '../tracking-quality.js';
import {mapGesturePointer,heightFromHandScale} from './gesture-mapping.js';

export class GestureSession {
  constructor(emit=(type,detail)=>window.dispatchEvent(new CustomEvent(type,{detail}))){
    this.movementGain=1.5;this.rotation=0;this.flat=true;
    this.tracker=new GestureTracker((type,detail)=>{
      const mapped=type==='input:zoom'?{...detail,source:'webcam'}:mapGesturePointer(detail,this.movementGain);
      if(type==='input:move' && !detail.lost)this.pointer=mapped;
      emit(type,mapped);
    });
    this.stabilizer=new PoseStabilizer();this.distance=new HandDistanceScale();this.visibility=new VisibilityGuard();
    this.previous={};this.frame=null;this.pointer=null;
  }
  process(raw,now,aspect){
    if(this.lastSeen!==undefined && now-this.lastSeen>350)this.previous={};
    const result=rotateCameraResult(raw,this.rotation);
    if(this.rotation%2)aspect=1/aspect;
    const labels=assignHands(result.landmarks,result.handedness.map(h=>h[0]?.categoryName),this.previous);
    const filtered=result.landmarks.map((image,i)=>this.stabilizer.update(labels[i],image,result.worldLandmarks?.[i],now));
    const scales=filtered.map((hand,i)=>this.distance.update(labels[i],hand.image,hand.world,aspect,now));
    const held=result.landmarks.map((image,i)=>this.visibility.update(labels[i],assessHand(image,aspect),now));
    labels.forEach((label,i)=>{this.previous[label]={...result.landmarks[i][0]};});this.lastSeen=now;
    const heights=scales.map(heightFromHandScale);
    const state=this.tracker.update(filtered.map(h=>h.image),now,labels,held,heights,filtered.map(h=>h.world),aspect);
    this.frame={hands:filtered,labels,scales,held,aspect,state};
    if(!state.point)this.pointer=null;
    return state;
  }
  reset(){this.tracker.reset();this.stabilizer.reset();this.distance.reset();this.visibility.reset();this.previous={};this.frame=null;this.pointer=null;}
}
