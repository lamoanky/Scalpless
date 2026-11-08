import http from "node:http";
import { pathToFileURL } from "node:url";
import { DEFAULT_MODEL, TeachingError, generateAnswer, modelName, sanitizeQuestion } from "../src/teaching-request.js";

export const DEV_ORIGINS=[3000,5173,4173].flatMap(port=>[`http://127.0.0.1:${port}`,`http://localhost:${port}`]);

// Request handler for /api/tutor, shared by the standalone loopback server and
// the Vite dev/preview middleware. Deployment still needs real user
// authentication and per-user quotas at the hosting boundary (see README).
export function createTutorHandler({key="",model=DEFAULT_MODEL,fetchImpl=fetch,
  allowedOrigins=DEV_ORIGINS,rateLimit=20,timeoutMs=30000,onFailure=()=>{}}={}) {
  modelName(model);
  let inFlight=0,requests=[];
  return async(req,res)=>{
    res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");
    const send=(status,body)=>{if(!res.destroyed&&!res.writableEnded){res.writeHead(status,{"Content-Type":"application/json"});res.end(JSON.stringify(body));}};
    // Lets the chat pick the server connection automatically. Reports only
    // whether a key exists, never the key or model account details.
    if(req.url==="/api/tutor/status"){
      if(req.method!=="GET"){res.setHeader("Allow","GET");send(405,{error:"Use GET"});return;}
      send(200,{configured:Boolean(key)});return;
    }
    if(req.url!=="/api/tutor"){send(404,{error:"Not found"});return;}
    if(req.method!=="POST"){res.setHeader("Allow","POST");send(405,{error:"Use POST"});return;}
    if(!allowedOrigins.includes(req.headers.origin)){send(403,{error:"Origin not allowed"});return;}
    if(req.headers["content-type"]?.split(";")[0]!=="application/json"){send(415,{error:"Use application/json"});return;}
    if(!key){send(503,{error:"Teaching service is not configured"});return;}
    const now=Date.now();requests=requests.filter(time=>now-time<60000);
    if(requests.length>=rateLimit||inFlight>=2){res.setHeader("Retry-After","60");send(429,{error:"Try again later"});return;}
    requests.push(now);inFlight++;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),timeoutMs);
    req.on("aborted",()=>controller.abort());
    res.on("close",()=>{if(!res.writableEnded)controller.abort();});
    try {
      const chunks=[];let size=0;
      for await (const chunk of req) {
        size+=chunk.length;
        if(size>65536){send(413,{error:"Question is too large"});return;}
        chunks.push(chunk);
      }
      let body;
      try {body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}
      catch {send(400,{error:"Invalid JSON"});return;}
      if(!body||typeof body!=="object"||Array.isArray(body)){send(400,{error:"Invalid question"});return;}
      // No client-supplied credentials, endpoint, system instruction or model.
      const question=sanitizeQuestion(body.question,key);
      const answer=await generateAnswer({apiKey:key,model,question,history:body.history,context:body.context,signal:controller.signal,fetchImpl});
      if(controller.signal.aborted){send(504,{error:"Teaching service timed out"});return;}
      send(200,{answer});
    } catch(error) {
      const status=controller.signal.aborted?504:error instanceof TeachingError&&["empty","long"].includes(error.code)?400:error?.code==="quota"?429:502;
      // Only the coarse failure code (e.g. "credentials", "model") is reported.
      onFailure(controller.signal.aborted?"timeout":error instanceof TeachingError?error.code:"internal");
      // Provider payloads, prompts, credentials and stack traces are never logged or returned.
      send(status,{error:status===400?"Invalid question":"Teaching service could not answer"});
    } finally {clearTimeout(timeout);inFlight--;}
  };
}

// Optional standalone loopback server (npm run tutor).
export function createTutorServer(options={}) {
  const server=http.createServer(createTutorHandler(options));
  server.requestTimeout=35000;server.headersTimeout=10000;
  return server;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const server=createTutorServer({key:process.env.GEMINI_API_KEY,model:process.env.GEMINI_MODEL||DEFAULT_MODEL});
  server.listen(8787,"127.0.0.1",()=>console.log("Local teaching proxy listening at http://127.0.0.1:8787"));
  server.on("error",()=>{console.error("The local teaching proxy could not start. Check whether port 8787 is in use.");process.exitCode=1;});
}
