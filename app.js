import { GestureTracker } from './gestures.js';
const $ = id => document.getElementById(id);
const video = $('webcam'), canvas = $('overlay'), ctx = canvas.getContext('2d');
const tracker = new GestureTracker();
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
  $('gesture-help').textContent = s.hands >= 2 ? 'Move index tips apart or together.' : s.mode === 'hand' ? 'Separate thumb and index to release.' : s.hold > 0 ? 'Keep index extended and other fingers curled.' : 'Hold a hand in view. Your index fingertip controls the cursor.';
  $('hold').value = s.hold; $('hand-count').textContent = `${s.hands} hands`;
  $('indicator').classList.toggle('on', s.hands > 0);
  $('status').textContent = running ? s.hands ? 'Hand detected' : 'Looking for hands' : 'Camera off';
  $('coordinates').textContent = s.point ? `${s.point.x.toFixed(2)} , ${s.point.y.toFixed(2)}` : '— , —';
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
      const now = performance.now(), result = model.detectForVideo(video, now);
      draw(result.landmarks); show(tracker.update(result.landmarks, now, result.handedness.map(c => c[0]?.categoryName)));
    }
    frame = requestAnimationFrame(loop);
  } catch (error) { stop(); errorMessage(error); }
}
async function start() {
  $('toggle').disabled = true;
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new DOMException('Use localhost or HTTPS.', 'SecurityError');
    $('message').textContent = 'Loading hand tracking model…';
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
