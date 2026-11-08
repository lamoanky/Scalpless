import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { organicTube } from './specimens/frog-surfaces.js';
import { torsoSurface, abdomenGeometry } from './specimens/frog-anatomy.js';

export const BLUE_ANATOMY_SCALE = 1.65;
export const BLUE_ANATOMY_LIFT = .013;
// Uniform scale plus a half-turn: the same geometry can sit upright or lie
// belly-up without swapping meshes, stretching, or changing its markings.
export const BLUE_TO_LAB = new THREE.Matrix4().set(
  -.05,0,0,0, 0,-.05,0,.082, 0,0,.05,-.006, 0,0,0,1,
);
const anatomyToBlue = BLUE_TO_LAB.clone().invert().multiply(
  new THREE.Matrix4().makeTranslation(0,BLUE_ANATOMY_LIFT,0)
    .multiply(new THREE.Matrix4().makeScale(1,BLUE_ANATOMY_SCALE,1)),
);

// Shared blue frog exterior. The removable abdomen and hollow torso use the
// same outline as the interactive specimen; only the presentation pose changes.
export function createLandingFrog() {
  let seed=7361;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#05b5f0';ctx.fillRect(0,0,1024,1024);
  for(let y=0;y<1024;y+=55) for(let x=0;x<1024;x+=55) {
    ctx.fillStyle=`hsl(${192+random()*8} 95% ${45+random()*5}%)`;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+55,y);ctx.lineTo(x+(random()>.5?0:55),y+55);ctx.closePath();ctx.fill();
  }
  for(let i=0;i<155;i++) {
    const x=random()*1024,y=random()*1024,r=5+random()*17;
    ctx.fillStyle=random()>.3?'#042444':'#063d69';
    ctx.beginPath();ctx.ellipse(x,y,r,r*(.6+random()*.55),random()*Math.PI,0,Math.PI*2);ctx.fill();
  }
  const pattern=new THREE.CanvasTexture(canvas);pattern.colorSpace=THREE.SRGBColorSpace;
  pattern.anisotropy=4;
  const skin=new THREE.MeshPhysicalMaterial({map:pattern,color:'#40cfff',roughness:.27,
    clearcoat:.48,clearcoatRoughness:.16,metalness:.08,flatShading:true});
  const eye=new THREE.MeshPhysicalMaterial({color:'#03101f',roughness:.06,clearcoat:1,clearcoatRoughness:.03});
  const rim=new THREE.MeshPhysicalMaterial({color:'#43e8ff',roughness:.18,metalness:.2,clearcoat:1});
  const mouth=new THREE.MeshStandardMaterial({color:'#044b7b',roughness:.35});
  const pieces=new Map();
  let limb=null;
  const add=(g,m=skin)=>{
    const count=g.attributes.position.count,pivots=new Float32Array(count*3),angles=new Float32Array(count);
    if(limb)for(let i=0;i<count;i++){
      pivots.set(limb.pivot,i*3);angles[i]=limb.side*THREE.MathUtils.degToRad(110);
    }
    g.setAttribute('posePivot',new THREE.BufferAttribute(pivots,3));
    g.setAttribute('poseAngle',new THREE.BufferAttribute(angles,1));
    if(!pieces.has(m))pieces.set(m,[]);pieces.get(m).push(g);
  };
  function ball(p,s,m=skin,rotation=0,smooth=false) {
    const g=smooth?new THREE.SphereGeometry(1,32,20):new THREE.IcosahedronGeometry(1,3);
    g.scale(...s);g.rotateY(rotation);g.translate(...p);add(g,m);
  }
  const tube=(points,radii,m=skin,segments=28,sides=10)=>
    add(organicTube(points,Array.isArray(radii)?radii:[radii,radii],{segments,sides,flat:.85,wrinkle:.015}),m);
  const torso=torsoSurface();
  // Cylindrical body UVs and planar belly UVs avoid the old polar swirl.
  const tp=torso.attributes.position,tu=torso.attributes.uv;
  for(let i=0;i<tp.count;i++)tu.setXY(i,
    Math.atan2(tp.getX(i),tp.getY(i)-.012)/(Math.PI*2)+.5,tp.getZ(i)/.1+.5);
  torso.applyMatrix4(anatomyToBlue);
  add(torso);
  ball([0,1.21,-.96],[.55,.25,.63]);
  ball([0,1.08,-1.07],[.47,.05,.44]);
  for(const side of [-1,1]) {
    limb=null;
    ball([side*.36,1.4,-.87],[.21,.21,.22]);
    ball([side*.43,1.42,-1.02],[.15,.15,.13],eye,side*.22,true);
    const ring=new THREE.TorusGeometry(.155,.012,10,40);
    ring.rotateY(side*.2);ring.translate(side*.43,1.42,-1.025);add(ring,rim);
    ball([side*.24,1.29,-1.41],[.035,.022,.022],eye,0,true);
    tube([[side*.05,1.09,-1.44],[side*.35,1.08,-1.33],[side*.51,1.09,-1.03]],.012,mouth);
    limb={side,pivot:[side*.42,1.04,-.54]};
    tube([[side*.42,1.04,-.54],[side*.55,.59,-.64],[side*.57,.32,-.9],[side*.63,.11,-1.15]],
      [.16,.12,.075,.055]);
    ball([side*.64,.08,-1.18],[.115,.055,.15]);
    for(let i=0;i<4;i++) {
      const x=side*(.64+(i-1.5)*.12),z=-1.49-(i%2)*.14;
      tube([[side*.64,.09,-1.2],[x,.055,-1.38],[x+side*.05,.04,z]], [.034,.025,.019],skin,16,8);
      ball([x+side*.05,.04,z],[.048,.022,.043],rim,0,true);
    }
    limb={side,pivot:[side*.6,.75,.42]};
    ball([side*.67,.43,.57],[.46,.36,.53],skin,side*.32);
    tube([[side*.83,.43,.43],[side*.96,.24,.76],[side*.69,.13,1.01],[side*.56,.1,.68]],
      [.19,.14,.085,.065],skin,34,12);
    tube([[side*.56,.1,.68],[side*.82,.08,.28],[side*.91,.055,.01]], [.075,.055,.035]);
    for(let i=0;i<4;i++) {
      const x=side*(.89+(i-1.5)*.11),z=-.31-(i%2)*.13;
      tube([[side*.9,.06,.02],[x,.04,-.18],[x+side*.08,.03,z]], [.035,.025,.016],skin,16,8);
      ball([x+side*.08,.03,z],[.05,.02,.043],rim,0,true);
    }
  }
  limb=null;
  const group=new THREE.Group();group.name='shared-blue-frog';
  // Preserve separate limb hulls; never fill the open abdomen with a body hull.
  const bodyColliders=[...pieces.values()].flat().filter(g=>g!==torso).map(g=>g.clone());
  for(const [material,geometries] of pieces) {
    const expanded=geometries.map(g=>g.index?g.toNonIndexed():g);
    const merged=mergeGeometries(expanded);
    new Set([...geometries,...expanded]).forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(merged,material);mesh.castShadow=mesh.receiveShadow=true;
    group.add(mesh);
  }
  const abdomenShape=abdomenGeometry();
  const ap=abdomenShape.attributes.position,au=abdomenShape.attributes.uv;
  for(let i=0;i<ap.count;i++)au.setXY(i,ap.getX(i)/.07+.5,ap.getZ(i)/.1+.5);
  const abdomen=new THREE.Mesh(abdomenShape.applyMatrix4(anatomyToBlue),skin);
  abdomen.name='blue-frog-abdomen';abdomen.castShadow=abdomen.receiveShadow=true;
  group.add(abdomen);
  function variant(kind) {
    const clone=group.clone();clone.name=`landing-${kind}-study`;
    clone.traverse(o=>{if(!o.isMesh)return;
      if(kind==='muscle'&&o.material===skin) o.material=new THREE.MeshPhysicalMaterial({color:'#ee819c',roughness:.32,clearcoat:.6,flatShading:true});
      if(kind==='anatomy') o.material=new THREE.MeshPhysicalMaterial({color:'#b6e7fa',transparent:true,opacity:.17,depthWrite:false,roughness:.3,side:THREE.FrontSide});
    });
    if(kind==='anatomy') {
      const bone=new THREE.MeshStandardMaterial({color:'#fcf3e5',roughness:.5});
      const bones=[];
      const bt=(pts,r)=>bones.push(organicTube(pts,[r,r],{segments:18,sides:7,flat:1}));
      bt([[0,.8,.64],[0,1,-.1],[0,1.15,-.75]],.045);
      for(const s of [-1,1]) {
        bt([[s*.33,.97,-.5],[s*.54,.5,-.7],[s*.64,.1,-1.15]],.035);
        bt([[s*.3,.69,.4],[s*.9,.3,.7],[s*.57,.1,.7],[s*.9,.04,0]],.043);
        for(let i=0;i<5;i++)bt([[0,.96,-.5+i*.16],[s*.29,.8,-.48+i*.16]],.015);
      }
      clone.add(new THREE.Mesh(mergeGeometries(bones),bone));bones.forEach(g=>g.dispose());
    }
    return clone;
  }
  return {group,variant,pattern,skin,abdomen,bodyColliders};
}

