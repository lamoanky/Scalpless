import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { createLandingFrog } from './landing-frog.js';

function roundedRect(w,h,r) {
  const s=new THREE.Shape(),x=-w/2,y=-h/2;
  s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);
  s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);
  s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;
}
function cellTexture() {
  const c=document.createElement('canvas');c.width=c.height=768;const x=c.getContext('2d');
  x.fillStyle='#c6b7ff';x.fillRect(0,0,768,768);
  let seed=1923;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const rows=9,cols=9,points=[];
  for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++)points.push([i*90+(rand()-.5)*36,j*90+(rand()-.5)*36]);
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++) {
    const p=[points[j*10+i],points[j*10+i+1],points[(j+1)*10+i+1],points[(j+1)*10+i]];
    x.fillStyle=`hsl(${265+rand()*15} 77% ${74+rand()*16}%)`;x.strokeStyle='#9470d5';x.lineWidth=3;
    x.beginPath();p.forEach(([a,b],k)=>k?x.lineTo(a,b):x.moveTo(a,b));x.closePath();x.fill();x.stroke();
    const cx=p.reduce((s,p)=>s+p[0],0)/4,cy=p.reduce((s,p)=>s+p[1],0)/4;
    x.fillStyle='#8551cb';x.beginPath();x.ellipse(cx,cy,5+rand()*5,8+rand()*7,rand()*3,0,7);x.fill();
  }
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}

