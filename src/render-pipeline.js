import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { TexturePass } from "three/addons/postprocessing/TexturePass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { createTissueOcclusion } from "./tissue-occlusion.js";

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
  beauty.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  const occlusion = createTissueOcclusion(renderer, beauty.depthTexture, camera);
  let tissueOcclusion = false;
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
      presentationBackdrop: { value: background },
      presentationOpacity: { value: 0 },
      crop: { value: new THREE.Vector2(1, 1) },
      toneMappingExposure: { value: renderer.toneMappingExposure },
      tissueOcclusion: { value: false },
      neutralTone: { value: false },
      occlusion: { value: null },
      depth: { value: null },
      inverseProjection: { value: camera.projectionMatrixInverse },
      aoTexel: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
      uniform sampler2D tDiffuse,coverage,backdrop;
      uniform sampler2D presentationBackdrop;
      uniform float presentationOpacity;
      uniform sampler2D occlusion,depth;
      uniform bool tissueOcclusion,neutralTone;
      uniform mat4 inverseProjection;
      uniform vec2 aoTexel;
      uniform vec2 crop;
      varying vec2 vUv;
      #include <tonemapping_pars_fragment>
      void main(){
        float alpha=texture2D(coverage,vUv).a;
        vec3 color=texture2D(tDiffuse,vUv).rgb;
        if(tissueOcclusion){
          vec4 p=inverseProjection*vec4(vUv*2.-1.,texture2D(depth,vUv).r*2.-1.,1.);
          float z=-p.z/p.w, sum=0.,weight=0.;
          // Bilateral reconstruction preserves small gaps without silhouette halos.
          for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
            vec2 sampleAO=texture2D(occlusion,vUv+vec2(float(x),float(y))*aoTexel).rg;
            float w=exp(-abs(sampleAO.g-z)*1800.)/(1.+float(x*x+y*y));
            sum+=sampleAO.r*w;weight+=w;
          }
          color*=weight>.0001?sum/weight:1.;
        }
        // Render-target color is premultiplied by coverage; unpremultiply before
        // tone mapping, then blend against the original image in display space.
        color=neutralTone?NeutralToneMapping(color/max(alpha,.0001)):ACESFilmicToneMapping(color/max(alpha,.0001));
        color=sRGBTransferOETF(vec4(color,1.)).rgb;
        vec3 image=texture2D(backdrop,(vUv-.5)*crop+.5).rgb;
        vec3 intro=sRGBTransferOETF(texture2D(presentationBackdrop,vUv)).rgb;
        image=mix(image,intro,presentationOpacity);
        gl_FragColor=vec4(mix(image,color,alpha),1.);
      }`,
  });
  // ShaderPass clones uniforms; render-target textures must be assigned afterward.
  composite.uniforms.coverage.value = beauty.texture;
  composite.uniforms.occlusion.value = occlusion.texture;
  composite.uniforms.depth.value = beauty.depthTexture;
  composite.uniforms.inverseProjection.value = camera.projectionMatrixInverse;
  composite.material.toneMapped = false;
  composer.addPass(composite);
  return {
    setPresentationBackdrop(texture, opacity) {
      composite.uniforms.presentationBackdrop.value = texture ?? background;
      composite.uniforms.presentationOpacity.value = THREE.MathUtils.clamp(opacity, 0, 1);
    },
    setNeutralTone(enabled) { composite.uniforms.neutralTone.value = enabled; },
    setTissueOcclusion(enabled) {
      tissueOcclusion = enabled;
      composite.uniforms.tissueOcclusion.value = enabled;
    },
    resize(w, h) {
      const ratio = renderer.getPixelRatio();
      beauty.setSize(Math.round(w * ratio), Math.round(h * ratio));
      occlusion.resize(Math.round(w * ratio), Math.round(h * ratio));
      composite.uniforms.aoTexel.value.set(2 / (w * ratio), 2 / (h * ratio));
      composer.setPixelRatio(ratio);
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
      if (tissueOcclusion) occlusion.render();
      composite.uniforms.toneMappingExposure.value =
        renderer.toneMappingExposure;
      composer.render(dt);
    },
  };
}
