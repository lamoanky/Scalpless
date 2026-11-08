import { DEFAULT_MODEL, TeachingError, generateAnswer, modelName, redactCredentials, sanitizeContext, sanitizeHistory, sanitizeQuestion } from "./teaching-request.js";

// Credentials exist only in this closure for the lifetime of this page.
// No storage, debug exposure, logging, validation request or auto-send on configure.
export function createTeachingSession({fetchImpl=fetch,timeoutMs=30000}={}) {
  let apiKey="",mode="browser",model=DEFAULT_MODEL,active=null;
  const cancel=()=>{active?.abort();active=null;};
  return {
    configure(next) {
      const nextMode=next.mode==="server"?"server":"browser";
      const nextModel=nextMode==="server"?DEFAULT_MODEL:modelName(next.model?.trim() || DEFAULT_MODEL);
      const nextKey=nextMode==="browser"?String(next.key ?? "").trim():"";
      if(nextKey.length>512 || /[\r\n]/.test(nextKey))throw new TeachingError("credentials","Enter a single API key, without extra lines.");
      cancel(); mode=nextMode; model=nextModel; apiKey=nextKey;
    },
    forget() { cancel(); apiKey=""; },
    status:()=>({mode,model,configured:mode==="server"||Boolean(apiKey)}),
    redact:text=>redactCredentials(text,apiKey),
    cancel,
    async ask({question,history=[],context=null}) {
      if(active)throw new TeachingError("busy","Wait for this answer or stop it before asking another question.");
      const payload={question:sanitizeQuestion(question,apiKey),history:sanitizeHistory(history,apiKey),context:sanitizeContext(context)};
      if(mode==="browser"&&!apiKey)throw new TeachingError("no-key","Add a session key in Gemini connection settings, or use a configured server connection.");
      const controller=new AbortController();active=controller;
      let timedOut=false;
      const timeout=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
      try {
        if(mode==="browser") {
          const answer=await generateAnswer({...payload,apiKey,model,signal:controller.signal,fetchImpl});
          if(controller.signal.aborted)throw new TeachingError("cancelled","Request stopped.");
          return answer;
        }
        const response=await fetchImpl("/api/tutor",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify(payload),credentials:"same-origin",cache:"no-store",signal:controller.signal});
        if(!response.ok) {
          if(response.status===503)throw new TeachingError("no-server","The teaching server is not configured yet. Add its key on the server, or use a session key in settings.");
          if(response.status===429)throw new TeachingError("quota","The teaching server is busy. Wait a moment and try again.");
          throw new TeachingError("server","The teaching server could not answer. Check its setup or try again later.");
        }
        const data=await response.json();
        if(controller.signal.aborted)throw new TeachingError("cancelled","Request stopped.");
        if(typeof data.answer!=="string"||!data.answer.trim())throw new TeachingError("response","The teaching server did not return an answer. Check its setup.");
        return redactCredentials(data.answer.slice(0,10000));
      } catch(error) {
        if(timedOut)throw new TeachingError("timeout","The answer took too long. Your lab is unchanged; try again in a moment.");
        if(controller.signal.aborted)throw new TeachingError("cancelled","Request stopped.");
        if(error instanceof TeachingError)throw error;
        throw new TeachingError("network","Could not reach the teaching service. Check your connection or connection settings and try again.");
      } finally {clearTimeout(timeout);if(active===controller)active=null;}
    },
  };
}
