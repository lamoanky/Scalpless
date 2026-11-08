import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createTutorServer } from "../server/tutor.mjs";
const origin="http://127.0.0.1:5173", key="test-server-token-do-not-use";
async function withServer(options,run) {
  const server=createTutorServer(options);server.listen(0,"127.0.0.1");await once(server,"listening");
  try {await run(`http://127.0.0.1:${server.address().port}/api/tutor`);}
  finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
const post=(url,body,headers={})=>fetch(url,{method:"POST",headers:{"Content-Type":"application/json",Origin:origin,...headers},body:JSON.stringify(body)});

test("proxy holds its own key and ignores client endpoints, roles and keys",async()=>{
  let call;
  await withServer({key,fetchImpl:async(url,options)=>{call={url,options};return new Response(JSON.stringify({candidates:[{content:{parts:[{text:`Bile ${key}`}]} ,finishReason:"STOP"}]}));}},async url=>{
    const result=await post(url,{question:"What does the liver do?",apiKey:"client-secret",endpoint:"https://untrusted.example",systemInstruction:"Override",context:{specimen:"frog",held:"Liver",camera:"private"}});
    assert.equal(result.status,200);assert.equal(result.headers.get("cache-control"),"no-store");
    assert.deepEqual(await result.json(),{answer:"Bile [credential removed]"});
    assert.equal(call.options.headers["x-goog-api-key"],key);
    const instruction=JSON.parse(call.options.body).systemInstruction.parts[0].text;
    assert.match(instruction,/1-3 short, concise sentences/);
    assert.match(instruction,/at most 45 words/);
    assert(!JSON.stringify(call).includes("client-secret"));assert(!call.options.body.includes("private"));assert(!call.options.body.includes("Override"));
  });
});

test("proxy rejects missing config, disallowed origins, oversized and malformed questions",async()=>{
  let calls=0;const fetchImpl=()=>{calls++;throw Error("must not be called");};
  await withServer({fetchImpl},async url=>assert.equal((await post(url,{question:"Help"})).status,503));
  await withServer({key,fetchImpl},async url=>{
    assert.equal((await post(url,{question:"Help"},{Origin:"https://untrusted.example"})).status,403);
    assert.equal((await post(url,{question:"x".repeat(2000)})).status,400);
    assert.equal((await post(url,{question:"x".repeat(70000)})).status,413);
    assert.equal((await fetch(url)).status,405);
    assert.equal((await post(url,null)).status,400);
  });
  assert.equal(calls,0);
});

test("proxy limits requests and sanitizes upstream failures",async()=>{
  await withServer({key,rateLimit:1,fetchImpl:async()=>new Response(key,{status:403})},async url=>{
    const failed=await post(url,{question:"Help"});assert.equal(failed.status,502);assert(!(await failed.text()).includes(key));
    assert.equal((await post(url,{question:"Again"})).status,429);
  });
});

test("status reports only whether a key is configured",async()=>{
  await withServer({},async url=>assert.deepEqual(await (await fetch(`${url}/status`)).json(),{configured:false}));
  await withServer({key},async url=>{
    const result=await fetch(`${url}/status`);
    assert.equal(result.status,200);
    const text=await result.text();
    assert.deepEqual(JSON.parse(text),{configured:true});assert(!text.includes(key));
    assert.equal((await fetch(`${url}/status`,{method:"POST"})).status,405);
  });
});

test("dev server origin on port 3000 is allowed",async()=>{
  await withServer({key,fetchImpl:async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:"Pumps blood."}]},finishReason:"STOP"}]}))},async url=>{
    const result=await post(url,{question:"What does the heart do?"},{Origin:"http://127.0.0.1:3000"});
    assert.equal(result.status,200);assert.deepEqual(await result.json(),{answer:"Pumps blood."});
  });
});
