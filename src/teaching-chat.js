import { createTeachingSession } from "./teaching-session.js";
import { DEFAULT_MODEL, HISTORY_LIMIT, QUESTION_LIMIT } from "./teaching-request.js";
import { teachingContext } from "./organ-guide.js";
import "./lab-panels.css";

const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;

export function installTeachingChat(lab, bench, {onToggle=()=>{}}={}) {
  const session=createTeachingSession();
  const root=document.getElementById("bench");
  const launcher=document.createElement("button");
  launcher.id="teaching-toggle";launcher.type="button";launcher.className="icon-button teaching-launch";
  launcher.setAttribute("aria-label","Open biology teaching chat");launcher.setAttribute("aria-expanded","false");
  launcher.setAttribute("aria-controls","teaching-panel");
  launcher.innerHTML=icon("M4 4h16v12H9l-5 4V4Zm4 5h8m-8 3h5");
  const panel=document.createElement("section");panel.id="teaching-panel";panel.className="teaching-panel";panel.hidden=true;
  panel.setAttribute("aria-labelledby","teaching-title");
  panel.innerHTML=`
    <header class="teaching-heading"><div><span class="panel-eyebrow">SCALPLESS / LEARN</span><h2 id="teaching-title">A closer look.</h2></div>
      <button id="teaching-close" class="icon-button" type="button" aria-label="Close teaching chat">${icon("m6 6 12 12M6 18 18 6")}</button></header>
    <div class="teaching-scroll">
      <p class="teaching-intro">Ask about your specimen, an organ’s function, or your next step in the virtual lab.</p>
      <details class="teaching-settings" id="teaching-settings"><summary>Gemini connection <span id="connection-label">Not connected</span></summary>
        <form id="teaching-connect" class="teaching-connect">
          <label for="teaching-mode">Connection</label><select id="teaching-mode"><option value="browser">Session key in this browser</option><option value="server">Server connection · recommended</option></select>
          <div id="browser-connection"><label for="teaching-key">Gemini API key</label><input id="teaching-key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste your key for this tab" maxlength="512" aria-describedby="key-disclosure"/>
            <p id="key-disclosure" class="connection-note">Kept only in this tab’s memory. Browser keys are visible to this browser and its developer tools. When you press Send, your key and question go directly to Google. Use the server option for a shared app.</p>
            <label for="teaching-model">Model</label><input id="teaching-model" value="${DEFAULT_MODEL}" autocomplete="off" spellcheck="false" maxlength="88"/>
          </div>
          <p id="server-connection" class="connection-note" hidden>Your question goes to this app’s /api/tutor route. The Gemini key stays on the server. A developer must configure that route first; see the README.</p>
          <div class="connection-actions"><button class="panel-button" type="submit">Use connection</button><button class="panel-button quiet" id="teaching-forget" type="button">Forget key</button></div>
        </form>
      </details>
      <div class="teaching-suggestions" role="group" aria-label="Question ideas"><button type="button" class="question-idea" data-question="What can I explore next in this lab?">What can I explore next?</button><button type="button" class="question-idea" data-question="What does the organ I am holding do?" id="organ-question" hidden>What does this organ do?</button></div>
      <div id="teaching-messages" class="teaching-messages" role="log" aria-label="Biology conversation" aria-live="off" tabindex="0"></div>
    </div>
    <form id="teaching-ask" class="teaching-composer">
      <label class="context-sharing"><input id="teaching-share" type="checkbox" checked/><span>Share current lab state<span id="teaching-context"></span></span></label>
      <label class="sr-only" for="teaching-question">Your biology question</label>
      <div class="question-entry"><textarea id="teaching-question" rows="2" maxlength="${QUESTION_LIMIT}" placeholder="Ask a biology question…"></textarea><button class="icon-button" id="teaching-send" type="submit" aria-label="Send question">${icon("M12 20V4m-6 6 6-6 6 6")}</button><button class="icon-button" id="teaching-stop" type="button" aria-label="Stop answer" hidden>${icon("M6 6h12v12H6z")}</button></div>
      <p id="teaching-status" class="teaching-status" role="status" aria-live="polite">Connect Gemini above to ask a question.</p>
      <div class="teaching-foot"><span>AI can make mistakes. Check with your teacher.</span><button type="button" id="teaching-clear" aria-label="Clear conversation">Clear</button></div>
    </form>`;
  root.append(launcher,panel);
  const $=id=>panel.querySelector(`#${id}`);
  let state=lab.getState(),history=[],pending=false,version=0;
  function setStatus(text) { $("teaching-status").textContent=text; }
  function updateContext(next) {
    state=next;
    const context=teachingContext(state);
    $("teaching-context").textContent=$("teaching-share").checked
      ? `${context.specimen==="frog"?"Frog":"Onion"} · ${context.held?`holding ${context.held.toLowerCase()}`:context.incision+" incision"}`
      : "Only your question and conversation will be sent";
    $("organ-question").hidden=state.specimen!=="frog"||!context.held||context.held==="Abdominal panel";
  }
  function setPending(value) {
    pending=value;$("teaching-send").hidden=value;$("teaching-stop").hidden=!value;
    $("teaching-question").readOnly=value;
    panel.setAttribute("aria-busy",String(value));
  }
  function stop() { version++;session.cancel();if(pending)setStatus("Request stopped. Your question is still here.");setPending(false); }
  function open(value,{focus=true}={}) {
    if(!value)stop();
    panel.hidden=!value;launcher.setAttribute("aria-expanded",String(value));onToggle(value);
    if(value) {
      // Only close the camera's setup panel, not its active tracking session.
      const cameraPanel=document.getElementById("hand-tracking-panel");
      if(cameraPanel&&!cameraPanel.hidden)document.getElementById("tracking-close")?.click();
      if(focus)$("teaching-question").focus({preventScroll:true});
    } else if(focus)launcher.focus({preventScroll:true});
  }
  launcher.onclick=()=>open(panel.hidden);
  $("teaching-close").onclick=()=>open(false);
  panel.addEventListener("keydown",event=>{
    // Typing, Space, arrows and shortcut letters belong to this panel, never
    // the specimen. The camera adapter and six input events are untouched.
    event.stopPropagation();
    if(event.key==="Escape"){event.preventDefault();open(false);}
  });
  $("teaching-question").addEventListener("keydown",event=>{
    if(event.key==="Enter"&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(!pending)$("teaching-ask").requestSubmit();}
  });
  $("teaching-mode").onchange=()=>{
    const browser=$("teaching-mode").value==="browser";
    $("browser-connection").hidden=!browser;$("server-connection").hidden=browser;
    $("teaching-forget").hidden=!browser;
    $("teaching-key").value="";
  };
  $("teaching-connect").onsubmit=event=>{
    event.preventDefault();stop();
    try {
      session.configure({mode:$("teaching-mode").value,key:$("teaching-key").value,model:$("teaching-model").value});
      const status=session.status();
      $("connection-label").textContent=status.mode==="server"?"Server selected":status.configured?"Session key ready":"Not connected";
      setStatus(status.configured?"Connection saved for this tab. Nothing is sent until you ask.":"Add a Gemini key to use the browser connection.");
      if(status.configured){$("teaching-settings").open=false;$("teaching-question").focus();}
    } catch(error) {setStatus(error.message);} finally {$("teaching-key").value="";}
  };
  $("teaching-forget").onclick=()=>{
    stop();session.forget();$("teaching-key").value="";$("connection-label").textContent="Not connected";
    setStatus("Session key forgotten. It was not saved to browser storage.");
  };
  $("teaching-clear").onclick=()=>{
    stop();history=[];$("teaching-messages").replaceChildren();$("teaching-question").value="";
    setStatus("Conversation cleared from this tab.");$("teaching-question").focus();
  };
  $("teaching-stop").onclick=()=>{stop();$("teaching-question").focus();};
  $("teaching-share").onchange=()=>updateContext(state);
  panel.querySelectorAll("[data-question]").forEach(button=>button.onclick=()=>{
    if(pending)return;$("teaching-question").value=button.dataset.question;$("teaching-question").focus();
  });
  function message(role,text) {
    const article=document.createElement("article");article.className=`teaching-message ${role}`;
    const label=document.createElement("span");label.className="message-label";label.textContent=role==="user"?"You":"Gemini";
    const body=document.createElement("p");body.textContent=text;article.append(label,body);$("teaching-messages").append(article);
    while($("teaching-messages").childElementCount>24)$("teaching-messages").firstElementChild.remove();
    return article;
  }
  $("teaching-ask").onsubmit=async event=>{
    event.preventDefault();if(pending)return;
    const question=session.redact($("teaching-question").value.trim());
    $("teaching-question").value=question;
    if(!question){setStatus("Type a question about your specimen first.");return;}
    if(!session.status().configured) {
      $("teaching-settings").open=true;setStatus("Add a session key above, or choose a configured server connection. Nothing has been sent.");return;
    }
    const current=++version;setPending(true);setStatus("Asking Gemini…");
    const pendingMessage=message("user",question);
    try {
      const answer=await session.ask({question,history,context:$("teaching-share").checked?teachingContext(state):null});
      if(current!==version)return;
      history.push({role:"user",text:question},{role:"model",text:answer});history=history.slice(-HISTORY_LIMIT);
      message("model",answer);$("teaching-question").value="";setStatus("Answer ready.");
      // Lets the guided lesson tick off its "ask the tutor" step.
      dispatchEvent(new CustomEvent("teaching:answer"));
      const scroll=panel.querySelector(".teaching-scroll");scroll.scrollTop=scroll.scrollHeight;
    } catch(error) {
      pendingMessage.remove();
      if(current===version)setStatus(error.message||"The teaching service is unavailable. Please try again.");
    } finally {if(current===version)setPending(false);}
  };
  lab.subscribe(updateContext);updateContext(state);
  // A key in .env.local makes the dev server's /api/tutor ready; use it
  // without asking the student for a key. Static builds just stay manual.
  fetch("/api/tutor/status",{cache:"no-store",credentials:"same-origin"})
    .then(response=>response.ok?response.json():null)
    .then(data=>{
      if(!data?.configured||session.status().configured)return;
      session.configure({mode:"server"});
      $("teaching-mode").value="server";$("teaching-mode").onchange();
      $("connection-label").textContent="Connected";
      if(!pending)setStatus("Ask a question about your specimen.");
    })
    .catch(()=>{});
  addEventListener("pagehide",()=>{
    stop();session.forget();$("teaching-key").value="";
    $("connection-label").textContent=session.status().mode==="server"?"Server selected":"Not connected";
  });
  return {
    close:()=>{if(!panel.hidden)open(false,{focus:false});},
    get isOpen(){return !panel.hidden;},
  };
}
