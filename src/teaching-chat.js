import { createTeachingSession } from "./teaching-session.js";
import { HISTORY_LIMIT, QUESTION_LIMIT } from "./teaching-request.js";
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
      <div class="teaching-suggestions" role="group" aria-label="Question ideas"><button type="button" class="question-idea" data-question="What can I explore next in this lab?">What can I explore next?</button><button type="button" class="question-idea" data-question="What does the organ I am holding do?" id="organ-question" hidden>What does this organ do?</button></div>
      <div id="teaching-messages" class="teaching-messages" role="log" aria-label="Biology conversation" aria-live="off" tabindex="0"></div>
    </div>
    <form id="teaching-ask" class="teaching-composer">
      <label class="context-sharing"><input id="teaching-share" type="checkbox" checked/><span>Share current lab state<span id="teaching-context"></span></span></label>
      <label class="sr-only" for="teaching-question">Your biology question</label>
      <div class="question-entry"><textarea id="teaching-question" rows="2" maxlength="${QUESTION_LIMIT}" placeholder="Ask a biology question…"></textarea><button class="icon-button" id="teaching-send" type="submit" aria-label="Send question">${icon("M12 20V4m-6 6 6-6 6 6")}</button><button class="icon-button" id="teaching-stop" type="button" aria-label="Stop answer" hidden>${icon("M6 6h12v12H6z")}</button></div>
      <p id="teaching-status" class="teaching-status" role="status" aria-live="polite">Ready when you are. Ask about your specimen.</p>
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
    const current=++version;setPending(true);setStatus("Asking Gemini…");
    const pendingMessage=message("user",question);
    try {
      const answer=await session.ask({question,history,context:$("teaching-share").checked?teachingContext(state):null});
      if(current!==version)return;
      history.push({role:"user",text:question},{role:"model",text:answer});history=history.slice(-HISTORY_LIMIT);
      message("model",answer);$("teaching-question").value="";setStatus("Answer ready.");
      const scroll=panel.querySelector(".teaching-scroll");scroll.scrollTop=scroll.scrollHeight;
    } catch(error) {
      pendingMessage.remove();
      if(current===version)setStatus(error.message||"The teaching service is unavailable. Please try again.");
    } finally {if(current===version)setPending(false);}
  };
  lab.subscribe(updateContext);updateContext(state);
  addEventListener("pagehide",stop);
  return {
    close:()=>{if(!panel.hidden)open(false,{focus:false});},
    get isOpen(){return !panel.hidden;},
  };
}
