import './landing.css';
import { landingFrame } from './landing-motion.js';

const root=document.documentElement,story=document.querySelector('.scroll-story');
const stage=document.querySelector('.story-stage');
const frameElement=document.querySelector('#lab-frame'),reveal=document.querySelector('.lab-reveal');
const cue=document.querySelector('.scroll-cue'),enterLink=document.querySelector('.enter-lab');
const startButton=document.querySelector('.start-dissection');
const back=document.querySelector('.return-home'),status=document.querySelector('#landing-status');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
history.scrollRestoration='manual';
let progress=0,target=0,entryProgress=0,starting=false,labReady=false,entered=false,heroError=false;
let raf=0,last=0,current=landingFrame(0),directEntry=location.hash==='#lab';
function length(){return Math.max(1,story.offsetHeight-stage.clientHeight);}
function request(){if(!raf&&!document.hidden)raf=requestAnimationFrame(tick);}
function present(){
  if(!labReady)return;
  frameElement.contentWindow.postMessage({type:'scalpless:landing-frame',progress,entryProgress,still:reduced.matches,active:entered},location.origin);
}
function tick(now){
  raf=0;const dt=Math.min((now-last)/1000||.016,.05);last=now;
  if(entered)return;
  if(starting)entryProgress=reduced.matches?1:Math.min(1,entryProgress+dt/1.6);
  else {
    progress=reduced.matches?target:progress+(target-progress)*(1-Math.exp(-12*dt));
    if(Math.abs(progress-target)<.0001)progress=target;
  }
  current=landingFrame(progress,{still:reduced.matches,entry:entryProgress});
  cue.style.opacity=starting?0:1-Math.min(1,progress*4);cue.inert=starting||progress>.25;
  present();
  if(current.canEnter&&labReady)enter();
  else if(starting||progress!==target)request();
}
function readScroll(){if(entered||starting||directEntry)return;target=Math.max(0,Math.min(1,scrollY/length()));request();}
function start(){
  if(heroError){location.href=enterLink.href;return;}
  if(!labReady||starting||entered)return;
  starting=true;target=progress;last=performance.now();startButton.disabled=true;
  root.classList.add('starting');startButton.querySelector('span').textContent='Opening laboratory…';
  status.textContent='Preparing the frog dissection bench.';request();
}
function enter(){
  if(entered||!labReady)return;
  entered=true;starting=false;directEntry=false;entryProgress=1;
  current=landingFrame(progress,{still:reduced.matches,entry:1});
  present();reveal.inert=false;reveal.removeAttribute('aria-hidden');
  frameElement.tabIndex=0;root.classList.remove('starting');root.classList.add('entered');back.hidden=false;
  if(location.hash!=='#lab')history.pushState({scalplessLab:true},'','#lab');
  scrollTo({top:0,behavior:'instant'});
  status.textContent='Frog lab ready. V to inspect, S for scalpel, H for forceps.';
  frameElement.contentWindow.focus();frameElement.contentDocument?.querySelector('#scene')?.focus({preventScroll:true});
}
function leave(){
  entered=starting=directEntry=false;target=progress=entryProgress=0;
  current=landingFrame(0,{still:reduced.matches});
  root.classList.remove('entered','starting');back.hidden=true;
  startButton.disabled=!labReady;startButton.querySelector('span').textContent='Start dissection';
  reveal.inert=true;reveal.setAttribute('aria-hidden','true');frameElement.tabIndex=-1;
  frameElement.contentWindow.dispatchEvent(new Event('blur'));
  present();scrollTo({top:0,behavior:'instant'});cue.inert=false;startButton.focus({preventScroll:true});request();
}
function markLabReady(){
  if(labReady)return;labReady=true;root.classList.add('ready');root.dataset.ready='true';
  startButton.disabled=false;
  if(directEntry){entryProgress=1;enter();return;}
  present();request();
}
addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==frameElement.contentWindow)return;
  if(event.data?.type==='scalpless:lab-ready')markLabReady();
  if(event.data?.type==='scalpless:lab-error'){
    heroError=true;root.classList.add('scene-error');root.dataset.ready='true';
    document.querySelector('.model-loading').hidden=true;startButton.disabled=false;
    status.textContent='The preview could not load. Start dissection opens the frog lab directly.';
  }
});
frameElement.addEventListener('load',()=>{
  if(frameElement.contentDocument?.documentElement.dataset.ready==='true')markLabReady();
});
if(frameElement.contentDocument?.documentElement.dataset.ready==='true')markLabReady();
cue.addEventListener('click',()=>scrollTo({top:length(),behavior:reduced.matches?'instant':'smooth'}));
startButton.addEventListener('click',start);
enterLink.addEventListener('click',event=>{
  if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||heroError)return;
  event.preventDefault();start();
});
back.addEventListener('click',event=>{
  if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();history.pushState({},'',location.pathname+location.search);leave();
});
addEventListener('scroll',readScroll,{passive:true});
addEventListener('popstate',()=>{
  if(location.hash!=='#lab'&&(entered||starting))leave();
  else if(location.hash==='#lab'){directEntry=true;if(labReady){entryProgress=1;enter();}}
});
addEventListener('pageshow',readScroll);
addEventListener('visibilitychange',()=>{if(!document.hidden&&!entered){last=performance.now();request();}});
reduced.addEventListener('change',request);
new ResizeObserver(()=>{if(!entered&&!starting)readScroll();}).observe(stage);
window.__scalplessLanding={getDebug:()=>({...current,progress,target,entryProgress,starting,labReady,entered,
  heroError,reducedMotion:reduced.matches,viewport:[stage.clientWidth,stage.clientHeight]})};
readScroll();
