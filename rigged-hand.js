import * as THREE from 'three';

const fingerSpecs=[
  {name:'thumb',chain:[1,2,3,4],joints:['metacarpal','phalanx-proximal','phalanx-distal','tip']},
  ...['index','middle','ring','pinky'].map((name,i)=>({name:`${name}-finger`,chain:[5+i*4,6+i*4,7+i*4,8+i*4],joints:['phalanx-proximal','phalanx-intermediate','phalanx-distal','tip']})),
];
const frame=(points)=>{
  const along=points[9].clone().sub(points[0]).normalize();
  const across=points[5].clone().sub(points[17]);
  across.addScaledVector(along,-across.dot(along)).normalize();
  if(along.lengthSq()<.5 || across.lengthSq()<.5) return null;
  const normal=new THREE.Vector3().crossVectors(across,along).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,along,normal));
};

// Generic WebXR hands use 25 sibling bones with absolute joint transforms.
// Retarget MediaPipe's 21 landmarks, synthesizing the four metacarpal bases.
export class RiggedHand {
  constructor(scene,gltf,color,label,scalpel) {
    this.label=label;this.group=new THREE.Group();scene.add(this.group);
    this.asset=gltf.scene;this.group.add(this.asset);
    this.mesh=this.asset.getObjectByProperty('type','SkinnedMesh');
    if(!this.mesh) throw new Error('Hand model has no skinned mesh');
    this.mesh.frustumCulled=false;
    this.mesh.material=new THREE.MeshStandardMaterial({color,roughness:.62,metalness:.03});
    this.records=new Map();
    for(const bone of this.mesh.skeleton.bones) {
      this.records.set(bone.name,{bone,position:bone.position.clone(),rotation:bone.quaternion.clone()});
    }
    const get=name=>{
      const record=this.records.get(name);
      if(!record) throw new Error(`Hand model missing joint: ${name}`);
      return record;
    };
    this.rest=Array.from({length:21},()=>new THREE.Vector3());
    this.rest[0].copy(get('wrist').position);
    for(const finger of fingerSpecs) finger.chain.forEach((index,j)=>this.rest[index].copy(get(`${finger.name}-${finger.joints[j]}`).position));
    this.restFrame=frame(this.rest);
    this.restLength=this.rest[9].distanceTo(this.rest[0]);
    this.points=this.rest.map(()=>new THREE.Vector3());
    this.observed=this.rest.map(()=>new THREE.Vector3());
    this.directions=new Map();this.heldFor=[0,0,0,0,0];
    this.scalpel=scalpel;this.group.add(scalpel);
    this.group.visible=false;
  }

  update(targets,dt,held=[],distanceScale=1) {
    const fresh=!this.group.visible;
    const alpha=fresh?1:1-Math.exp(-dt*42);
    this.observed.forEach((p,i)=>p.lerp(new THREE.Vector3(targets[i].x,targets[i].y,targets[i].z),alpha));
    const rotation=frame(this.observed);
    if(!rotation) return;
    const inverse=rotation.clone().invert();
    const palmDelta=rotation.clone().multiply(this.restFrame.clone().invert());
    const modelScale=THREE.MathUtils.clamp(this.observed[0].distanceTo(this.observed[9]),.55,1.65)/this.restLength;
    this.points.forEach((p,i)=>p.copy(this.observed[i]));
    fingerSpecs.forEach((finger,f)=>{
      this.heldFor[f]=held[f]?this.heldFor[f]+dt:0;
      for(let j=1;j<finger.chain.length;j++) {
        const a=finger.chain[j-1],b=finger.chain[j];
        const observed=this.observed[b].clone().sub(this.observed[a]).normalize().applyQuaternion(inverse);
        let direction=this.directions.get(b);
        if(!direction || fresh) {direction=observed.clone();this.directions.set(b,direction);}
        // Briefly bridge occlusion, then follow the estimate at a slower rate.
        // A curled finger must never freeze the whole hand or stay stuck forever.
        if(!held[f] || this.heldFor[f]>.12 || fresh) {
          const blend=fresh?1:1-Math.exp(-dt*(held[f]?14:38));
          direction.lerp(observed,blend).normalize();
        }
        const length=this.rest[a].distanceTo(this.rest[b])*modelScale;
        this.points[b].copy(this.points[a]).addScaledVector(direction.clone().applyQuaternion(rotation),length);
      }
    });

    const joints=new Map([['wrist',this.points[0]]]);
    const next=new Map();
    for(const finger of fingerSpecs) {
      finger.chain.forEach((index,j)=>{
        const name=`${finger.name}-${finger.joints[j]}`;
        joints.set(name,this.points[index]);
        if(j<3) next.set(name,`${finger.name}-${finger.joints[j+1]}`);
      });
      if(finger.name!=='thumb') {
        const name=`${finger.name}-metacarpal`,base=`${finger.name}-phalanx-proximal`;
        const restVector=this.records.get(base).position.clone().sub(this.rest[0]);
        const offset=this.records.get(name).position.clone().sub(this.rest[0]);
        const amount=THREE.MathUtils.clamp(offset.dot(restVector)/restVector.lengthSq(),.15,.7);
        joints.set(name,this.points[0].clone().lerp(this.points[finger.chain[0]],amount));
        next.set(name,base);
      }
    }
    for(const [name,position] of joints) {
      const record=this.records.get(name),q=palmDelta.clone().multiply(record.rotation);
      const child=next.get(name);
      if(child) {
        const restDirection=this.records.get(child).position.clone().sub(record.position).normalize().applyQuaternion(palmDelta);
        const targetDirection=joints.get(child).clone().sub(position).normalize();
        if(targetDirection.lengthSq()>.5) q.premultiply(new THREE.Quaternion().setFromUnitVectors(restDirection,targetDirection));
      } else if(name.endsWith('-tip')) {
        const parent=[...next].find(([,tip])=>tip===name)?.[0];
        if(parent) q.copy(this.records.get(parent).bone.quaternion);
      }
      record.bone.position.copy(position);record.bone.quaternion.copy(q);record.bone.scale.setScalar(modelScale);
    }
    this.group.visible=true;
    const pivot=this.points[0].clone().lerp(this.points[9],.5);
    this.group.scale.setScalar(distanceScale);this.group.position.copy(pivot).multiplyScalar(1-distanceScale);
    const normal=new THREE.Vector3(0,0,this.label==='Left'?1:-1).applyQuaternion(rotation);
    const direction=this.points[8].clone().sub(this.points[6]).normalize();
    this.scalpel.position.copy(this.points[8]).addScaledVector(normal,.13).addScaledVector(direction,-.16);
    if(direction.lengthSq()>.5) this.scalpel.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);
  }
}
