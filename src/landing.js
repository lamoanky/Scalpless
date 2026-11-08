import './landing.css';
import { landingFrame } from './landing-motion.js';

const root=document.documentElement,story=document.querySelector('.scroll-story');
const stage=document.querySelector('.story-stage');
const frameElement=document.querySelector('#lab-frame'),reveal=document.querySelector('.lab-reveal');
const cue=document.querySelector('.scroll-cue'),enterLink=document.querySelector('.enter-lab');
const back=document.querySelector('.return-home'),status=document.querySelector('#landing-status');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
history.scrollRestoration='manual';
let progress=0,target=0,labReady=false,entered=false,heroError=false;
let raf=0,last=0,current=landingFrame(0),directEntry=location.hash==='#lab';
function length(){return Math.max(1,story.offsetHeight-stage.clientHeight);}
function request(){if(!raf&&!document.hidden)raf=requestAnimationFrame(tick);}
function present(){
  if(!labReady)return;
  frameElement.contentWindow.postMessage({type:'scalpless:landing-frame',progress,still:reduced.matches,active:entered},location.origin);
}
function tick(now){
  raf=0;const dt=Math.min((now-last)/1000||.016,.05);last=now;
  if(entered)return;
  progress=reduced.matches?target:progress+(target-progress)*(1-Math.exp(-12*dt));
  if(Math.abs(progress-target)<.0001)progress=target;
  current=landingFrame(progress,{still:reduced.matches});
  cue.style.opacity=1-Math.min(1,progress*4);cue.inert=progress>.25;
  present();
  if(current.canEnter&&labReady)enter();
  else if(progress!==target)request();
}
function readScroll(){if(entered)return;target=directEntry?1:Math.max(0,Math.min(1,scrollY/length()));request();}
function enter(){
  if(entered||!labReady)return;
  entered=true;directEntry=false;progress=target=1;current=landingFrame(1,{still:reduced.matches});
  present();reveal.inert=false;reveal.removeAttribute('aria-hidden');
  frameElement.tabIndex=0;root.classList.add('entered');back.hidden=false;
  if(location.hash!=='#lab')history.pushState({scalplessLab:true},'','#lab');
  scrollTo({top:0,behavior:'instant'});
  status.textContent='Frog lab ready. V to inspect, S for scalpel, H for forceps.';
  frameElement.contentWindow.focus();frameElement.contentDocument?.querySelector('#scene')?.focus({preventScroll:true});
}
function leave(){
  entered=false;directEntry=false;target=progress=0;root.classList.remove('entered');back.hidden=true;
  reveal.inert=true;reveal.setAttribute('aria-hidden','true');frameElement.tabIndex=-1;
  frameElement.contentWindow.dispatchEvent(new Event('blur'));
  present();scrollTo({top:0,behavior:'instant'});cue.inert=false;cue.focus({preventScroll:true});request();
}
function markLabReady(){
  if(labReady)return;labReady=true;root.classList.add('ready');root.dataset.ready='true';
  present();request();
}
addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==frameElement.contentWindow)return;
  if(event.data?.type==='scalpless:lab-ready')markLabReady();
  if(event.data?.type==='scalpless:lab-error'){
    heroError=true;root.classList.add('scene-error');root.dataset.ready='true';
    document.querySelector('.model-loading').hidden=true;
    status.textContent='The preview could not load. Use the arrow to retry the frog lab.';
  }
});
frameElement.addEventListener('load',()=>{
  if(frameElement.contentDocument?.documentElement.dataset.ready==='true')markLabReady();
});
if(frameElement.contentDocument?.documentElement.dataset.ready==='true')markLabReady();
function advance(){
  if(heroError){location.href=enterLink.href;return;}
  scrollTo({top:length(),behavior:reduced.matches?'instant':'smooth'});
}
cue.addEventListener('click',advance);
enterLink.addEventListener('click',event=>{
  if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||!labReady||heroError)return;
  event.preventDefault();advance();
});
addEventListener('keydown',event=>{
  if(entered||event.target.closest('a,button,input,select,textarea'))return;
  if(event.key==='Enter'){event.preventDefault();advance();}
});
addEventListener('scroll',readScroll,{passive:true});
addEventListener('popstate',()=>{if(location.hash!=='#lab'&&entered)leave();else if(location.hash==='#lab'){directEntry=true;readScroll();}});
addEventListener('pageshow',readScroll);
addEventListener('visibilitychange',()=>{if(!document.hidden&&!entered){last=performance.now();request();}});
reduced.addEventListener('change',request);
new ResizeObserver(()=>{if(!entered)readScroll();}).observe(stage);
window.__scalplessLanding={getDebug:()=>({...current,progress,target,labReady,entered,
  heroError,reducedMotion:reduced.matches,viewport:[stage.clientWidth,stage.clientHeight]})};
readScroll();
