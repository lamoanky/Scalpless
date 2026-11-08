import * as THREE from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { glassFragment } from "./vendor/liquid-glass/refraction.js";
import "./liquid-glass.css";

// Glass is a presentation pass only. Native buttons, focus, pointer ownership
// and the controller remain authoritative. Never capture DOM or camera video.
export function installLiquidGlass(bench) {
  const selector = ".tool-group, .context-controls, .camera-pad, .piece-picker, .manipulation-pad, .specimen-switcher, .anatomy-toggle, .organ-slide, .study-launch, .teaching-launch, .teaching-panel, .hand-tracking-launch, .hand-tracking-panel";
  const panels = [];
  function addPanel(element) {
    if (!element || panels.some(panel => panel.element === element)) return;
    element.classList.add("liquid-glass");
    const frame = element.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
    frame.classList.add("glass-frame"); frame.setAttribute("aria-hidden","true");
    frame.innerHTML = '<rect fill="none" vector-effect="non-scaling-stroke"/>';
    element.append(frame);
    panels.push({element,frame,external:element.ownerDocument!==document,
      surface:new THREE.WebGLRenderTarget(1,1,{depthBuffer:false})});
  }
  document.querySelectorAll(selector).forEach(addPanel);
  const styleOf=element=>element.ownerDocument.defaultView.getComputedStyle(element);
  const material = new THREE.ShaderMaterial({
    uniforms: {u_image:{value:null},u_resolution:{value:new THREE.Vector2()},
      u_textureSize:{value:new THREE.Vector2()},u_containerPosition:{value:new THREE.Vector2()},
      u_scrollY:{value:0},u_pageHeight:{value:1},u_viewportHeight:{value:1},
      u_borderRadius:{value:24},u_blurRadius:{value:5},u_warp:{value:0},
      u_edgeIntensity:{value:.01},u_rimIntensity:{value:.05},u_baseIntensity:{value:.01},
      u_edgeDistance:{value:.15},u_rimDistance:{value:.8},u_baseDistance:{value:.1},
      u_cornerBoost:{value:.02},u_rippleEffect:{value:.1},u_tintOpacity:{value:.08}},
    vertexShader:"varying vec2 v_texcoord;void main(){v_texcoord=vec2(uv.x,1.-uv.y);gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader:glassFragment, transparent:true, depthTest:false, depthWrite:false, toneMapped:false,
  });
  const quad = new FullScreenQuad(material);
  // The upstream shader samples top-down page coordinates. Flip the live
  // framebuffer once so its original GLSL can run without a single edit.
  const topDown = new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
  const flip = new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms:{image:{value:null}},
    vertexShader:"varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader:"uniform sampler2D image;varying vec2 vUv;void main(){gl_FragColor=texture2D(image,vec2(vUv.x,1.-vUv.y));}",
    depthTest:false,depthWrite:false,toneMapped:false,
  }));
  material.uniforms.u_image.value = topDown.texture;
  // Upstream canvases render at CSS resolution. Keep that sampling density on
  // Retina screens too; HTML lettering and the 3D specimen retain full DPI.
  const present = new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms:{image:{value:null}},
    vertexShader:"varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader:"uniform sampler2D image;varying vec2 vUv;void main(){gl_FragColor=texture2D(image,vUv);}",
    transparent:true,premultipliedAlpha:true,depthTest:false,depthWrite:false,toneMapped:false,
  }));
  const viewport = new THREE.Vector4(), scissor = new THREE.Vector4(), size = new THREE.Vector2();
  let texture = null, active = 0, externalActive = 0;
  return {
    addPanel,
    getDebug: () => ({active, externalActive, renderer:"shared", source:"lab-framebuffer", shader:"liquid-glass-js-original"}),
    render() {
      const visible = panels.filter(({element}) => !element.hidden &&
        element.getClientRects().length && styleOf(element).visibility !== "hidden");
      active = visible.length;
      externalActive = visible.filter(panel=>panel.external).length;
      if (!active) return;
      const renderer = bench.renderer, host = bench.host.getBoundingClientRect();
      renderer.getDrawingBufferSize(size);
      if (!texture || texture.image.width !== size.x || texture.image.height !== size.y) {
        texture?.dispose(); texture = new THREE.FramebufferTexture(size.x,size.y);
        texture.minFilter = texture.magFilter = THREE.LinearFilter;
        flip.material.uniforms.image.value = texture;
        topDown.setSize(size.x,size.y);
      }
      // One GPU copy per frame, shared by every visible panel. No readback.
      renderer.copyFramebufferToTexture(texture);
      material.uniforms.u_textureSize.value.set(host.width,host.height);
      material.uniforms.u_pageHeight.value = material.uniforms.u_viewportHeight.value = host.height;
      renderer.getViewport(viewport); renderer.getScissor(scissor);
      const autoClear = renderer.autoClear, scissorTest = renderer.getScissorTest();
      const clearColor = renderer.getClearColor(new THREE.Color()), clearAlpha = renderer.getClearAlpha();
      renderer.autoClear = false;
      try {
        renderer.setScissorTest(false); renderer.setRenderTarget(topDown);
        flip.render(renderer); renderer.setRenderTarget(null); renderer.setScissorTest(true);
        for (const {element,frame,surface,external} of visible) {
          const rect = element.getBoundingClientRect(), w = rect.width, h = rect.height;
          if (w < 1 || h < 1) continue;
          // The native landing CTA lives above this same-origin iframe. Draw
          // its glass in the shared scene, with its HTML label staying on top.
          const offset=external?window.frameElement.getBoundingClientRect():{left:0,top:0};
          const left=rect.left-offset.left,top=rect.top-offset.top,bottom=rect.bottom-offset.top;
          const radius = Math.min(parseFloat(styleOf(element).borderRadius) || 24,w/2,h/2);
          if (!element.contains(frame)) element.append(frame);
          if (frame.dataset.size !== `${w},${h},${radius}`) {
            frame.dataset.size = `${w},${h},${radius}`;
            frame.setAttribute("viewBox",`0 0 ${w} ${h}`);
            for (const [name,value] of Object.entries({x:.5,y:.5,width:w-1,height:h-1,rx:radius,ry:radius}))
              frame.querySelector("rect").setAttribute(name,value);
          }
          material.uniforms.u_resolution.value.set(w,h);
          material.uniforms.u_containerPosition.value.set(left-host.left+w/2,top-host.top+h/2);
          material.uniforms.u_borderRadius.value = radius;
          surface.setSize(Math.ceil(w),Math.ceil(h));
          renderer.setRenderTarget(surface); renderer.setClearColor(0,0); renderer.clear();
          quad.render(renderer);
          renderer.setRenderTarget(null); renderer.setScissorTest(true);
          renderer.setViewport(left-host.left,host.bottom-bottom,w,h);
          renderer.setScissor(left-host.left,host.bottom-bottom,w,h);
          present.material.uniforms.image.value = surface.texture;
          present.render(renderer);
          element.classList.add("glass-ready");
        }
      } finally {
        renderer.setViewport(viewport); renderer.setScissor(scissor);
        renderer.setScissorTest(scissorTest); renderer.autoClear = autoClear;
        renderer.setClearColor(clearColor,clearAlpha);
      }
      document.documentElement.classList.add("glass-live");
    },
  };
}
