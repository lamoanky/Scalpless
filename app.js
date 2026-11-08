import { GestureTracker } from './gestures.js';
import { assessHand, VisibilityGuard, fingerNames } from './tracking-quality.js';
import { assignHands, rotateCameraResult } from './hand-pose.js';
const $ = id => document.getElementById(id);
const video = $('webcam'), canvas = $('overlay'), ctx = canvas.getContext('2d');
const tracker = new GestureTracker();
const visibility = new VisibilityGuard();
const cursorHeights=new Map();
let displayedCursor=null;
function updateCursorReadout(point) {
  $('coordinates').textContent=point?`${point.x.toFixed(2)} / ${point.y.toFixed(2)} / ${point.z.toFixed(2)}`:'— / — / —';
  $('cursor-height').value=point?.z||0;
  $('height-label').textContent=point?`Z height ${Math.round(point.z*100)}%`:'Z height —';
}
window.addEventListener('tracking:cursor3d',({detail})=>{
  if(!detail) {cursorHeights.clear();displayedCursor=null;updateCursorReadout(null);return;}
  cursorHeights.set(detail.label,detail.z);
  if(displayedCursor && detail.label===tracker.primaryLabel) {
    displayedCursor.z=detail.z;
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
    $('hands-status').textContent = 'Ready for hand tracking';
  }).catch(error => {
    sceneAttempt = null;
    $('hands-status').textContent = '3D unavailable. Check WebGL and your connection, then restart camera.';
    console.error(error);
  });
  return sceneAttempt;
}
loadHandScene();
$('angle').addEventListener('change', e => handScene?.setAngle(e.target.checked));
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
const edges = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
let model, stream, running = false, frame, lastTime = -1, zoom = 1, count = 0, lastLog = 0;
const logs = [];
for (const name of ['move','pinchstart','pinchend','cutstart','cutend','zoom']) {
  window.addEventListener(`input:${name}`, ({ detail }) => {
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
  $('gesture-help').textContent = s.hands >= 2 ? 'Move index tips apart or together.' : s.mode === 'hand' ? 'Separate thumb and index to release.' : s.hold > 0 ? $('scalpel-instructions').textContent : 'Move your hand, pinch to grab, or extend only your index for the scalpel.';
  $('hold').value = s.hold; $('hand-count').textContent = `${s.hands} hands`;
  $('indicator').classList.toggle('on', s.hands > 0);
  $('status').textContent = running ? s.hands ? 'Hand detected' : 'Looking for hands' : 'Camera off';
  displayedCursor=s.point||null;
  updateCursorReadout(displayedCursor);
  $('cursor').hidden = !s.point;
  if (s.point) { $('cursor').style.left = `${s.point.x * 100}%`; $('cursor').style.top = `${s.point.y * 100}%`; $('cursor').dataset.mode = s.mode; }
  const kind = s.hands >= 2 ? 'zoom' : s.mode === 'hand' ? 'pinch' : s.hold > 0 || s.mode === 'scalpel' ? 'scalpel' : s.hands ? 'move' : null;
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
  $('hands-hint').hidden = false;
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
      $('hands-hint').hidden = !!handScene && result.landmarks.length > 0;
      if (handScene) $('hands-status').textContent = result.landmarks.length ? `${result.landmarks.length} virtual ${result.landmarks.length === 1 ? 'hand' : 'hands'} following you` : 'Hold your hands inside the camera frame';
      draw(rawResult.landmarks);
      const state=tracker.update(result.landmarks,now,labels,assisted?held:[],labels.map(label=>cursorHeights.get(label)),result.worldLandmarks,aspect);
      show(state);
      handScene?.setScalpel(state.mode==='scalpel'?tracker.primaryLabel:null);
      handScene?.setCursor(state.point?tracker.primaryLabel:null,state.mode);
    }
    frame = requestAnimationFrame(loop);
  } catch (error) { stop(); errorMessage(error); }
}
async function start() {
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
$('sensitivity').addEventListener('input', e => { tracker.sensitivity = Number(e.target.value); $('sensitivity-value').textContent = `${tracker.sensitivity.toFixed(2)}×`; });
document.addEventListener('visibilitychange', () => { if (document.hidden && running) stop(); });
window.addEventListener('pagehide', () => { stop(); model?.close(); model = null; });
