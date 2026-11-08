import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { TexturePass } from "three/addons/postprocessing/TexturePass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";

export async function createRenderPipeline(renderer, scene, camera) {
  const background = await new THREE.TextureLoader().loadAsync(
    `${import.meta.env.BASE_URL}art/lab-reference-background.webp`,
  );
  // The reference is already display-referred. Composite it after tone mapping
  // the live 3D scene, so ACES does not turn its original blue pixels gray.
  background.colorSpace = THREE.NoColorSpace;
  const beauty = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer);
  composer.addPass(new TexturePass(beauty.texture));
  composer.addPass(
    new UnrealBloomPass(new THREE.Vector2(1, 1), 0.12, 0.35, 3.2),
  );
  composer.addPass(new SMAAPass());
  const composite = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      coverage: { value: null },
      backdrop: { value: background },
      crop: { value: new THREE.Vector2(1, 1) },
      toneMappingExposure: { value: renderer.toneMappingExposure },
    },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
      uniform sampler2D tDiffuse,coverage,backdrop;
      uniform vec2 crop;
      varying vec2 vUv;
      #include <tonemapping_pars_fragment>
      void main(){
        float alpha=texture2D(coverage,vUv).a;
        vec3 color=texture2D(tDiffuse,vUv).rgb;
        // Render-target color is premultiplied by coverage; unpremultiply before
        // tone mapping, then blend against the original image in display space.
        color=ACESFilmicToneMapping(color/max(alpha,.0001));
        color=sRGBTransferOETF(vec4(color,1.)).rgb;
        vec3 image=texture2D(backdrop,(vUv-.5)*crop+.5).rgb;
        gl_FragColor=vec4(mix(image,color,alpha),1.);
      }`,
  });
  // ShaderPass clones uniforms; render-target textures must be assigned afterward.
  composite.uniforms.coverage.value = beauty.texture;
  composite.material.toneMapped = false;
  composer.addPass(composite);
  return {
    resize(w, h) {
      const ratio = renderer.getPixelRatio();
      beauty.setSize(Math.round(w * ratio), Math.round(h * ratio));
      composer.setSize(w, h);
      const viewAspect = w / h;
      const imageAspect = background.image.width / background.image.height;
      composite.uniforms.crop.value.set(
        Math.min(1, viewAspect / imageAspect),
        Math.min(1, imageAspect / viewAspect),
      );
    },
    render(dt) {
      renderer.setRenderTarget(beauty);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      composite.uniforms.toneMappingExposure.value =
        renderer.toneMappingExposure;
      composer.render(dt);
    },
  };
}
