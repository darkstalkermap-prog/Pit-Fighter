// WebSocket link to a Coven server. Reconnects after drops; queues nothing while offline.

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
    this.wanted = true; this.server = server; this.hello = hello;
    this.open();
  }
  open() {
    let ws;
    try { ws = new WebSocket(socketUrl(this.server)); } catch (e) { this.setStatus('error', e.message); return; }
    this.ws = ws; this.setStatus('connecting');
    ws.onopen = () => { this.retry = 0; ws.send(JSON.stringify(this.hello())); };
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'welcome') this.setStatus('online');
      this.handlers[m.type]?.(m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (!this.wanted) return;
      this.setStatus('reconnecting');
      this.timer = setTimeout(() => this.open(), Math.min(15000, 1000 * 2 ** this.retry++));
    };
  }
  send(m) { if (this.ws?.readyState === 1 && this.online) this.ws.send(JSON.stringify(m)); }
  close() {
    this.wanted = false; clearTimeout(this.timer);
    if (this.ws) { const ws = this.ws; this.ws = null; ws.close(); }
    this.setStatus('offline');
  }
  setStatus(status, detail = '') { this.status = status; this.handlers.status?.(status, detail); }
}
