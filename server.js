import http from 'node:http';
import { readFile } from 'node:fs/promises';

const files = {
  '/': ['gesture-sandbox.html', 'text/html'],
  '/gesture-sandbox.html': ['gesture-sandbox.html', 'text/html'],
  '/styles.css': ['styles.css', 'text/css'],
  '/app.js': ['app.js', 'text/javascript'],
  '/gestures.js': ['gestures.js', 'text/javascript'],
  '/hands3d.js': ['hands3d.js', 'text/javascript'],
  '/hand-pose.js': ['hand-pose.js', 'text/javascript'],
  '/tracking-quality.js': ['tracking-quality.js', 'text/javascript'],
  '/rigged-hand.js': ['rigged-hand.js', 'text/javascript'],
  '/sandbox-state.js': ['sandbox-state.js', 'text/javascript'],
  '/sandbox.js': ['sandbox.js', 'text/javascript'],
  '/mouse-input.js': ['mouse-input.js', 'text/javascript'],
  '/assets/left-hand.glb': ['assets/left-hand.glb', 'model/gltf-binary'],
  '/assets/right-hand.glb': ['assets/right-hand.glb', 'model/gltf-binary'],
};
http.createServer(async (req, res) => {
  const file = files[new URL(req.url, 'http://localhost').pathname];
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(new URL(file[0], import.meta.url));
    res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(500); res.end('Could not read file'); }
}).listen(3000, '127.0.0.1', () => console.log('Gesture lab: http://localhost:3000'));