// Prepare the limb pivots with the same transform as the geometry. Both poses
// use the identical vertices and UVs, with rigid rotations about the shoulders
// and hips so the limbs can settle beside the abdomen without hiding the seam.
export function prepareBluePose(geometry) {
  const pivots=geometry.getAttribute('posePivot');
  if(!pivots)return;
  const v=new THREE.Vector3();
  for(let i=0;i<pivots.count;i++){
    v.fromBufferAttribute(pivots,i).applyMatrix4(BLUE_TO_LAB);
    pivots.setXYZ(i,v.x,v.y,v.z);
  }
}
export function applyBluePose(geometry,t) {
  const angles=geometry.getAttribute('poseAngle'),pivots=geometry.getAttribute('posePivot');
  if(!angles)return;
  const p=geometry.attributes.position,n=geometry.attributes.normal;
  geometry.userData.seatedPosition??=p.array.slice();
  if(n)geometry.userData.seatedNormal??=n.array.slice();
  const source=geometry.userData.seatedPosition,normal=geometry.userData.seatedNormal;
  for(let i=0;i<p.count;i++){
    const a=angles.getX(i)*t,c=Math.cos(a),s=Math.sin(a),j=i*3;
    const px=pivots.getX(i),py=pivots.getY(i),x=source[j]-px,y=source[j+1]-py;
    p.setXYZ(i,px+x*c-y*s,py+x*s+y*c,source[j+2]);
    if(n)n.setXYZ(i,normal[j]*c-normal[j+1]*s,normal[j]*s+normal[j+1]*c,normal[j+2]);
  }
  p.needsUpdate=true;if(n)n.needsUpdate=true;
  geometry.computeBoundingSphere();geometry.computeBoundingBox();
}
