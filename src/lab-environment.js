import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";

export const PLATFORM = {
  x: -0.078,
  halfWidth: 0.1,
  halfDepth: 0.085,
  top: 0.022,
};

export function createLabEnvironment(scene) {
  // A low-resolution, softly filtered planar reflection follows the real scene.
  const shader = {
    ...Reflector.ReflectorShader,
    fragmentShader: `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    varying vec4 vUv;
    void main(){
      vec2 uv=vUv.xy/vUv.w;
      vec4 reflected=vec4(0.0);
      for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
        reflected+=texture2D(tDiffuse,uv+vec2(float(x),float(y))*.0025);
      }
      reflected/=9.0;
      gl_FragColor=vec4(reflected.rgb/max(reflected.a,.0001),reflected.a*.24);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  };
  const reflection = new Reflector(new THREE.PlaneGeometry(8, 8), {
    textureWidth: 768,
    textureHeight: 768,
    multisample: 0,
    clipBias: 0.0001,
    shader,
  });
  reflection.material.transparent = true;
  reflection.material.depthWrite = false;
  reflection.rotation.x = -Math.PI / 2;
  reflection.position.y = -0.0033;
  scene.add(reflection);

  // The blue floor is now the retouched original image. Only live reflections
  // and shadow catchers sit over it; there is no opaque replacement floor.
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 8),
    new THREE.ShadowMaterial({
      color: "#667cb5",
      opacity: 0.22,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.0029;
  shadow.receiveShadow = true;
  shadow.renderOrder = 2;
  scene.add(shadow);

  const white = new THREE.MeshPhysicalMaterial({
    color: "#dceaff",
    roughness: 0.12,
    metalness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });
  const blueSide = new THREE.MeshPhysicalMaterial({
    color: "#299bd8",
    roughness: 0.17,
    metalness: 0.28,
    clearcoat: 0.85,
    emissive: "#168bd1",
    emissiveIntensity: 0.12,
  });
  const upperSide = new THREE.MeshPhysicalMaterial({
    color: "#a8d8f5",
    roughness: 0.17,
    metalness: 0.22,
    clearcoat: 0.8,
  });
  function outline(width, depth, r) {
    const x = -width / 2,
      y = -depth / 2,
      s = new THREE.Shape();
    s.moveTo(x + r, y);
    s.lineTo(x + width - r, y);
    s.quadraticCurveTo(x + width, y, x + width, y + r);
    s.lineTo(x + width, y + depth - r);
    s.quadraticCurveTo(x + width, y + depth, x + width - r, y + depth);
    s.lineTo(x + r, y + depth);
    s.quadraticCurveTo(x, y + depth, x, y + depth - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  const platform = new THREE.Group();
  platform.position.x = PLATFORM.x;
  scene.add(platform);
  function slab(width, depth, height, bottom, side) {
    const geometry = new THREE.ExtrudeGeometry(outline(width, depth, 0.023), {
      depth: height,
      bevelEnabled: true,
      bevelSize: 0.001,
      bevelThickness: 0.0007,
      bevelSegments: 3,
      curveSegments: 10,
      steps: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, [white, side]);
    mesh.position.y = bottom;
    mesh.castShadow = mesh.receiveShadow = true;
    platform.add(mesh);
    return mesh;
  }
  slab(0.198, 0.168, 0.01, -0.001, blueSide);
  slab(0.198, 0.168, 0.01, 0.0113, upperSide);
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: "#20bcff",
    transparent: true,
    opacity: 0.9,
  });
  const topEdgeMaterial = new THREE.LineBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0.95,
  });
  for (const [height, mat] of [
    [0.0098, edgeMaterial],
    [0.0219, topEdgeMaterial],
  ]) {
    const points = outline(0.199, 0.169, 0.023)
      .getPoints(100)
      .map((p) => new THREE.Vector3(p.x, height, -p.y));
    platform.add(
      new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), mat),
    );
  }
  // The reference's fine blue seams divide the lower acrylic sides.
  const seamMaterial = new THREE.LineBasicMaterial({
    color: "#3a96d1",
    transparent: true,
    opacity: 0.75,
  });
  for (const x of [-0.048, 0.048])
    for (const z of [-0.0847, 0.0847]) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0.0007, z),
        new THREE.Vector3(x, 0.009, z),
      ]);
      platform.add(new THREE.Line(g, seamMaterial));
    }
  for (const z of [-0.037, 0.037])
    for (const x of [-0.0997, 0.0997]) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0.0007, z),
        new THREE.Vector3(x, 0.009, z),
      ]);
      platform.add(new THREE.Line(g, seamMaterial));
    }
  for (const x of [-0.048, 0.048]) {
    const tab = new THREE.Mesh(
      new THREE.BoxGeometry(0.029, 0.0008, 0.004),
      white,
    );
    tab.position.set(x, 0.022, 0.0835);
    platform.add(tab);
  }
  return { reflection, platform };
}
