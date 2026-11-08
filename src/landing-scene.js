import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

function prepareFade(root) {
  const materials=[];
  root.traverse(object=>{
    if(!object.isMesh)return;
    object.castShadow=object.receiveShadow=true;
    const copy=source=>{
      const material=source.clone();
      material.onBeforeCompile=source.onBeforeCompile;
      material.customProgramCacheKey=source.customProgramCacheKey;
      materials.push({material,opacity:source.opacity,transparent:source.transparent,depthWrite:source.depthWrite});
      return material;
    };
    object.material=Array.isArray(object.material)?object.material.map(copy):copy(object.material);
  });
  return opacity=>{
    root.visible=opacity>0;
    for(const base of materials) {
      const transparent=base.transparent||opacity<1;
      if(base.material.transparent!==transparent){base.material.transparent=transparent;base.material.needsUpdate=true;}
      base.material.depthWrite=base.depthWrite&&opacity===1;
      base.material.opacity=base.opacity*opacity;
    }
  };
}

export async function createLandingScene(bench,specimen) {
  const [gltf,backdrop]=await Promise.all([
    new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/frog/scalpless-frog.glb`),
    new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}art/landing-frog-background.webp`),
  ]);
  // This is the supplied panel artwork, with the photographed center frog
  // cleared so there is only one hero. It stays fixed in screen space.
  backdrop.colorSpace=THREE.NoColorSpace;
  const {scene:world,camera}=bench;
  const homePosition=bench.homePosition.clone(),homeTarget=bench.homeTarget.clone();
  const instrumentPositions=Object.values(bench.tools).map(tool=>[tool,tool.position.clone()]);
  const contactShadow=world.getObjectByName('live-specimen-contact-shadow');
  const center=specimen.origin.clone().add(new THREE.Vector3(0,.044,0));
  const groundY=specimen.origin.y-.035*.05;

  const specimenRoot=new THREE.Group();specimenRoot.name='continuous-frog';
  specimenRoot.matrixAutoUpdate=false;specimenRoot.visible=false;world.add(specimenRoot);
  for(const part of specimen.parts.values())specimenRoot.add(part.group);
  const meshIds=[...specimen.parts.values()].flatMap(part=>part.meshes.map(mesh=>mesh.uuid));

  const heroRoot=new THREE.Group();heroRoot.name='imported-landing-frog';
  heroRoot.matrixAutoUpdate=false;world.add(heroRoot);
  const model=gltf.scene;
  const bounds=new THREE.Box3().setFromObject(model),modelCenter=bounds.getCenter(new THREE.Vector3());
  model.position.sub(modelCenter);
  const heroVisual=new THREE.Group();heroVisual.add(model);heroVisual.position.copy(center);
  heroVisual.scale.setScalar(.033);
  // The Blender exterior is upright. Turn it 180° around its center to match
  // the ventral pose used by the rotation root, and point its nose down -Z.
  heroVisual.rotation.set(0,Math.PI,Math.PI);
  heroRoot.add(heroVisual);
  const fadeHero=prepareFade(heroRoot);
  const seatedAnchorY=groundY+(bounds.max.y-bounds.min.y)*.033/2;

  // Share the lab geometry during the short dissolve; the original interactive
  // groups and materials stay intact and take over once entry is complete.
  const handoffRoot=specimenRoot.clone(true);handoffRoot.name='frog-handoff-exterior';
  handoffRoot.traverse(object=>{
    if(object.isMesh)object.visible=object.visible&&['body','abdomen'].includes(object.userData.partId);
  });
  const fadeHandoff=prepareFade(handoffRoot);fadeHandoff(0);world.add(handoffRoot);

  const floor=new Reflector(new THREE.PlaneGeometry(2,2),{
    color:0xc0ddff,textureWidth:1024,textureHeight:1024,multisample:0,clipBias:.003,
  });
  floor.name='landing-frog-reflection';floor.rotation.x=-Math.PI/2;
  floor.position.set(specimen.origin.x,groundY,0);world.add(floor);
  floor.material.transparent=true;floor.material.depthWrite=false;
  floor.material.uniforms.roomOpacity={value:1};
  floor.material.fragmentShader=floor.material.fragmentShader
    .replace('varying vec4 vUv;','varying vec4 vUv; uniform float roomOpacity;')
    .replace('vec4 base = texture2DProj( tDiffuse, vUv );',`vec2 uv=vUv.xy/vUv.w;
      vec2 blur=vec2(.0025,.004);
      vec4 base=texture2D(tDiffuse,uv)*.4;
      base+=texture2D(tDiffuse,uv+blur)*.15;
      base+=texture2D(tDiffuse,uv-blur)*.15;
      base+=texture2D(tDiffuse,uv+vec2(blur.x,-blur.y))*.15;
      base+=texture2D(tDiffuse,uv+vec2(-blur.x,blur.y))*.15;`)
    .replace('gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );',
      'gl_FragColor=vec4(base.rgb/max(base.a,.001),base.a*.24*roomOpacity);');

  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
  const context=shadowCanvas.getContext('2d'),gradient=context.createRadialGradient(64,64,5,64,64,62);
  gradient.addColorStop(0,'rgba(31,69,137,.24)');gradient.addColorStop(1,'rgba(45,84,150,0)');
  context.fillStyle=gradient;context.fillRect(0,0,128,128);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(.18,.16),new THREE.MeshBasicMaterial({
    map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false,
  }));
  shadow.rotation.x=-Math.PI/2;shadow.position.set(specimen.origin.x,groundY+.0002,.01);world.add(shadow);

  const flip=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI);
  const identity=new THREE.Quaternion(),rotation=new THREE.Quaternion();
  const anchor=new THREE.Vector3(),startAnchor=new THREE.Vector3();
  const cameraStart=new THREE.Vector3(),targetStart=new THREE.Vector3(),finalCamera=new THREE.Vector3();
  const finalMatrix=new THREE.Matrix4(),pivot=new THREE.Matrix4().makeTranslation(-center.x,-center.y,-center.z);
  const unitScale=new THREE.Vector3(1,1,1),up=new THREE.Vector3(0,1,0),spin=new THREE.Quaternion();
  let lastFrame=null;
  function update(frame) {
    lastFrame=frame;specimenRoot.visible=false;
    bench.setPresentationBackdrop(backdrop,frame.backdropOpacity,{displayReferred:true});
    bench.environment.reflection.visible=frame.platform>0;
    floor.visible=frame.platform<1;
    floor.material.uniforms.roomOpacity.value=1-frame.platform;
    shadow.visible=frame.pose<.15;
    shadow.material.opacity=1-THREE.MathUtils.smoothstep(frame.pose,0,.15);
    specimen.setPresentationPose?.(frame.pose);
    const mobile=bench.host.clientWidth<700;
    const yaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),(mobile?2.7:2.1)+frame.previewRotation+(frame.idleRotation??0));
    rotation.slerpQuaternions(yaw.clone().multiply(flip),identity,frame.pose);
    // One full pirouette on the way onto the platform; 0 and 2π both leave
    // the exact start and bench orientations untouched.
    rotation.premultiply(spin.setFromAxisAngle(up,frame.pose*Math.PI*2));
    startAnchor.set(0,0,.006).applyQuaternion(yaw).add(specimen.origin);startAnchor.y=seatedAnchorY;
    anchor.lerpVectors(startAnchor,center,frame.pose);anchor.y+=Math.sin(frame.pose*Math.PI)*.06;
    finalMatrix.compose(anchor,rotation,unitScale).multiply(pivot);
    if(frame.pose===1)finalMatrix.identity();
    for(const root of [specimenRoot,heroRoot,handoffRoot]) {
      root.matrix.copy(finalMatrix);root.matrixWorldNeedsUpdate=true;
    }
    fadeHero(1-frame.handoff);fadeHandoff(frame.handoff);
    cameraStart.set(0,2.65,mobile?12.7:8.3).multiplyScalar(.05).add(specimen.origin);
    targetStart.set(0,1,0).multiplyScalar(.05).add(specimen.origin);
    finalCamera.copy(homePosition);
    if(mobile)finalCamera.sub(homeTarget).multiplyScalar(1.7).add(homeTarget);
    camera.position.lerpVectors(cameraStart,finalCamera,frame.camera);
    bench.controls.target.lerpVectors(targetStart,homeTarget,frame.camera);
    const lift=Math.sin(frame.pose*Math.PI);
    bench.controls.target.y+=lift*.045;camera.position.y+=lift*.025;
    camera.position.sub(bench.controls.target).multiplyScalar(1+lift*.13).add(bench.controls.target);
    camera.lookAt(bench.controls.target);camera.updateMatrixWorld(true);
    bench.environment.platform.visible=frame.platform>0;
    bench.environment.platform.position.y=-.025*(1-frame.platform);
    for(const [tool,position] of instrumentPositions) {
      tool.visible=frame.platform>0;tool.position.copy(position);tool.position.y-=.025*(1-frame.platform);
    }
    if(contactShadow)contactShadow.visible=frame.platform>.95;
  }
  function finish() {
    floor.visible=shadow.visible=false;fadeHero(0);fadeHandoff(0);
    bench.environment.reflection.visible=true;bench.setPresentationBackdrop(null,0);
    specimenRoot.matrix.identity();specimenRoot.matrixWorldNeedsUpdate=true;specimenRoot.visible=true;
    bench.environment.platform.visible=true;bench.environment.platform.position.y=0;
    for(const [tool,position] of instrumentPositions){tool.visible=true;tool.position.copy(position);}
    if(contactShadow)contactShadow.visible=true;
  }
  return {update,finish,getDebug:()=>({
    meshIds,appearance:specimen.appearance,pose:lastFrame?.pose??0,
    entryProgress:lastFrame?.entryProgress??0,handoff:lastFrame?.handoff??0,
    previewRotation:lastFrame?.previewRotation??0,
    idleRotation:lastFrame?.idleRotation??0,
    heroModel:'models/frog/scalpless-frog.glb',heroVisible:heroRoot.visible,
    heroRotation:heroVisual.rotation.toArray(),panelsFixed:true,
    backdrop:'art/landing-frog-background.webp',backdropOpacity:lastFrame?.backdropOpacity??1,
    rootMatrix:specimenRoot.matrix.toArray(),camera:camera.position.toArray(),
    platformY:bench.environment.platform.position.y,platformVisible:bench.environment.platform.visible,
    labReflection:bench.environment.reflection.visible,introFloor:floor.visible,
    sameMeshes:meshIds.every(id=>world.getObjectByProperty('uuid',id)),
  })};
}
