// Coven server: serves the built game from _site and runs the multiplayer worlds on /ws.
// Run `npm run build` first, then `npm run server`. Deploys to Render with render.yaml.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createHub } from './hub.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '_site');
const PORT = Number(process.env.PORT) || 8080;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const hub = createHub();

const server = http.createServer(async (req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); res.end(); return; }
  if (pathname === '/api/ping') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ coven: true, worlds: hub.worlds.size, players: [...hub.worlds.values()].reduce((n, w) => n + w.players.size, 0) }));
    return;
  }
  const file = path.normalize(path.join(ROOT, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(ROOT + path.sep) || pathname.includes('\0')) { res.writeHead(403); res.end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
wss.on('connection', ws => {
  const client = hub.connect(data => { if (ws.readyState === 1) ws.send(data); });
  ws.budget = 60;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', data => {
    if (--ws.budget < 0) return; // flood guard: ~60 messages per second
    try { client.receive(JSON.parse(data)); } catch { /* ignore malformed messages */ }
  });
  ws.on('close', () => client.close());
});

setInterval(() => { hub.tick(); }, 100);
setInterval(() => {
  for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
}, 30000);
// Refill each connection's message budget every second.
setInterval(() => { for (const ws of wss.clients) ws.budget = 60; }, 1000);

server.listen(PORT, () => console.log(`Coven server on http://localhost:${server.address().port}`));
