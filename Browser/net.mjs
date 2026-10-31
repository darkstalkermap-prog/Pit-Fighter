// The game's link to a shared world: a WebSocket to a Coven server (reconnects after drops), or a player-hosted
// game over WebRTC (peer.mjs), hosted here or joined by code. Queues nothing while offline.
import { PeerHost, PeerGuest, cleanCode } from './peer.mjs';

// Baked in at build time from the COVEN_SERVER environment variable (see Scripts/build_browser.mjs).
const BUILT_SERVER = typeof __COVEN_SERVER__ === 'string' ? __COVEN_SERVER__ : '';

// The server to use when the player hasn't typed one: the page's own host when it is served by a Coven server,
// otherwise the address baked into the build.
export function defaultServer(loc = globalThis.location) {
  if (loc && /^https?:$/.test(loc.protocol) && !/\.github\.io$/i.test(loc.hostname)) return loc.origin;
  return BUILT_SERVER;
}

// http(s)://host[:port][/path] → ws(s)://host[:port][/path]/ws
export function socketUrl(server) {
  const url = new URL(/^[a-z]+:\/\//i.test(server) ? server : `https://${server}`);
  url.protocol = url.protocol === 'http:' || url.protocol === 'ws:' ? 'ws:' : 'wss:';
  url.pathname = url.pathname.replace(/\/(ws)?$/, '') + '/ws';
  return url.href;
}

export class Net {
  constructor() { this.handlers = {}; this.ws = null; this.status = 'offline'; this.wanted = false; this.retry = 0; }
  on(type, fn) { this.handlers[type] = fn; return this; }
  get online() { return this.status === 'online'; }

  // `hello()` builds the join message fresh on each (re)connect.
  connect(server, hello) {
    this.close();
    this.wanted = true; this.mode = 'server'; this.server = server; this.hello = hello;
    this.open();
  }
  // Host a game in this browser; once ready, `code` holds the 4-letter code others join with.
  host(hello) {
    this.close();
    this.wanted = true; this.mode = 'host'; this.hello = hello;
    this.setStatus('connecting');
    this.peer = new PeerHost(this);
  }
  join(code, hello) {
    this.close();
    code = cleanCode(code);
    if (code.length !== 4) { this.handlers.error?.({ text: 'A game code is four letters.' }); return; }
    this.wanted = true; this.mode = 'join'; this.hello = hello;
    this.setStatus('connecting');
    this.peer = new PeerGuest(this, code);
  }
  // A message from the world, as JSON text or already parsed.
  receive(data) {
    let m;
    try { m = typeof data === 'string' ? JSON.parse(data) : data; } catch { return; }
    if (m?.type === 'welcome') this.setStatus('online');
    if (m?.type) this.handlers[m.type]?.(m);
  }
  fail(text) { if (!this.wanted) return; this.handlers.error?.({ text }); this.close(); }
  open() {
    let ws;
    try { ws = new WebSocket(socketUrl(this.server)); } catch (e) { this.setStatus('error', e.message); return; }
    this.ws = ws; this.setStatus('connecting');
    ws.onopen = () => { this.retry = 0; ws.send(JSON.stringify(this.hello())); };
    ws.onmessage = e => this.receive(e.data);
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (!this.wanted) return;
      this.setStatus('reconnecting');
      this.timer = setTimeout(() => this.open(), Math.min(15000, 1000 * 2 ** this.retry++));
    };
  }
  send(m) {
    if (!this.online) return;
    if (this.peer) this.peer.send(m);
    else if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m));
  }
  close() {
    this.wanted = false; clearTimeout(this.timer); this.code = null;
    if (this.peer) { const peer = this.peer; this.peer = null; peer.close(); }
    if (this.ws) { const ws = this.ws; this.ws = null; ws.close(); }
    this.setStatus('offline');
  }
  setStatus(status, detail = '') { this.status = status; this.handlers.status?.(status, detail); }
}
