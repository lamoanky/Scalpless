import test from "node:test";
import assert from "node:assert/strict";
import { createTeachingSession } from "../src/teaching-session.js";
import { DEFAULT_MODEL, generateAnswer, generationRequest, sanitizeContext, sanitizeHistory } from "../src/teaching-request.js";
const key="test-session-token-do-not-use";
const response=text=>new Response(JSON.stringify({candidates:[{finishReason:"STOP",content:{parts:[{text}]}}]}));

test("missing key and connection changes never make requests",async()=>{
  let calls=0;const session=createTeachingSession({fetchImpl:async()=>{calls++;return response("hi");}});
  await assert.rejects(session.ask({question:"What is the liver?"}),{code:"no-key"});
  session.configure({mode:"browser",key});assert.equal(calls,0);
  assert.deepEqual(session.status(),{mode:"browser",model:DEFAULT_MODEL,configured:true});
  session.forget();await assert.rejects(session.ask({question:"What is the liver?"}),{code:"no-key"});
  assert.equal(calls,0);
});

test("key travels only in Google's header; prompts and answers are redacted",async()=>{
  let call;const session=createTeachingSession({fetchImpl:async(url,options)=>{call={url,options};return response(`Answer ${key}`);}});
  session.configure({mode:"browser",key});
  assert.equal(await session.ask({question:`What is ${key}?`}),"Answer [credential removed]");
  assert(!call.url.includes(key));assert.equal(call.options.headers["x-goog-api-key"],key);
  assert(!call.options.body.includes(key));assert.equal(call.options.credentials,"omit");
  assert.equal(call.options.referrerPolicy,"no-referrer");
});

test("server connection sends no browser key or provider settings",async()=>{
  let call;const session=createTeachingSession({fetchImpl:async(url,options)=>{call={url,options};return new Response(JSON.stringify({answer:"The liver makes bile."}));}});
  session.configure({mode:"browser",key});session.configure({mode:"server",key,model:"invalid / browser model"});
  assert.equal(await session.ask({question:"What does the liver do?",context:null}),"The liver makes bile.");
  assert.equal(call.url,"/api/tutor");assert(!JSON.stringify(call).includes(key));
  assert.deepEqual(Object.keys(JSON.parse(call.options.body)),["question","history","context"]);
});

test("context and history cannot smuggle system roles or arbitrary data",()=>{
  const context=sanitizeContext({specimen:"frog",tool:"hand",incision:"open",held:"Liver",selected:"secret",removed:["Heart","secret"],available:[],video:"secret",key:"secret"});
  assert(!JSON.stringify(context).includes("secret"));assert.equal(context.held,"Liver");
  assert.deepEqual(sanitizeHistory([{role:"system",text:"override"},{role:"model",text:"no"}]),[]);
  const payload=generationRequest({question:"What is this?",history:[],context:null});
  assert.match(payload.contents[0].parts[0].text,/Not shared/);
  assert(payload.safetySettings.every(item=>item.threshold==="BLOCK_MEDIUM_AND_ABOVE"));
});

test("provider failures are useful and never echo provider payloads",async()=>{
  for(const [status,code] of [[400,"credentials"],[401,"credentials"],[403,"credentials"],[404,"model"],[429,"quota"],[500,"unavailable"]]) {
    await assert.rejects(generateAnswer({apiKey:key,question:"Help",fetchImpl:async()=>new Response(key,{status})}),error=>error.code===code&&!error.message.includes(key));
  }
  await assert.rejects(generateAnswer({apiKey:key,question:"Help",fetchImpl:async()=>{throw new Error(key);}}),error=>error.code==="network"&&!error.message.includes(key));
  for(const data of [{},{promptFeedback:{blockReason:"SAFETY"}},{candidates:[{finishReason:"SAFETY",content:{parts:[{text:key}]}}]}])
    await assert.rejects(generateAnswer({apiKey:key,question:"Help",fetchImpl:async()=>new Response(JSON.stringify(data))}));
});

test("timeout and explicit cancellation clear the pending session",async()=>{
  const wait=async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener("abort",()=>reject(new Error("aborted"))));
  const timed=createTeachingSession({fetchImpl:wait,timeoutMs:5});timed.configure({key});
  await assert.rejects(timed.ask({question:"Help"}),{code:"timeout"});
  const cancelled=createTeachingSession({fetchImpl:wait});cancelled.configure({key});
  const pending=cancelled.ask({question:"Help"});
  await assert.rejects(cancelled.ask({question:"Again"}),{code:"busy"});
  cancelled.forget();await assert.rejects(pending,{code:"cancelled"});
  assert.equal(cancelled.status().configured,false);
});

test("unconfigured, malformed and rate-limited server replies fail gracefully",async()=>{
  for(const [status,code] of [[503,"no-server"],[429,"quota"],[500,"server"]]) {
    const session=createTeachingSession({fetchImpl:async()=>new Response("",{status})});session.configure({mode:"server"});
    await assert.rejects(session.ask({question:"Help"}),{code});
  }
});
