import { GestureTracker } from './gestures.js';
import { assessHand, VisibilityGuard, fingerNames } from './tracking-quality.js';
import { assignHands, rotateCameraResult } from './hand-pose.js';
const $ = id => document.getElementById(id);
const video = $('webcam'), canvas = $('overlay'), ctx = canvas.getContext('2d');
const tracker = new GestureTracker();
const visibility = new VisibilityGuard();
const cursorHeights=new Map();
const cursorPositions=new Map();
const gripPositions=new Map();
let displayedCursor=null;
function updateCursorReadout(point) {
  $('coordinates').textContent=point?`${point.x.toFixed(2)} / ${point.y.toFixed(2)} / ${point.z.toFixed(2)}`:'— / — / —';
  $('cursor-height').value=point?.z||0;
  $('height-label').textContent=point?`Z height ${Math.round(point.z*100)}%`:'Z height —';
}
window.addEventListener('tracking:cursor3d',({detail})=>{
  if(!detail) {cursorHeights.clear();cursorPositions.clear();gripPositions.clear();displayedCursor=null;updateCursorReadout(null);return;}
  cursorHeights.set(detail.label,detail.z);
  cursorPositions.set(detail.label,detail.rawWorld||detail.world);
  if(detail.gripWorld)gripPositions.set(detail.label,detail.gripWorld);
  if(displayedCursor && (detail.label===tracker.primaryLabel || detail.label==='Mouse' && $('input-source').value==='mouse')) {
    displayedCursor.z=detail.z;
    displayedCursor.world={...detail.world};
    updateCursorReadout(displayedCursor);
  }
});
let previousWrists = {}, wristsSeen = 0;
let handScene;
let sceneAttempt;
function loadHandScene() {
  if (!sceneAttempt) sceneAttempt = import('./hands3d.js').then(async ({ createHandScene }) => {
    handScene = await createHandScene($('hands-stage'));
    handScene.setAngle($('angle').checked);
    handScene.setCameraMode($('camera-mode').value);
    $('hands-hint').hidden=$('input-source').value==='mouse';
    if($('tool-scalpel').getAttribute('aria-pressed')==='true')mouseTool('scalpel');
    $('hands-status').textContent = $('input-source').value==='mouse'?'Mouse controls ready':'Ready for hand tracking';
  }).catch(error => {
    sceneAttempt = null;
    $('hands-status').textContent = '3D unavailable. Check WebGL and your connection, then restart camera.';
    console.error(error);
  });
  return sceneAttempt;
}
loadHandScene();
$('angle').addEventListener('change', e => handScene?.setAngle(e.target.checked));
function applyInputSource(){
  tracker.reset();handScene?.setInputSource($('input-source').value);
  const mouse=$('input-source').value==='mouse';
  $('mouse-tools').hidden=!mouse;$('hands-hint').hidden=mouse;
  document.querySelector('.camera-setup').hidden=mouse;
  if(handScene)$('hands-status').textContent=mouse?'Mouse controls ready':'Ready for hand tracking';
  $('sandbox-controls-help').textContent=mouse?'Drag the cube with Hand. Use Height to lift. Select Scalpel and move over the pad: it snaps onto the surface. Drag along the glowing lane. Wheel or +/− to zoom.':'Pinch to carry the cube, then release into the tray. Extend only your index for the scalpel. Move near the pad to lock onto its surface, then trace the glowing lane. Lift away to unlock.';
}
$('input-source').addEventListener('change',applyInputSource);
function mouseHeight(value){$('mouse-height').value=value;$('mouse-height-value').textContent=`${Math.round(Number(value)*100)}%`;handScene?.setMouseHeight(value);}
function mouseTool(tool){
  $('tool-hand').setAttribute('aria-pressed',String(tool==='hand'));$('tool-scalpel').setAttribute('aria-pressed',String(tool==='scalpel'));
  mouseHeight(handScene?.setMouseTool(tool)??(tool==='hand' ? .11 : .072));
}
$('tool-hand').addEventListener('click',()=>mouseTool('hand'));
$('tool-scalpel').addEventListener('click',()=>mouseTool('scalpel'));
$('mouse-height').addEventListener('input',event=>mouseHeight(event.target.value));
$('reset-sandbox').addEventListener('click',()=>{tracker.reset();handScene?.resetSandbox();});
window.addEventListener('keydown',event=>{
  if($('input-source').value!=='mouse' || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || event.ctrlKey || event.metaKey || event.altKey)return;
  const key=event.key.toLowerCase();
  if(key==='h')mouseTool('hand');else if(key==='s')mouseTool('scalpel');
  else if(key==='arrowup' || key==='arrowdown'){event.preventDefault();mouseHeight(Math.max(0,Math.min(1,Number($('mouse-height').value)+(key==='arrowup' ? .025 : -.025))));}
  else if(key==='+' || key==='=' || key==='-'){event.preventDefault();window.dispatchEvent(new CustomEvent('input:zoom',{detail:{delta:key==='-'?-.12:.12,source:'mouse'}}));}
});
window.addEventListener('sandbox:change',({detail})=>{
  $('sandbox-status').textContent=detail.message;
  $('grab-task').classList.toggle('done',detail.placed);$('cut-task').classList.toggle('done',detail.cutComplete);
  $('grab-task').querySelector('span').textContent=detail.placed?'Cube placed in tray ✓':detail.grabbed?'Cube grabbed · move toward tray':'Drop the cube inside the tray';
  $('cut-progress').value=detail.progress;$('cut-progress-label').textContent=detail.cutComplete?'Guide complete ✓':`Trace the guide · ${detail.progress}%`;
  $('cut-feedback').textContent=detail.cutComplete?'Cut complete':detail.onGuide?(detail.cutting?'On guide · cutting':'On guide · ready to cut'):detail.snapped?'Surface locked · follow the dots':'Scalpel snaps onto the pad when nearby';
  $('cut-feedback').dataset.state=detail.onGuide?'guide':detail.snapped?'locked':'hover';
});
function applyCameraSetup() {
  cursorHeights.clear();displayedCursor=null;updateCursorReadout(null);
  tracker.reset();visibility.reset();previousWrists={};wristsSeen=0;
  const flat=$('camera-mode').value==='flat';
  tracker.cameraMode=flat?'flat':'front';
  handScene?.setCameraMode(tracker.cameraMode);
  document.querySelector('.camera-panel').classList.toggle('flat-camera',flat);
  document.querySelector('.mirror-label').textContent=flat?'MIRRORED VIEW / LENS UP':'MIRRORED VIEW';
  $('setup-help').textContent=flat?'Place the camera lens-up below your hands, palms down. Closer to the lens = larger and lower; farther = smaller and higher. Set neutral hand size at a comfortable height. Adjust camera rotation to align movement.':'Point the camera toward you. Move your hand left/right/up/down. Use rotation if the webcam is mounted sideways.';
  $('reset-hand-size').hidden=!flat;
  $('movement-help').textContent=flat?'Move across the table / Lift to shrink / Lower to enlarge':'Move left / right / up / down';
  $('scalpel-instructions').textContent='Extend only your index; curl middle, ring and pinky. Keep your palm down. Hold for 0.3 seconds.';
  $('tracking-tip').textContent=flat?'Hover palms down above the lens. Keep your fingers separated and in view.':'Keep your fingers upright or diagonal and in view.';
}
$('camera-mode').addEventListener('change',applyCameraSetup);
$('camera-rotation').addEventListener('change',applyCameraSetup);
$('reset-hand-size').addEventListener('click',()=>{
  handScene?.resetHandSize();
  $('message').textContent='Hand size reset. Hold your hands at a comfortable height above the lens.';
});
applyCameraSetup();
applyInputSource();
const edges = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
let model, stream, running = false, frame, lastTime = -1, zoom = 1, count = 0, lastLog = 0;
const logs = [];
for (const name of ['move','pinchstart','pinchend','cutstart','cutend','zoom']) {
  window.addEventListener(`input:${name}`, ({ detail }) => {
    if(detail.source==='mouse' && name==='move')show({gesture:detail.mode==='hand'?'Mouse / hand':'Mouse / scalpel',mode:detail.mode,hands:0,hold:0,point:detail});
    $('event-count').textContent = `${++count} events`;
    if (name === 'zoom') { zoom = Math.max(.25, Math.min(4, zoom * Math.exp(detail.delta))); $('zoom').textContent = `${Math.round(zoom * 100)}%`; }
    if (name === 'move' && performance.now() - lastLog < 250) return;
    if (name === 'move') lastLog = performance.now();
    logs.unshift(`input:${name} ${JSON.stringify(detail, (_, v) => typeof v === 'number' ? +v.toFixed(3) : v)}`);
    logs.length = Math.min(logs.length, 10); $('events').textContent = logs.join('\n');
  });
}
function show(s) {
  $('gesture').textContent = s.gesture;
  $('gesture-help').textContent = s.point?.source==='mouse'?(s.mode==='hand'?'Drag near the cube to grab it. Use Height or arrow keys to lift.':'Move near the pad to snap onto it. Drag along the glowing lane; green means on guide.'):s.mode==='hand'?'Hold the pinch to carry the cube. Separate thumb and index to release.':s.hands >= 2 ? 'Move index tips apart or together.' : s.hold > 0 ? $('scalpel-instructions').textContent : 'Move your hand, pinch to grab, or extend only your index for the scalpel.';
  $('hold').value = s.hold; $('hand-count').textContent = `${s.hands} hands`;
  $('indicator').classList.toggle('on', s.hands > 0);
  $('status').textContent = running ? s.hands ? 'Hand detected' : 'Looking for hands' : 'Camera off';
  displayedCursor=s.point||null;
  updateCursorReadout(displayedCursor);
  $('cursor').hidden = !s.point;
  if (s.point) { $('cursor').style.left = `${s.point.x * 100}%`; $('cursor').style.top = `${s.point.y * 100}%`; $('cursor').dataset.mode = s.mode; }
  const kind = s.mode==='hand'?'pinch':s.hold>0 || s.mode==='scalpel'?'scalpel':s.hands>=2?'zoom':s.hands?'move':null;
  document.querySelectorAll('.gesture-card').forEach(c => c.classList.toggle('active', c.dataset.kind === kind));
}
function draw(hands) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!$('landmarks').checked) return;
  hands.forEach((h, index) => {
    ctx.strokeStyle = index ? '#ffcc70' : '#93e8bc'; ctx.lineWidth = 3;
    for (const [a,b] of edges) { ctx.beginPath(); ctx.moveTo(h[a].x * canvas.width, h[a].y * canvas.height); ctx.lineTo(h[b].x * canvas.width, h[b].y * canvas.height); ctx.stroke(); }
    h.forEach((p,i) => { ctx.fillStyle = i === 8 || i === 4 ? '#e3ff85' : '#fff'; ctx.beginPath(); ctx.arc(p.x * canvas.width, p.y * canvas.height, i === 8 ? 7 : 4, 0, Math.PI * 2); ctx.fill(); });
  });
}
function stop() {
  cursorHeights.clear();
  visibility.reset(); previousWrists = {}; wristsSeen = 0;
  $('tracking-tip').textContent = tracker.cameraMode==='flat'?'Hover palms down above the lens with fingers separated.':'Keep your real fingers upright or diagonal; virtual hands still reach over the table.';
  $('tracking-tip').classList.remove('warning');
  handScene?.clear();
  $('hands-hint').hidden = $('input-source').value==='mouse';
  running = false; cancelAnimationFrame(frame);
  stream?.getTracks().forEach(t => t.stop()); stream = null; video.srcObject = null; lastTime = -1;
  ctx.clearRect(0, 0, canvas.width, canvas.height); show(tracker.reset());
  $('gesture').textContent = 'Waiting for camera'; $('placeholder').hidden = false;
  $('toggle').textContent = 'Start camera ↗'; $('message').textContent = 'Camera stopped. Start again whenever you are ready.';
}
function errorMessage(error) {
  const messages = { NotAllowedError: 'Camera permission denied. Allow access in your browser and retry.', NotFoundError: 'No webcam found. Connect a camera and retry.', NotReadableError: 'Camera unavailable. Close other camera apps and retry.', SecurityError: 'Open on localhost or HTTPS to use your camera.' };
  $('message').textContent = messages[error.name] || `Tracking failed. Check your connection and retry. ${error.message || ''}`;
  $('status').textContent = 'Tracking unavailable'; console.error(error);
}
function loop() {
  if (!running) return;
  try {
    if (video.readyState >= 2 && video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      const now = performance.now(), rawResult = model.detectForVideo(video, now);
      const turns=Number($('camera-rotation').value);
      const result=rotateCameraResult(rawResult,turns);
      const aspect=turns%2?video.videoHeight/video.videoWidth:video.videoWidth/video.videoHeight;
      if(now-wristsSeen>300) previousWrists={};
      const labels=assignHands(result.landmarks,result.handedness.map(c=>c[0]?.categoryName),previousWrists);
      const held=result.landmarks.map((image,i)=>visibility.update(labels[i],assessHand(image,aspect),now));
      labels.forEach((label,i)=>{previousWrists[label]={...result.landmarks[i][0]};}); wristsSeen=now;
      const assisted=$('assist').checked;
      handScene?.update(result, aspect, assisted?held:undefined);
      const obscured=[...new Set(held.flatMap(h=>h.flatMap((blocked,i)=>blocked?[fingerNames[i]]:[])))];
      $('tracking-tip').classList.toggle('warning',obscured.length>0);
      $('tracking-tip').textContent=obscured.length ? `Limited view: ${obscured.join(', ')}. ${assisted?'Extra finger smoothing active. ':''}Keep your index visible for the scalpel, or thumb and index visible to pinch.` : 'Extend only your index with your palm down to bring out the scalpel.';
      if(!result.landmarks.length) $('tracking-tip').textContent=tracker.cameraMode==='flat'?'Hover your hands above the lens with palms down and fingers pointing away from you.':'Hold a hand in view with fingers upright or diagonal. Avoid pointing fingertips into the lens.';
      $('hands-hint').hidden = $('input-source').value==='mouse' || !!handScene && result.landmarks.length > 0;
      if (handScene && $('input-source').value==='webcam') $('hands-status').textContent = result.landmarks.length ? `${result.landmarks.length} virtual ${result.landmarks.length === 1 ? 'hand' : 'hands'} following you` : 'Hold your hands inside the camera frame';
      draw(rawResult.landmarks);
      if($('input-source').value==='webcam'){
        const state=tracker.update(result.landmarks,now,labels,assisted?held:[],labels.map(label=>cursorHeights.get(label)),result.worldLandmarks,aspect,labels.map(label=>cursorPositions.get(label)),labels.map(label=>gripPositions.get(label)));
        show(state);
        handScene?.setScalpel(state.mode==='scalpel'?tracker.primaryLabel:null);
        handScene?.setCursor(state.point?tracker.primaryLabel:null,state.mode);
      }
    }
    frame = requestAnimationFrame(loop);
  } catch (error) { stop(); errorMessage(error); }
}
async function start() {
  $('input-source').value='webcam';applyInputSource();
  $('toggle').disabled = true;
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new DOMException('Use localhost or HTTPS.', 'SecurityError');
    $('message').textContent = 'Loading hand tracking model…';
    loadHandScene();
    if (!model) {
      const version = '0.10.22-rc.20250304';
      const { FilesetResolver, HandLandmarker } = await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}/vision_bundle.mjs`);
      const vision = await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}/wasm`);
      const options = { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .6, minHandPresenceConfidence: .6, minTrackingConfidence: .6 };
      try { model = await HandLandmarker.createFromOptions(vision, options); }
      catch { options.baseOptions.delegate = 'CPU'; model = await HandLandmarker.createFromOptions(vision, options); }
    }
    $('message').textContent = 'Waiting for camera permission…';
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
    video.srcObject = stream; await video.play();
    canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.parentElement.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
    stream.getVideoTracks()[0].addEventListener('ended', () => { if (running) stop(); });
    running = true; $('placeholder').hidden = true; $('toggle').textContent = 'Stop camera'; $('message').textContent = 'Tracking live. Keep your hands inside the frame.'; loop();
  } catch (error) { stop(); errorMessage(error); }
  finally { $('toggle').disabled = false; }
}
$('toggle').addEventListener('click', () => running ? stop() : start());
$('use-webcam').addEventListener('click',()=>{if(running){$('input-source').value='webcam';applyInputSource();}else start();});
$('sensitivity').addEventListener('input', e => { tracker.sensitivity = Number(e.target.value); $('sensitivity-value').textContent = `${tracker.sensitivity.toFixed(2)}×`; });
document.addEventListener('visibilitychange', () => { if (document.hidden && running) stop(); });
window.addEventListener('pagehide', () => { stop(); model?.close(); model = null; });
