import * as THREE from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";

// Small-radius, half-resolution SSAO reuses the beauty pass's resolved depth.
// No extra scene render, proxy geometry or persistent shadows on moving organs.
export function createTissueOcclusion(renderer, depth, camera) {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, depthBuffer: false,
  });
  const material = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: {
      depth: { value: depth },
      inverseProjection: { value: camera.projectionMatrixInverse },
      projection: { value: camera.projectionMatrix },
      texel: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `
      uniform sampler2D depth;
      uniform mat4 inverseProjection,projection;
      uniform vec2 texel;
      varying vec2 vUv;
      vec2 pixelCenter(vec2 uv){return (floor(uv/texel)+.5)*texel;}
      vec3 positionAt(vec2 uv,float d){
        vec4 p=inverseProjection*vec4(uv*2.-1.,d*2.-1.,1.);
        return p.xyz/p.w;
      }
      void main(){
        // Reconstruct at the depth texel's actual center. Half-resolution UVs
        // otherwise land on full-resolution boundaries and create false slopes.
        vec2 uv0=pixelCenter(vUv);
        float d=texture2D(depth,uv0).r;
        if(d>=.999999){gl_FragColor=vec4(1.,0.,0.,1.);return;}
        vec3 p=positionAt(uv0,d);
        // Choose the shorter derivative to avoid normals crossing silhouettes.
        vec3 l=positionAt(uv0-vec2(texel.x,0.),texture2D(depth,uv0-vec2(texel.x,0.)).r);
        vec3 r=positionAt(uv0+vec2(texel.x,0.),texture2D(depth,uv0+vec2(texel.x,0.)).r);
        vec3 b=positionAt(uv0-vec2(0.,texel.y),texture2D(depth,uv0-vec2(0.,texel.y)).r);
        vec3 t=positionAt(uv0+vec2(0.,texel.y),texture2D(depth,uv0+vec2(0.,texel.y)).r);
        vec3 dx=abs(l.z-p.z)<abs(r.z-p.z)?p-l:r-p;
        vec3 dy=abs(b.z-p.z)<abs(t.z-p.z)?p-b:t-p;
        vec3 n=normalize(cross(dx,dy));
        if(dot(n,-p)<0.)n=-n;
        float radius=.009, sum=0.;
        vec2 screenRadius=vec2(projection[0][0],projection[1][1])*radius/(-p.z)*.5;
        for(int i=0;i<12;i++){
          float angle=float(i)*2.39996323;
          float ring=sqrt((float(i)+.5)/12.);
          vec2 uv=pixelCenter(uv0+vec2(cos(angle),sin(angle))*screenRadius*ring);
          float sd=texture2D(depth,uv).r;
          vec3 delta=positionAt(uv,sd)-p;
          float dist=length(delta);
          // A world-space bias rejects quantization on the nearly flat tray.
          float horizon=max((dot(n,delta)-.00035)/max(dist,.00001)-.12,0.);
          float weight=1.-smoothstep(radius*.3,radius,dist);
          sum+=horizon*weight*step(.00016,dist)*step(sd,.999999);
        }
        gl_FragColor=vec4(clamp(1.-sum*.29,.48,1.),-p.z,0.,1.);
      }`,
  });
  const quad = new FullScreenQuad(material);
  return {
    texture: target.texture,
    resize(w, h) {
      target.setSize(Math.max(1, Math.ceil(w / 2)), Math.max(1, Math.ceil(h / 2)));
      material.uniforms.texel.value.set(1 / w, 1 / h);
    },
    render() {
      renderer.setRenderTarget(target);
      quad.render(renderer);
      renderer.setRenderTarget(null);
    },
  };
}
