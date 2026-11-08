import * as THREE from "three";

// Presentation-only joint blend. Both appearances retain exactly the same
// final geometry, normals, atlas coordinates and collider shapes.
export function prepareFrogPose(geometry, limb = null) {
  if (geometry.hasAttribute("frogRestPosition")) return;
  const positions = geometry.attributes.position, normals = geometry.attributes.normal;
  const rest = positions.clone(), restNormals = normals.clone();
  const seated = positions.clone(), seatedNormals = normals.clone();
  if (limb) {
    const fore = limb.kind === "fore", side = limb.side;
    const root = new THREE.Vector3(side * (fore ? .019 : .020), .012, fore ? -.031 : .029);
    const joint = new THREE.Vector3(side * (fore ? .046 : .052), fore ? .007 : .009, fore ? -.021 : .055);
    const proximal = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), side * THREE.MathUtils.degToRad(fore ? 75 : 70));
    const distal = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), side * THREE.MathUtils.degToRad(fore ? 30 : 15));
    const posedJoint = joint.clone().sub(root).applyQuaternion(proximal).add(root);
    const p = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i=0;i<positions.count;i++) {
      p.fromBufferAttribute(rest,i);
      const weight = THREE.MathUtils.smoothstep(Math.abs(p.x), fore ? .035 : .040, fore ? .052 : .065);
      a.copy(p).sub(root).applyQuaternion(proximal).add(root);
      b.copy(p).sub(joint).applyQuaternion(distal).add(posedJoint);
      a.lerp(b,weight); seated.setXYZ(i,a.x,a.y,a.z);
      p.fromBufferAttribute(restNormals,i);
      a.copy(p).applyQuaternion(proximal); b.copy(p).applyQuaternion(distal);
      a.lerp(b,weight).normalize(); seatedNormals.setXYZ(i,a.x,a.y,a.z);
    }
  }
  geometry.setAttribute("frogRestPosition",rest);
  geometry.setAttribute("frogRestNormal",restNormals);
  geometry.setAttribute("frogSeatedPosition",seated);
  geometry.setAttribute("frogSeatedNormal",seatedNormals);
}

export function applyFrogPose(geometry, amount) {
  const rest = geometry.getAttribute("frogRestPosition"), seated = geometry.getAttribute("frogSeatedPosition");
  if (!rest) return;
  const t = THREE.MathUtils.clamp(amount,0,1), p = geometry.attributes.position, n = geometry.attributes.normal;
  const rn = geometry.getAttribute("frogRestNormal"), sn = geometry.getAttribute("frogSeatedNormal");
  if (t === 1) { p.array.set(rest.array); n.array.set(rn.array); }
  else for (let i=0;i<p.array.length;i++) {
    p.array[i] = rest.array[i] === seated.array[i] ? rest.array[i]
      : seated.array[i] + (rest.array[i]-seated.array[i])*t;
    n.array[i] = rn.array[i] === sn.array[i] ? rn.array[i]
      : sn.array[i] + (rn.array[i]-sn.array[i])*t;
  }
  p.needsUpdate = n.needsUpdate = true;
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
}
