import { TeachingError, redactCredentials, sanitizeContext, sanitizeHistory, sanitizeQuestion } from "./teaching-request.js";

// The browser only talks to the same-origin tutor. Keys and model selection
// belong to the server; opening the chat never makes a request.
export function createTeachingSession({fetchImpl=fetch,timeoutMs=30000}={}) {
  let active=null;
  const cancel=()=>{active?.abort();active=null;};
  return {
    redact:text=>redactCredentials(text),
    cancel,
    async ask({question,history=[],context=null}) {
      if(active)throw new TeachingError("busy","Wait for this answer or stop it before asking another question.");
      const payload={question:sanitizeQuestion(question),history:sanitizeHistory(history),context:sanitizeContext(context)};
      const controller=new AbortController();active=controller;
      let timedOut=false;
      const timeout=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
      try {
        const response=await fetchImpl("/api/tutor",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify(payload),credentials:"same-origin",cache:"no-store",signal:controller.signal});
        if(!response.ok) {
          if(response.status===503)throw new TeachingError("no-server","The teaching server is not configured yet. Ask the app administrator to set it up, then try again.");
          if(response.status===429)throw new TeachingError("quota","The teaching server is busy. Wait a moment and try again.");
          throw new TeachingError("server","The teaching server could not answer. Check its setup or try again later.");
        }
        const data=await response.json();
        if(controller.signal.aborted)throw new TeachingError("cancelled","Request stopped.");
        if(typeof data?.answer!=="string"||!data.answer.trim())throw new TeachingError("response","The teaching server did not return an answer. Please try again.");
        return redactCredentials(data.answer.slice(0,10000));
      } catch(error) {
        if(timedOut)throw new TeachingError("timeout","The answer took too long. Your lab is unchanged; try again in a moment.");
        if(controller.signal.aborted)throw new TeachingError("cancelled","Request stopped.");
        if(error instanceof TeachingError)throw error;
        throw new TeachingError("network","Could not reach the teaching service. Please try again in a moment; your lab is unchanged.");
      } finally {clearTimeout(timeout);if(active===controller)active=null;}
    },
  };
}
