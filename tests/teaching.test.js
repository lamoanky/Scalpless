import test from "node:test";
import assert from "node:assert/strict";
import { createTeachingSession } from "../src/teaching-session.js";
import { generateAnswer, generationRequest, sanitizeContext, sanitizeHistory } from "../src/teaching-request.js";
const key="test-session-token-do-not-use";
const response=text=>new Response(JSON.stringify({candidates:[{finishReason:"STOP",content:{parts:[{text}]}}]}));

test("creating a server session, cancelling and empty questions never make requests",async()=>{
  let calls=0;const session=createTeachingSession({fetchImpl:async()=>{calls++;return new Response('{"answer":"hi"}');}});
  session.cancel();
  await assert.rejects(session.ask({question:" "}),{code:"empty"});
  assert.equal(calls,0);
});

test("key travels only in Google's header; prompts and answers are redacted",async()=>{
  let call;
  assert.equal(await generateAnswer({apiKey:key,question:`What is ${key}?`,fetchImpl:async(url,options)=>{call={url,options};return response(`Answer ${key}`);}}),"Answer [credential removed]");
  assert(!call.url.includes(key));assert.equal(call.options.headers["x-goog-api-key"],key);
  assert(!call.options.body.includes(key));assert.equal(call.options.credentials,"omit");
  assert.equal(call.options.referrerPolicy,"no-referrer");
});

test("questions automatically use the same-origin server without keys or provider settings",async()=>{
  let call;const session=createTeachingSession({fetchImpl:async(url,options)=>{call={url,options};return new Response(JSON.stringify({answer:"The liver makes bile."}));}});
  assert.equal(await session.ask({question:"What does the liver do?",context:null,apiKey:key,model:"ignored"}),"The liver makes bile.");
  assert.equal(call.url,"/api/tutor");assert(!JSON.stringify(call).includes(key));
  assert.deepEqual(Object.keys(JSON.parse(call.options.body)),["question","history","context"]);
  assert.deepEqual(call.options.headers,{"Content-Type":"application/json"});
  assert.equal(call.options.credentials,"same-origin");
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
  const timed=createTeachingSession({fetchImpl:wait,timeoutMs:5});
  await assert.rejects(timed.ask({question:"Help"}),{code:"timeout"});
  const cancelled=createTeachingSession({fetchImpl:wait});
  const pending=cancelled.ask({question:"Help"});
  await assert.rejects(cancelled.ask({question:"Again"}),{code:"busy"});
  cancelled.cancel();await assert.rejects(pending,{code:"cancelled"});
  const retry=cancelled.ask({question:"Retry"});cancelled.cancel();
  await assert.rejects(retry,{code:"cancelled"});
});

test("unconfigured, malformed and rate-limited server replies fail gracefully",async()=>{
  for(const [status,code] of [[503,"no-server"],[429,"quota"],[500,"server"]]) {
    const session=createTeachingSession({fetchImpl:async()=>new Response(key,{status})});
    await assert.rejects(session.ask({question:"Help"}),{code});
  }
  for(const body of [null,{}, {answer:" "}]) {
    const session=createTeachingSession({fetchImpl:async()=>new Response(JSON.stringify(body))});
    await assert.rejects(session.ask({question:"Help"}),{code:"response"});
  }
});