// Presentation lives inside the actual bench renderer. Every central frog mesh
// stays in the specimen parts map from the first frame through tool interaction.
export function createLandingScene(bench, specimen) {
  const { scene:world, camera, renderer } = bench;
  const scene=new THREE.Group();scene.name='landing-room';
  scene.scale.setScalar(.05);scene.position.copy(specimen.origin);world.add(scene);
  const specimenRoot=new THREE.Group();specimenRoot.name='continuous-frog';
  specimenRoot.matrixAutoUpdate=false;world.add(specimenRoot);
  for(const part of specimen.parts.values()) specimenRoot.add(part.group);
  const meshIds=[...specimen.parts.values()].flatMap(p=>p.meshes.map(m=>m.uuid));
  const homePosition=bench.homePosition.clone(),homeTarget=bench.homeTarget.clone();
  const instrumentPositions=Object.values(bench.tools).map(tool=>[tool,tool.position.clone()]);
  const contactShadow=world.getObjectByName('live-specimen-contact-shadow');
  bench.environment.reflection.visible=false;
  const sky=document.createElement('canvas');sky.width=sky.height=512;
  const skyContext=sky.getContext('2d'),skyGradient=skyContext.createRadialGradient(275,240,5,256,256,350);
  skyGradient.addColorStop(0,'#d1e5ff');skyGradient.addColorStop(.5,'#a8c9fa');skyGradient.addColorStop(1,'#96b5ed');
  skyContext.fillStyle=skyGradient;skyContext.fillRect(0,0,512,512);
  const skyTexture=new THREE.CanvasTexture(sky);skyTexture.colorSpace=THREE.SRGBColorSpace;
  // Both rooms composite behind the very same specimen. The intro floor and
  // backdrop fade before entry, restoring the onion bench's real reflections.
  bench.setPresentationBackdrop(skyTexture,1);
  const {group:frog,variant,pattern}=createLandingFrog();
  const floor=new Reflector(new THREE.PlaneGeometry(40,40),{color:0xbedcfa,textureWidth:1024,textureHeight:1024,multisample:0,clipBias:.003});
  floor.rotation.x=-Math.PI/2;floor.position.y=-.035;scene.add(floor);
  // Frosted reflection fades into the same sky at the horizon. Sample the
  // reflected image locally instead of rendering another blur-pass chain.
  floor.material.uniforms.skyMap={value:skyTexture};
  floor.material.uniforms.roomOpacity={value:1};
  floor.material.transparent=true;
  floor.material.depthWrite=false;
  floor.material.vertexShader=floor.material.vertexShader
    .replace('varying vec4 vUv;','varying vec4 vUv; varying vec4 floorClip; varying vec3 floorWorld;')
    .replace('#include <logdepthbuf_vertex>',`floorClip=gl_Position;
      floorWorld=(modelMatrix*vec4(position,1.)).xyz;\n#include <logdepthbuf_vertex>`);
  floor.material.fragmentShader=floor.material.fragmentShader
    .replace('varying vec4 vUv;','varying vec4 vUv; varying vec4 floorClip; varying vec3 floorWorld; uniform sampler2D skyMap; uniform float roomOpacity;')
    .replace('vec4 base = texture2DProj( tDiffuse, vUv );',`vec2 uv=vUv.xy/vUv.w;
      vec2 blur=vec2(.0025,.004);
      vec4 base=texture2D(tDiffuse,uv)*.28;
      base+=texture2D(tDiffuse,uv+blur)*.18;
      base+=texture2D(tDiffuse,uv-blur)*.18;
      base+=texture2D(tDiffuse,uv+vec2(blur.x,-blur.y))*.18;
      base+=texture2D(tDiffuse,uv+vec2(-blur.x,blur.y))*.18;`)
    .replace('gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );',`vec2 screenUv=floorClip.xy/floorClip.w*.5+.5;
      vec3 sky=texture2D(skyMap,screenUv).rgb;
      float strength=.45*(1.-smoothstep(3.,15.,length(floorWorld.xz)));
      // Uncovered reflection texels are transparent; don't blend their black
      // RGB into the sky when the main scene has a composited backdrop.
      gl_FragColor=vec4(mix(sky,base.rgb/max(base.a,.001),strength*base.a),roomOpacity);`);
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
  const sc=shadowCanvas.getContext('2d'),grad=sc.createRadialGradient(64,64,5,64,64,62);
  grad.addColorStop(0,'rgba(31,69,137,.3)');grad.addColorStop(.5,'rgba(45,84,150,.18)');grad.addColorStop(1,'rgba(45,84,150,0)');
  sc.fillStyle=grad;sc.fillRect(0,0,128,128);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(3.6,3.2),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.set(.12,-.02,.55);scene.add(shadow);
  const halos=new THREE.Group();scene.add(halos);
  for(const [r,y,z,tilt] of [[5.5,6.7,-3.6,.12],[1.7,1.3,-4.5,-.35]]) {
    const ring=new THREE.Mesh(new THREE.TorusGeometry(r,.028,8,160),new THREE.MeshBasicMaterial({color:new THREE.Color(2.8,3.8,4.4),toneMapped:false}));
    ring.position.set(.3,y,z);ring.rotation.y=tilt;halos.add(ring);
  }
  const panels=[];
  const cellMap=cellTexture();
  for(const [index,x,y,z,w,h,angle] of [
    [0,-3.08,1.58,-.35,1.3,2.75,.23],[1,-1.94,1.48,-.74,1.15,2.45,.16],
    [2,-.91,1.38,-1.18,1.05,2.17,.08],[3,2.10,1.47,-.68,1.18,2.5,-.18],
    [4,3.29,1.6,-.4,1.32,2.78,-.25],
  ]) {
    const panel=new THREE.Group();panel.position.set(x,y,z);panel.rotation.y=angle;
    const shape=roundedRect(w,h,.13);
    const glass=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshPhysicalMaterial({color:'#d4edff',transparent:true,opacity:.22,roughness:.12,metalness:.15,clearcoat:1,side:THREE.DoubleSide,depthWrite:false}));
    panel.add(glass);
    const outline=shape.getPoints(64).map(p=>new THREE.Vector3(p.x,p.y,0));
    const edge=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(outline,true),200,.006,5,true),new THREE.MeshBasicMaterial({color:new THREE.Color(.4,1.4,2.5),toneMapped:false}));panel.add(edge);
    if(index<3) {
      const miniature=index===0?frog.clone():variant(index===1?'muscle':'anatomy');
      miniature.scale.setScalar(index===0?.39:.36);miniature.rotation.y=2.1;
      miniature.position.set(0,-.03,.14);panel.add(miniature);
    } else if(index===3) {
      const geometry=new THREE.ShapeGeometry(roundedRect(w-.2,1.2,.07));
      const p=geometry.attributes.position,uv=geometry.attributes.uv;
      for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/(w-.2)+.5,p.getY(i)/1.2+.5);
      const study=new THREE.Mesh(geometry,new THREE.MeshPhysicalMaterial({map:pattern,roughness:.2,clearcoat:.6,side:THREE.DoubleSide}));
      study.position.set(0,.29,.015);panel.add(study);
    } else {
      const study=new THREE.Mesh(new THREE.CircleGeometry(.53,64),new THREE.MeshBasicMaterial({map:cellMap}));study.position.set(0,.34,.015);panel.add(study);
      const edge=new THREE.Mesh(new THREE.TorusGeometry(.53,.006,5,64),new THREE.MeshBasicMaterial({color:'#8cb9ff'}));edge.position.copy(study.position);panel.add(edge);
    }
    for(let j=0;j<4;j++) {
      const dot=new THREE.Mesh(new THREE.CircleGeometry(.027,12),new THREE.MeshBasicMaterial({color:j===index%4?'#25b8f1':'#a8caee',transparent:true,opacity:j===index%4?.9:.5}));
      dot.position.set((j-1.5)*.13,-.49,.03);panel.add(dot);
    }
    panel.traverse(o=>{if(o.isMesh)o.material=o.material.clone();});
    panel.userData={x,y,z,angle};scene.add(panel);panels.push(panel);
  }
  const center=specimen.origin.clone().add(new THREE.Vector3(0,.044,0));
  const flip=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI);
  const identity=new THREE.Quaternion();
  const rotation=new THREE.Quaternion(),anchor=new THREE.Vector3(),startAnchor=new THREE.Vector3();
  const cameraStart=new THREE.Vector3(),targetStart=new THREE.Vector3();
  const finalMatrix=new THREE.Matrix4();
  let lastFrame=null;
  function update(frame) {
    lastFrame=frame;
    const room=THREE.MathUtils.smoothstep(frame.platform,.05,.95);
    floor.visible=room<1;
    floor.material.uniforms.roomOpacity.value=1-room;
    bench.environment.reflection.visible=room>0;
    bench.setPresentationBackdrop(skyTexture,1-room);
    specimen.setPresentationPose?.(frame.pose);
    const mobile=bench.host.clientWidth<700;
    const yaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),mobile?2.7:2.1);
    const initialRotation=yaw.clone().multiply(flip);
    rotation.slerpQuaternions(initialRotation,identity,frame.pose);
    startAnchor.set(0,.038,.006).applyQuaternion(yaw).add(specimen.origin);
    anchor.lerpVectors(startAnchor,center,frame.pose);
    anchor.y+=Math.sin(frame.pose*Math.PI)*.035;
    finalMatrix.compose(anchor,rotation,new THREE.Vector3(1,1,1));
    finalMatrix.multiply(new THREE.Matrix4().makeTranslation(-center.x,-center.y,-center.z));
    if(frame.pose===1) finalMatrix.identity();
    specimenRoot.matrix.copy(finalMatrix);specimenRoot.matrixWorldNeedsUpdate=true;
    cameraStart.set(0,2.65,mobile?12.7:8.3).multiplyScalar(.05).add(specimen.origin);
    targetStart.set(0,1,0).multiplyScalar(.05).add(specimen.origin);
    const finalCamera=homePosition.clone();
    if(mobile) finalCamera.sub(homeTarget).multiplyScalar(1.7).add(homeTarget);
    camera.position.lerpVectors(cameraStart,finalCamera,frame.camera);
    bench.controls.target.lerpVectors(targetStart,homeTarget,frame.camera);
    const lift=Math.sin(frame.pose*Math.PI);
    bench.controls.target.y+=lift*.045;
    camera.position.y+=lift*.025;
    camera.position.sub(bench.controls.target).multiplyScalar(1+lift*.13).add(bench.controls.target);
    camera.lookAt(bench.controls.target);camera.updateMatrixWorld(true);
    const tray=frame.platform;
    bench.environment.platform.visible=tray>0;
    bench.environment.platform.position.y=-.025*(1-tray);
    for(const [tool,position] of instrumentPositions) {
      tool.visible=tray>0;tool.position.copy(position);tool.position.y-=.025*(1-tray);
    }
    if(contactShadow)contactShadow.visible=tray>.95;
    floor.position.y=THREE.MathUtils.lerp(-.035,(-.0033-specimen.origin.y)/.05,frame.panelSpread);
    shadow.visible=frame.pose<.01;
    halos.visible=frame.panelsOpacity>0;
    halos.scale.setScalar(1+frame.panelSpread*.6);
    for(const panel of panels) {
      const {x,y,z,angle}=panel.userData;
      panel.position.set(x*(mobile?.4:1)*(1+frame.panelSpread*1.7),y+(mobile?.3:0),z-frame.panelSpread*3-(mobile?.8:0));
      panel.scale.setScalar(mobile?.78:1);
      panel.rotation.y=angle-Math.sign(x)*frame.panelSpread*.3;
      panel.visible=frame.panelsOpacity>.001&&!(mobile&&Math.abs(x)<2.5);
      panel.traverse(o=>{if(!o.isMesh)return;
        o.userData.baseOpacity??=o.material.opacity;
        if(frame.panelsOpacity<1&&!o.material.transparent){o.material.transparent=true;o.material.needsUpdate=true;}
        o.material.opacity=o.userData.baseOpacity*frame.panelsOpacity;
      });
    }
  }
  function finish() {
    floor.visible=false;
    bench.environment.reflection.visible=true;
    bench.setPresentationBackdrop(null,0);
    specimenRoot.matrix.identity();specimenRoot.matrixWorldNeedsUpdate=true;
    bench.environment.platform.visible=true;bench.environment.platform.position.y=0;
    for(const [tool,position] of instrumentPositions){tool.visible=true;tool.position.copy(position);}
    if(contactShadow)contactShadow.visible=true;
    panels.forEach(p=>p.visible=false);halos.visible=false;shadow.visible=false;
  }
  return {update,finish,getDebug:()=>({
    meshIds,appearance:specimen.appearance,pose:lastFrame?.pose??0,
    rootMatrix:specimenRoot.matrix.toArray(),camera:camera.position.toArray(),
    platformY:bench.environment.platform.position.y,
    labReflection:bench.environment.reflection.visible,
    introFloor:floor.visible,
    sameMeshes:meshIds.every(id=>world.getObjectByProperty('uuid',id)),
  })};
}
