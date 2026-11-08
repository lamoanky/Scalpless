import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectHand, projectTableHand, rotateCameraResult, assignHands, handScreenPosition, PoseStabilizer, HandDistanceScale, apparentPalmSize, cursorHeight } from './hand-pose.js';
const image = () => Array.from({ length: 21 }, (_, i) => ({ x: .4 + i * .005, y: .7 - i * .01, z: -i * .001 }));
test('movement gain amplifies hand travel and height without stretching its fingers',()=>{
  const base=image(),world=openPalm();
  const moved=base.map(p=>({...p,x:p.x+.04,y:p.y-.04}));
  const a=projectTableHand(base,world,4/3,1,1),b=projectTableHand(moved,world,4/3,1,1);
  const fastA=projectTableHand(base,world,4/3,1,1.5),fastB=projectTableHand(moved,world,4/3,1,1.5);
  assert.ok(Math.abs((fastB[0].x-fastA[0].x)/(b[0].x-a[0].x)-1.5)<1e-9);
  assert.ok(Math.abs((fastB[0].z-fastA[0].z)/(b[0].z-a[0].z)-1.5)<1e-9);
  const raised=projectTableHand(base,world,4/3,.9,1),fastRaised=projectTableHand(base,world,4/3,.9,1.5);
  assert.ok(fastRaised[0].y>raised[0].y);
  const length=p=>Math.hypot(p[8].x-p[5].x,p[8].y-p[5].y,p[8].z-p[5].z);
  assert.ok(Math.abs(length(a)-length(fastA))<1e-9);
});
test('public cursor Z represents bounded vertical height above the table',()=>{
  assert.equal(cursorHeight(-1.1),0);
  assert.ok(Math.abs(cursorHeight(.5)-.5)<1e-9);
  assert.equal(cursorHeight(2.1),1);
  assert.equal(cursorHeight(-3),0);
  assert.equal(cursorHeight(5),1);
});
test('flat camera maps image XY into table XZ without changing palm height',()=>{
  const base=image(),world=openPalm();
  const a=projectTableHand(base,world);
  const b=projectTableHand(base.map(p=>({...p,x:p.x+.1,y:p.y-.1})),world);
  assert.ok(b[0].x<a[0].x);
  assert.ok(b[0].z<a[0].z);
  assert.ok(Math.abs(a[0].y-b[0].y)<1e-9);
  assert.ok(Math.abs(a[8].y-a[5].y-((world[8].z-world[5].z)*14))<1e-9);
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
  assert.ok(Math.abs(distance(a[8],a[4])-distance(world[8],world[4])*14)<1e-9);
});
test('flat palm and cursor travel agree with the mirrored webcam',()=>{
  const base=image(),world=openPalm();
  const leftInRaw=base.map(p=>({...p,x:p.x-.2}));
  const a=projectTableHand(base,world),b=projectTableHand(leftInRaw,world);
  assert.ok(b[0].x>a[0].x);
  assert.ok(handScreenPosition(leftInRaw).x>handScreenPosition(base).x);
});
test('reachable distance limits cover the full cursor height range',()=>{
  const flatWorld=openPalm().map(p=>({...p,z:0}));
  const close=projectTableHand(image(),flatWorld,4/3,1.59);
  const far=projectTableHand(image(),flatWorld,4/3,.61);
  const middle=projectTableHand(image(),flatWorld,4/3,1);
  assert.ok(cursorHeight(close[8].y)<.01);
  assert.equal(cursorHeight(far[8].y),1);
  assert.ok(cursorHeight(middle[8].y)>.3 && cursorHeight(middle[8].y)<.5);
});
test('flat palm shows the back above the palm and finger curls go toward the table',()=>{
  const world=openPalm(),pose=projectTableHand(image(),world);
  const across={x:pose[5].x-pose[17].x,z:pose[5].z-pose[17].z};
  const along={x:pose[9].x-pose[0].x,z:pose[9].z-pose[0].z};
  assert.ok(across.z*along.x-across.x*along.z>0); // dorsal normal faces up
  assert.ok(pose[8].y<pose[5].y); // negative camera z curls down toward lens/table
  const farther=projectTableHand(image(),world,4/3,.75);
  assert.ok(farther[0].y>pose[0].y);
});
test('hand scale follows distance with stable world-sized bones and resets on demand',()=>{
  const tracker=new HandDistanceScale(),base=image(),world=openPalm();
  const scale=s=>base.map(p=>({...p,x:.5+(p.x-.5)*s,y:.5+(p.y-.5)*s}));
  assert.equal(tracker.update('Left',base,world,4/3,0),1);
  let close;
  for(let t=33;t<=1000;t+=33) close=tracker.update('Left',scale(1.4),world,4/3,t);
  assert.ok(close>1.3 && close<=1.6);
  let far;
  for(let t=1023;t<=2200;t+=33) far=tracker.update('Left',scale(.7),world,4/3,t);
  assert.ok(far<.8 && far>=.6);
  tracker.reset();
  assert.equal(tracker.update('Left',scale(.7),world,4/3,2300),1);
});
test('palm-size estimate ignores finger curling and compensates for projected tilt',()=>{
  const world=openPalm(),base=image();
  const curl=base.map(p=>({...p}));
  for(const i of [4,6,7,8,10,11,12,14,15,16,18,19,20]) curl[i]={x:.5,y:.5,z:-.2};
  assert.deepEqual(apparentPalmSize(base,world),apparentPalmSize(curl,world));
  const w=image().map(p=>({x:p.x*.1,y:p.y*.1,z:0}));
  const projected=points=>points.map(p=>({x:.5+p.x*3/(4/3),y:.5+p.y*3,z:0}));
  const tilt=w.map(p=>({...p,x:p.x*.7,z:p.x*.7}));
  assert.ok(Math.abs(apparentPalmSize(projected(w),w).value-apparentPalmSize(projected(tilt),tilt).value)<1e-9);
});
test('rotation aligns image and world coordinates and preserves depth',()=>{
  const original={landmarks:[image()],worldLandmarks:[openPalm()],handedness:[]};
  const rotated=rotateCameraResult(original,1);
  assert.ok(Math.abs(rotated.landmarks[0][0].x-(1-original.landmarks[0][0].y))<1e-9);
  assert.ok(Math.abs(rotated.worldLandmarks[0][5].x+original.worldLandmarks[0][5].y)<1e-9);
  assert.equal(rotated.worldLandmarks[0][8].z,original.worldLandmarks[0][8].z);
  assert.equal(rotateCameraResult(original,4),original);
  const restored=rotateCameraResult(rotated,3).landmarks[0];
  restored.forEach((p,i)=>Object.keys(p).forEach(key=>assert.ok(Math.abs(p[key]-original.landmarks[0][i][key])<1e-12)));
});
test('stabilizer suppresses small stationary jitter without losing full travel',()=>{
  const s=new PoseStabilizer(),base=image();
  s.update('Left',base,undefined,0);
  const tiny=base.map(p=>({...p,x:p.x+.0007}));
  assert.equal(s.update('Left',tiny,undefined,33).image[0].x,base[0].x);
  const moved=base.map(p=>({...p,x:p.x+.18,y:p.y-.16}));
  let output;
  for(let t=66;t<500;t+=33) output=s.update('Left',moved,undefined,t);
  assert.ok(Math.abs(output.image[0].x-moved[0].x)<.002);
  assert.ok(Math.abs(output.image[0].y-moved[0].y)<.002);
});
test('isolated palm jump is rejected; a deliberate sustained move is accepted',()=>{
  const s=new PoseStabilizer(),base=image();s.update('Left',base,undefined,0);
  const moved=base.map(p=>({...p,x:p.x+.35}));
  assert.equal(s.update('Left',moved,undefined,33).image[0].x,base[0].x);
  assert.equal(s.update('Left',base,undefined,66).image[0].x,base[0].x);
  s.update('Left',moved,undefined,99);
  assert.ok(s.update('Left',moved,undefined,132).image[0].x>base[0].x+.2);
});
test('world joint outliers are rejected once and filters reset after tracking loss',()=>{
  const s=new PoseStabilizer(),base=image(),world=openPalm();
  s.update('Left',base,world,0);
  const spike=world.map(p=>({...p}));spike[8].z+=.1;
  assert.equal(s.update('Left',base,spike,33).world[8].z,world[8].z);
  assert.equal(s.update('Left',base,world,66).world[8].z,world[8].z);
  assert.equal(s.update('Left',base,spike,600).world[8].z,spike[8].z);
  s.reset();
  assert.equal(s.update('Left',base,world,633).world[8].z,world[8].z);
});
test('coherent finger motion is followed immediately rather than treated as isolated spikes',()=>{
  const s=new PoseStabilizer(),base=image(),world=openPalm();
  s.update('Left',base,world,0);
  const changed=world.map(p=>({...p}));
  for(const i of [6,7,8]) changed[i].z+=.08;
  const output=s.update('Left',base,changed,33);
  assert.ok(output.world[8].z>world[8].z+.03);
});
test('camera edge-to-edge movement spans most of the display without early saturation',()=>{
  const at=(x,y)=>image().map(p=>({...p,x,y}));
  assert.ok(Math.abs(handScreenPosition(at(0,.5)).x-.92)<1e-9);
  assert.ok(Math.abs(handScreenPosition(at(1,.5)).x-.08)<1e-9);
  assert.ok(Math.abs(handScreenPosition(at(.5,0)).y-.1)<1e-9);
  assert.ok(Math.abs(handScreenPosition(at(.5,1)).y-.9)<1e-9);
  assert.ok(handScreenPosition(at(.1,.5)).x>handScreenPosition(at(.2,.5)).x);
  assert.ok(handScreenPosition(at(.8,.5)).x>handScreenPosition(at(.9,.5)).x);
});
test('mirrors control movement and preserves finger offsets during translation', () => {
  const points = image();
  const world = points.map(p => ({ x: p.x / 10, y: p.y / 10, z: p.z / 10 }));
  const pose = projectHand(points, world);
  const moved = points.map(p => ({ ...p, x: p.x + .1 }));
  const next = projectHand(moved, world);
  assert.ok(next[0].x < pose[0].x);
  assert.ok(Math.abs((pose[8].x - pose[0].x) - (next[8].x - next[0].x)) < 1e-10);
  assert.ok(pose[9].z < pose[0].z);
});
function openPalm() {
  const p=Array.from({length:21},()=>({x:0,y:0,z:0}));
  p[5]={x:-.035,y:-.06,z:0}; p[9]={x:0,y:-.07,z:0}; p[17]={x:.035,y:-.055,z:0};
  p[4]={x:-.06,y:-.06,z:-.015}; p[8]={x:-.035,y:-.13,z:-.02};
  return p;
}
test('turning the palm over rotates the virtual palm instead of erasing roll',()=>{
  const world=openPalm(), flipped=world.map(p=>({x:-p.x,y:p.y,z:-p.z}));
  const a=projectHand(image(),world,4/3,'Left'), b=projectHand(image(),flipped,4/3,'Left');
  const normalY = p => {
    const x=p[5].x-p[17].x,z=p[5].z-p[17].z;
    const fx=p[9].x-p[0].x,fz=p[9].z-p[0].z;
    return z*fx-x*fz;
  };
  assert.ok(normalY(a)>0); assert.ok(normalY(b)<0);
  assert.ok(a[8].y<a[5].y); // curling into a down-facing palm moves down
  assert.ok(b[8].y>b[5].y); // and up after the palm is turned over
});
test('hand assignment tolerates swapped labels and detection order',()=>{
  const a=image(),b=image().map(p=>({...p,x:p.x+.4}));
  const previous={Left:a[0],Right:b[0]};
  assert.deepEqual(assignHands([a,b],['Right','Left'],previous),['Left','Right']);
  assert.deepEqual(assignHands([b,a],['Right','Left'],previous),['Right','Left']);
  assert.deepEqual(assignHands([a],['Right'],previous),['Left']);
});
test('apparent hand size controls bounded estimated depth', () => {
  const points = image();
  const far = projectHand(points);
  points[9].y = .2;
  const near = projectHand(points);
  assert.ok(near[0].z < far[0].z);
  assert.ok(near[0].z >= 1.05 - 1e-9 && near[0].z <= 2.25 + 1e-9);
  assert.ok(near.every(p => Object.values(p).every(Number.isFinite)));
});
test('hands enter from opposite sides and point inward into the workspace', () => {
  const points = image();
  const left = projectHand(points, undefined, 4/3, 'Left');
  const right = projectHand(points, undefined, 4/3, 'Right');
  assert.ok(left[0].x < 0 && right[0].x > 0);
  assert.ok(left[9].x > left[0].x);
  assert.ok(right[9].x < right[0].x);
  assert.ok(left[9].z < left[0].z && right[9].z < right[0].z);
});
test('reorientation preserves 3D pinch distance', () => {
  const points = image();
  const world = points.map(p => ({ ...p }));
  const p = projectHand(points, world);
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
  assert.ok(Math.abs(distance(p[4],p[8])-distance(world[4],world[8])*14) < 1e-9);
});
test('world wrist offset cancels and missing world landmarks use image geometry', () => {
  const points = image();
  const base = points.map(p => ({ ...p }));
  const shifted = base.map(p => ({ x: p.x + 10, y: p.y - 5, z: p.z + 3 }));
  const a = projectHand(points, base), b = projectHand(points, shifted);
  a.forEach((p, i) => Object.keys(p).forEach(key => assert.ok(Math.abs(p[key] - b[i][key]) < 1e-10)));
  assert.equal(projectHand(points).length, 21);
});
