import * as THREE from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { HorizontalBlurShader } from "three/addons/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/addons/shaders/VerticalBlurShader.js";
import { PLATFORM } from "./lab-environment.js";

// Height-weighted underside capture follows the actual deformed meshes.
// This supplements directional shadows with a short-range contact occlusion.
export function createContactShadows(renderer, scene) {
  const size = 256,
    width = 0.194,
    depth = 0.164;
  const target = new THREE.WebGLRenderTarget(size, size);
  const scratch = new THREE.WebGLRenderTarget(size, size, {
    depthBuffer: false,
  });
  const shadowScene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(
    -width / 2,
    width / 2,
    depth / 2,
    -depth / 2,
    0.0001,
    0.22,
  );
  camera.position.set(PLATFORM.x, PLATFORM.top - 0.001, 0);
  camera.up.set(0, 0, 1);
  camera.lookAt(PLATFORM.x, PLATFORM.top + 1, 0);
  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { surfaceY: { value: PLATFORM.top } },
    vertexShader: `varying float height;uniform float surfaceY;void main(){vec4 p=modelMatrix*vec4(position,1.);height=p.y-surfaceY;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader: `varying float height;void main(){float a=.85*exp(-max(height,0.)/.014);gl_FragColor=vec4(1.,1.,1.,a);}`,
    blending: THREE.NoBlending,
  });
  const hBlur = new THREE.ShaderMaterial({
    ...HorizontalBlurShader,
    uniforms: THREE.UniformsUtils.clone(HorizontalBlurShader.uniforms),
    depthTest: false,
    depthWrite: false,
  });
  const vBlur = new THREE.ShaderMaterial({
    ...VerticalBlurShader,
    uniforms: THREE.UniformsUtils.clone(VerticalBlurShader.uniforms),
    depthTest: false,
    depthWrite: false,
  });
  hBlur.uniforms.h.value = vBlur.uniforms.v.value = 1.3 / size;
  const quad = new FullScreenQuad(hBlur);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({
      color: "#54406b",
      map: target.texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  shadow.name = "live-specimen-contact-shadow";
  shadow.rotation.x = Math.PI / 2;
  shadow.scale.x = -1;
  shadow.position.set(PLATFORM.x, PLATFORM.top + 0.00035, 0);
  shadow.renderOrder = 3;
  scene.add(shadow);
  let casters = [];
  const visible = (source) => {
    for (let o = source; o; o = o.parent) if (!o.visible) return false;
    return true;
  };
  return {
    setSpecimen(onion) {
      shadowScene.clear();
      const sources = [...onion.parts.values()].flatMap((p) => p.meshes);
      onion.roots.traverse((o) => {
        if (o.isMesh) sources.push(o);
      });
      casters = sources.map((source) => {
        const proxy = new THREE.Mesh(source.geometry, material);
        proxy.matrixAutoUpdate = false;
        proxy.frustumCulled = false;
        shadowScene.add(proxy);
        return { source, proxy };
      });
    },
    update() {
      scene.updateMatrixWorld();
      for (const { source, proxy } of casters) {
        proxy.matrix.copy(source.matrixWorld);
        proxy.visible = visible(source);
      }
      const oldTarget = renderer.getRenderTarget();
      const oldColor = renderer.getClearColor(new THREE.Color()),
        oldAlpha = renderer.getClearAlpha();
      renderer.setClearColor(0xffffff, 0);
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(shadowScene, camera);
      hBlur.uniforms.tDiffuse.value = target.texture;
      quad.material = hBlur;
      renderer.setRenderTarget(scratch);
      renderer.clear();
      quad.render(renderer);
      vBlur.uniforms.tDiffuse.value = scratch.texture;
      quad.material = vBlur;
      renderer.setRenderTarget(target);
      renderer.clear();
      quad.render(renderer);
      renderer.setRenderTarget(oldTarget);
      renderer.setClearColor(oldColor, oldAlpha);
    },
  };
}
