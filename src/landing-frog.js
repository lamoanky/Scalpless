import * as THREE from 'three';
import { applyFrogPose } from './specimens/frog-pose.js';

// Decorative studies use the same detailed specimen definition as the hero.
// Their cloned geometry is static; it cannot deform the interactive specimen.
export function createLandingFrog(specimen) {
  const content=new THREE.Group();
  let skin;
  for(const part of specimen.parts.values()) {
    for(const source of part.group.children) {
      if(!source.isMesh)continue;
      const geometry=source.geometry.clone();applyFrogPose(geometry,0);
      const mesh=new THREE.Mesh(geometry,source.material);
      mesh.visible=source.visible && (part.id==='body'||part.id==='abdomen');
      mesh.castShadow=mesh.receiveShadow=true;
      content.add(mesh);
      if(source.material.userData.frogExterior)skin=source.material;
    }
  }
  const bounds=new THREE.Box3().setFromObject(content);
  content.rotation.z=Math.PI;
  content.scale.setScalar(20);
  content.position.y=bounds.max.y*20;
  const group=new THREE.Group();group.name='detailed-blue-frog-study';group.add(content);
  function variant(kind) {
    const clone=group.clone(true);clone.name=`landing-${kind}-study`;
    clone.traverse(o=>{
      if(!o.isMesh)return;
      if(kind==='muscle'&&o.material.userData.frogExterior)
        o.material=new THREE.MeshPhysicalMaterial({color:'#ee819c',roughness:.4,clearcoat:.72});
      if(kind==='anatomy') {
        o.visible=true;
        if(o.material.userData.frogExterior)
          o.material=new THREE.MeshPhysicalMaterial({color:'#b6e7fa',transparent:true,opacity:.17,depthWrite:false,roughness:.3});
      }
    });
    return clone;
  }
  return {group,variant,pattern:skin.map,skin};
}
