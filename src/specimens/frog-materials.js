import * as THREE from "three";

// Materials only. Positions/normals are read in the shader; no displacement,
// UV edits, mesh replacement, or changes to raycast/collider geometry.
function tissueSurface(material, detail, {
  scale = 32, bump = 0.000045, vessels = 0, mottling = 0.24,
  ventral = null, cavity = false, coatDetail = .25, underside = false, exterior = false,
} = {}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      frogDetail: { value: detail },
      frogScale: { value: scale },
      frogBump: { value: bump },
      frogVessels: { value: vessels },
      frogMottling: { value: mottling },
      frogCoatDetail: { value: coatDetail },
      ...(ventral ? { frogBelly: { value: ventral } } : {}),
    });
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nattribute vec3 frogRestPosition, frogRestNormal;\nvarying vec3 vFrogPosition, vFrogNormal;",
    ).replace("#include <begin_vertex>",
      "#include <begin_vertex>\nvFrogPosition=frogRestPosition; vFrogNormal=frogRestNormal;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
      #include <common>
      varying vec3 vFrogPosition, vFrogNormal;
      uniform sampler2D frogDetail;
      uniform float frogScale, frogBump, frogVessels, frogMottling, frogCoatDetail;
      ${ventral ? "uniform sampler2D frogBelly;" : ""}
      vec4 frogProject(sampler2D tex, vec3 p, vec3 weights) {
        return texture2D(tex,p.yz)*weights.x
             + texture2D(tex,p.zx)*weights.y
             + texture2D(tex,p.xy)*weights.z;
      }
    `).replace("#include <map_fragment>", `
      vec3 frogWeights=pow(abs(normalize(vFrogNormal)),vec3(4.));
      frogWeights/=max(dot(frogWeights,vec3(1.)),.0001);
      vec3 frogP=vFrogPosition*frogScale;
      vec4 frogTex=frogProject(frogDetail,frogP,frogWeights);
      #ifdef USE_MAP
        ${exterior ? `
          // Authored part-local atlas keeps flank/midline markings continuous
          // across the torso and detachable wall; micro-detail stays triplanar.
          diffuseColor *= texture2D(map,(vFrogPosition.xz+vec2(.11,.09))/vec2(.22,.20));
        ` : "diffuseColor *= frogProject(map,frogP,frogWeights);"}
      #endif
      ${ventral ? `
        float ventral=smoothstep(.05,.85,normalize(vFrogNormal).y);
        diffuseColor.rgb=mix(diffuseColor.rgb,
          frogProject(frogBelly,frogP,frogWeights).rgb,ventral*.95);
      ` : ""}
      ${underside ? `
        // The removed abdominal wall has a fleshy inner face and a thin cut edge.
        float innerFace=1.-smoothstep(-.25,.15,normalize(vFrogNormal).y);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.40,.17,.17),innerFace*.92);
      ` : ""}
      diffuseColor.rgb *= 1. + (frogTex.r-.5)*frogMottling;
      // Capillaries tint the tissue, rather than looking like painted black lines.
      diffuseColor.rgb=mix(diffuseColor.rgb,
        diffuseColor.rgb*vec3(.76,.30,.35),frogTex.b*frogVessels);
      ${cavity ? `
        // Fixed lining only: darker at the peripheral recess and under its rim.
        // Moving organs get live screen-space contact occlusion, never baked stains.
        float recess=smoothstep(.35,1.,length(vFrogPosition.xz/vec2(.029,.042)));
        diffuseColor.rgb*=mix(1.,.61,recess);
      ` : ""}
    `).replace("#include <roughnessmap_fragment>", `
      #include <roughnessmap_fragment>
      roughnessFactor*=mix(.87,1.08,frogTex.r);
    `).replace("#include <normal_fragment_maps>", `
      #include <normal_fragment_maps>
      // Surface-gradient bump in view space. Unlike tangent-space normal maps,
      // this survives pole pinching and overlapping/reused UVs on merged lobes.
      vec3 frogDx=dFdx(-vViewPosition),frogDy=dFdy(-vViewPosition);
      vec3 frogR1=cross(frogDy,normal),frogR2=cross(normal,frogDx);
      float frogDet=dot(frogDx,frogR1);
      float frogHeight=frogTex.g*frogBump;
      vec3 frogGradient=sign(frogDet)*(dFdx(frogHeight)*frogR1+dFdy(frogHeight)*frogR2);
      normal=normalize(max(abs(frogDet),1e-12)*normal-frogGradient);
    `).replace("#include <clearcoat_normal_fragment_maps>", `
      #include <clearcoat_normal_fragment_maps>
      #ifdef USE_CLEARCOAT
        // A moist coating follows the tissue grain; a perfectly smooth coating
        // hid the bump detail and made every organ look like polished plastic.
        clearcoatNormal=normalize(mix(clearcoatNormal,normal,frogCoatDetail));
      #endif
    `);
  };
  material.customProgramCacheKey = () => `frog-tissue-v5:${!!ventral}:${cavity}:${underside}:${exterior}`;
  return material;
}

export async function frogMaterials({ appearance = "natural" } = {}) {
  const blue = appearance === "blue";
  const loader = new THREE.TextureLoader();
  const base = `${import.meta.env.BASE_URL}textures/frog/`;
  async function texture(file, color = false) {
    const t = await loader.loadAsync(base + file);
    t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }
  const [exteriorMap, irisMap, skinDetail, organDetail, membraneDetail,
    muscleDetail, lungDetail, liverDetail, digestiveDetail, vascularDetail] =
    await Promise.all([
      texture(blue ? "exterior-blue-color.webp" : "exterior-color.webp", true),
      texture("iris-color.webp", true), texture("exterior-detail.png"),
      texture("organ-detail.png"), texture("membrane-detail.png"),
      texture("muscle-detail.png"),
      texture("lung-detail.png"), texture("liver-detail.png"),
      texture("digestive-detail.png"), texture("vascular-detail.png"),
    ]);
  function tissue(color, options = {}, surface = {}, detail = organDetail) {
    return tissueSurface(new THREE.MeshPhysicalMaterial({
      color, roughness: .35, metalness: 0,
      clearcoat: .92, clearcoatRoughness: .15,
      ior: 1.38, specularIntensity: .8,
      sheen: .18, sheenColor: new THREE.Color("#d9a5a0"), sheenRoughness: .65,
      ...options,
    }), detail, surface);
  }
  const skin = tissue("#ffffff", {
    map: exteriorMap, roughness: .4, clearcoat: .72, clearcoatRoughness: .17,
    sheen: .2, sheenColor: new THREE.Color(blue ? "#5b9dd9" : "#d9935b"),
  }, { scale: 32, bump: .00019, mottling: .3, exterior: true, coatDetail: .8 }, skinDetail);
  const belly = tissue("#ffffff", {
    map: exteriorMap, roughness: .4, clearcoat: .72, clearcoatRoughness: .17,
    thickness: .00065, attenuationDistance: .003,
    attenuationColor: new THREE.Color(blue ? "#3583c6" : "#c67b35"), sheen: .2,
    sheenColor: new THREE.Color(blue ? "#5b9dd9" : "#d9935b"),
  }, { scale: 32, bump: .00019, mottling: .3, underside: true,
    exterior: true, coatDetail: .8 }, skinDetail);
  skin.userData.frogExterior = belly.userData.frogExterior = true;
  const translucent = new THREE.MeshPhysicalMaterial({
    color: "#408fae", transparent: true, opacity: .35, depthWrite: false,
    roughness: .43, clearcoat: .28, clearcoatRoughness: .2,
    sheen: .28, sheenColor: new THREE.Color("#a6cfd2"),
    side: THREE.FrontSide,
  });
  translucent.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>",
      `diffuseColor.a *= .6 + .85 * pow(1. - abs(dot(normal, normalize(vViewPosition))), 2.);\n#include <opaque_fragment>`);
  };
  return {
    skin, belly, translucent,
    cavity: tissue("#704044", { roughness: .44, clearcoat: .8,
      clearcoatRoughness: .2, specularIntensity: .5 },
      { scale: 35, bump: .00011, vessels: .38, mottling: .5, cavity: true,
        coatDetail: .7 }, membraneDetail),
    rim: tissue("#bb8c80", { roughness: .4, clearcoat: .82 },
      { scale: 45, bump: .000025, vessels: .18 }),
    heart: tissue("#ac5960", { roughness: .36, clearcoat: .9, clearcoatRoughness: .16 },
      { scale: 39, bump: .000085, vessels: .75, mottling: .55, coatDetail: .55 }, muscleDetail),
    liver: tissue("#4b2522", { roughness: .33, clearcoat: .96, clearcoatRoughness: .16 },
      { scale: 38, bump: .00012, mottling: .55, coatDetail: .65 }, liverDetail),
    lung: tissue("#9e5c6e", {
      roughness: .44, clearcoat: .8, clearcoatRoughness: .2,
      transmission: .07, thickness: .0014, attenuationDistance: .005,
      attenuationColor: new THREE.Color("#cc727d"), sheen: .3, specularIntensity: .65,
    }, { scale: 30, bump: .00014, vessels: .5, mottling: 1.25, coatDetail: .45 }, lungDetail),
    stomach: tissue("#d6c5cf", { roughness: .38, clearcoat: .9, clearcoatRoughness: .18 },
      { scale: 24, bump: .000065, vessels: 1.2, mottling: .2, coatDetail: .45 }, vascularDetail),
    intestine: tissue("#454a2d", { roughness: .42, clearcoat: .85, clearcoatRoughness: .19, sheen: .2,
      sheenColor: new THREE.Color("#a0a578") },
      { scale: 35, bump: .00012, vessels: .12, mottling: .6, coatDetail: .7 }, digestiveDetail),
    muscle: tissue("#b55d62", { roughness: .4, clearcoat: .85 },
      { scale: 30, bump: .000055, mottling: .35 }, muscleDetail),
    bone: tissue("#d6c6a6", { roughness: .55, clearcoat: .15 }, { bump: .000018 }),
    artery: tissue("#953c49", { roughness: .36 }, { bump: .000012, mottling: .14 }),
    vein: tissue("#596472", { roughness: .38 }, { bump: .000012, mottling: .14 }),
    lip: tissue(blue ? "#234665" : "#653423", { roughness: .44, clearcoat: .55 }, { bump: .00006 }),
    iris: new THREE.MeshPhysicalMaterial({
      map: irisMap, roughness: .18, clearcoat: 1, clearcoatRoughness: .08,
    }),
  };
}
