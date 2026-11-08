// Pure landmark processing: no camera or UI dependencies.
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = n => Math.max(0, Math.min(1, n));

export class GestureTracker {
  constructor(emit = (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail }))) {
    this.emit = emit;
    this.sensitivity = 1;
    this.point = null;
    this.pinching = false;
    this.cutting = false;
    this.poseSince = null;
    this.zoomDistance = null;
    this.primaryLabel = null;
    this.cameraMode = 'front';
  }

  endActions() {
    const point = this.point || { x: 0.5, y: 0.5, z: 0.5 };
    if (this.pinching) this.emit('input:pinchend', { ...point });
    if (this.cutting) this.emit('input:cutend', { ...point });
    this.pinching = this.cutting = false;
    this.poseSince = null;
  }

  reset() {
    this.endActions();
    if (this.point) this.emit('input:move', { ...this.point, mode: 'idle',lost:true });
    this.point = null;
    this.primaryLabel = null;
    this.zoomDistance = null;
    return { gesture: 'No hand detected', mode: 'idle', hands: 0, hold: 0 };
  }

  update(hands, now, labels = [], held = [], heights = [], worldHands = [], aspect = 1, worldCursors = [], gripCursors = []) {
    if (!hands.length) return this.reset();
    // Keep the same primary hand if MediaPipe changes result ordering.
    let index = this.primaryLabel ? labels.indexOf(this.primaryLabel) : 0;
    if (index < 0) {
      this.endActions();
      this.point = null;
      index = 0;
    }
    if(!this.pinching && !this.cutting){
      const pinchingHand=hands.findIndex((points,i)=>{const m=pinchMetrics(points,worldHands[i],aspect);return m.ratio<m.start*this.sensitivity;});
      if(pinchingHand>=0)index=pinchingHand;
    }
    this.primaryLabel = labels[index] || null;
    const hand = hands[index];
    const raw = { x: clamp(1-hand[8].x), y: clamp(hand[8].y), z:clamp(Number.isFinite(heights[index])?heights[index]:.5) };
    const alpha = 0.3;
    this.point = this.point ? {
      x: (1 - alpha) * this.point.x + alpha * raw.x,
      y: (1 - alpha) * this.point.y + alpha * raw.y,
      z: raw.z, // Already stabilized with the rendered hand; don't filter twice.
    } : raw;
    if(worldCursors[index])this.point.world={...worldCursors[index]};

    const metrics=pinchMetrics(hand,worldHands[index],aspect);
    const pinchRatio=metrics.ratio;
    const pinch=this.pinching?pinchRatio<=metrics.end*this.sensitivity:pinchRatio<metrics.start*this.sensitivity;
    // A pinch takes priority even with two hands visible. Zoom is available
    // when neither hand is grabbing, rather than dropping the held cube.
    if (hands.length >= 2 && !pinch) {
      this.endActions();
      const separation = distance(hands[0][8], hands[1][8]);
      let delta = 0;
      if (this.zoomDistance !== null && Math.abs(separation - this.zoomDistance) > 0.004) {
        delta = (separation - this.zoomDistance) * 4 * this.sensitivity;
        this.emit('input:zoom', { delta });
        this.zoomDistance = separation;
      } else if (this.zoomDistance === null) this.zoomDistance = separation;
      this.emit('input:move', { ...this.point, mode: 'idle' });
      return { gesture: delta > 0 ? 'Zoom in' : delta < 0 ? 'Zoom out' : 'Zoom ready', mode: 'idle', hands: hands.length, hold: 0, delta, point:this.point };
    }
    this.zoomDistance = null;
    const blocked = held[index] || [];
    // Touching fingers naturally occlude each other. Judge pinch geometry in
    // 3D instead of rejecting it because a finger is curled/foreshortened.
    const pointingPose = isIndexOnlyExtended(worldHands[index]||hand,this.cutting,worldHands[index]?1:aspect) && !blocked[1];
    let hold = 0;
    let gesture = 'Move / open hand';
    if (pinch) {
      this.point.x=clamp(1-(hand[4].x+hand[8].x)/2);
      this.point.y=clamp((hand[4].y+hand[8].y)/2);
      if(gripCursors[index])this.point.world={...gripCursors[index]};
      if (this.cutting) { this.emit('input:cutend', { ...this.point }); this.cutting = false; }
      this.poseSince = null;
      if (!this.pinching) this.emit('input:pinchstart', { ...this.point });
      this.pinching = true;
      gesture = 'Pinch / grab';
    } else {
      if (this.pinching) this.emit('input:pinchend', { ...this.point });
      this.pinching = false;
      if (pointingPose) {
        this.poseSince ??= now;
        hold = Math.min((now - this.poseSince) / 300, 1);
        if (hold >= 1 && !this.cutting) { this.emit('input:cutstart', { ...this.point }); this.cutting = true; }
        gesture = this.cutting ? 'Scalpel / cutting' : 'Hold scalpel pose…';
      } else {
        this.poseSince = null;
        if (this.cutting) this.emit('input:cutend', { ...this.point });
        this.cutting = false;
      }
    }
    const mode = this.pinching ? 'hand' : this.cutting ? 'scalpel' : 'idle';
    this.emit('input:move', { ...this.point, mode });
    return { gesture, mode, hands: hands.length, hold, pinchRatio, point: this.point };
  }
}

export function pinchMetrics(image,world,aspect=1){
  const points=world||image;
  const dist=(a,b)=>Math.hypot((a.x-b.x)*(world?1:aspect),a.y-b.y,world?(a.z||0)-(b.z||0):0);
  const size=Math.max(dist(points[0],points[9]),dist(points[5],points[17]),.001);
  return {ratio:dist(points[4],points[8])/size,start:world ? .36 : .28,end:world ? .52 : .42};
}

// Detect articulation, not a direction in the camera image. World landmarks
// make this work with a palm facing the lens, sideways, or rotated on the desk.
export function isIndexOnlyExtended(hand,active=false,aspect=1) {
  const dist=(a,b)=>Math.hypot((a.x-b.x)*aspect,a.y-b.y,((a.z||0)-(b.z||0))*aspect);
  const palm=Math.max(dist(hand[0],hand[9]),dist(hand[5],hand[17]),.001);
  const path=base=>dist(hand[base],hand[base+1])+dist(hand[base+1],hand[base+2])+dist(hand[base+2],hand[base+3]);
  const straight=dist(hand[5],hand[8])/Math.max(path(5),.00001)>(active ? .76 : .84);
  const extended=dist(hand[5],hand[8])>palm*(active ? .45 : .55)
    && dist(hand[0],hand[8])>dist(hand[0],hand[5])*(active?1.12:1.22);
  const curled=[9,13,17].every(base=>
    dist(hand[base],hand[base+3])/Math.max(path(base),.00001)<.75
    || dist(hand[0],hand[base+3])<dist(hand[0],hand[base])*(active?1.5:1.35));
  return straight && extended && curled;
}
