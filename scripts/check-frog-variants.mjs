import {chromium} from "playwright";
import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[];page.on("pageerror",e=>errors.push(e.message));
page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
const base=process.env.PREVIEW_URL||"http://127.0.0.1:5173/";
await mkdir("output",{recursive:true});
try {
  for(const appearance of ["natural","blue"]) {
    await page.goto(`${base}lab.html?specimen=frog&appearance=${appearance}`);
    await page.waitForFunction(()=>document.documentElement.dataset.ready==="true");
    await page.screenshot({path:`output/frog-matched-${appearance}.png`});
    await page.locator('[data-tool="scalpel"]').click();await page.locator("#primary-action").click();
    await page.waitForFunction(()=>window.__scalpless.getDebug().state.cutOpen);
    await page.locator('[data-tool="hand"]').click();await page.locator("#primary-action").click();
    await page.locator("#place-action").click();await page.waitForTimeout(400);
    await page.screenshot({path:`output/frog-matched-open-${appearance}.png`});
  }
  const comparison=await page.evaluate(async()=>{
    const {createFrog}=await import('/src/specimens/frog.js');
    const a=await createFrog({add(){}},{appearance:"natural"});
    const b=await createFrog({add(){}},{appearance:"blue"});
    let vertices=0,colliders=0;
    const equal=(x,y,label)=>{
      if(x.length!==y.length||x.some((v,i)=>v!==y[i]))throw Error(`${label} differs`);
    };
    for(const [id,part] of a.parts) {
      const other=b.parts.get(id);
      if(part.meshes.length!==other.meshes.length)throw Error(`${id} mesh count differs`);
      equal(part.grasp.toArray(),other.grasp.toArray(),`${id} grasp`);
      for(let i=0;i<part.meshes.length;i++) {
        const g=part.meshes[i].geometry,h=other.meshes[i].geometry;
        for(const name of Object.keys(g.attributes)) equal(g.attributes[name].array,h.attributes[name].array,`${id} ${name}`);
        if(g.index)equal(g.index.array,h.index.array,`${id} topology`);
        vertices+=g.attributes.position.count;
        const m=part.meshes[i].material,n=other.meshes[i].material;
        for(const key of ["roughness","clearcoat","clearcoatRoughness","flatShading","sheen"])
          if(m[key]!==n[key])throw Error(`${id} material ${key} differs`);
        if(n.userData.frogExterior&&(!n.isMeshPhysicalMaterial||n.flatShading))throw Error("Blue lost its detailed skin material");
      }
      const ac=part.collisionGeometries??[],bc=other.collisionGeometries??[];
      if(ac.length!==bc.length)throw Error(`${id} collider count differs`);
      ac.forEach((g,i)=>{equal(g.attributes.position.array,bc[i].attributes.position.array,`${id} collider`);colliders++;});
    }
    equal(a.guidePoints.flatMap(p=>p.toArray()),b.guidePoints.flatMap(p=>p.toArray()),"Supported incision");
    return {parts:a.parts.size,vertices,colliders};
  });
  assert.deepEqual(errors,[]);
  await writeFile("output/frog-variants-validation.json",JSON.stringify({passed:true,comparison,errors},null,2));
  console.log("Frog variants passed: identical detailed geometry, UVs, normals, colliders, tools and material response.",comparison);
}finally{await browser.close();}
