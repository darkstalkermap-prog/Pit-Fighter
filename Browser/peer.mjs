// Player-hosted games with no game server: browsers connect straight to each other (WebRTC, via PeerJS).
// A free public PeerJS broker only introduces them, using a 4-letter game code.
//   host  -> registers as "coven-CODE" and runs the shared-world rules (server/hub.mjs) in this browser
//   guest -> connects to "coven-CODE" and talks to the host exactly as it would to a Coven server
import { Peer } from 'peerjs';
import { createHub } from '../server/hub.mjs';

export const PREFIX = 'coven-', MAX_GUESTS = 7;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const newCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
export const cleanCode = code => String(code ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
const UNREACHABLE = 'Could not reach the matchmaking service. Check your connection and try again.';

// ?peerhost=127.0.0.1&peerport=9000 points at another broker (tests use a local one); the default is PeerJS's own.
// ?peerice=none skips STUN servers, for browsers on the same machine with no internet.
function brokerOptions() {
  const q = new URLSearchParams(globalThis.location?.search ?? '');
  const options = { debug: 0 };
  if (q.get('peerhost')) Object.assign(options, { host: q.get('peerhost'), port: Number(q.get('peerport')) || 9000, secure: q.get('peersecure') === '1', path: '/' });
  if (q.get('peerice') === 'none') options.config = { iceServers: [] };
  return options;
}

// Runs the world for everyone. `net` is the game's Net: it receives our messages as if from a server.
export class PeerHost {
  constructor(net, tries = 0) {
    this.net = net; this.hub = createHub(); this.guests = new Map();
    const code = newCode(), peer = new Peer(PREFIX + code, brokerOptions());
    this.peer = peer;
    const timer = setTimeout(() => net.fail(UNREACHABLE), 15000);
    peer.on('open', () => {
      clearTimeout(timer);
      net.code = code;
      this.local = this.hub.connect(data => net.receive(data));
      this.local.receive(net.hello());
      this.ticker = setInterval(() => {
        this.hub.tick();
        for (const g of this.guests.values()) g.budget = 60; // flood guard: ~60 messages a second per guest
      }, 100);
    });
    peer.on('connection', conn => this.accept(conn));
    // Keep the code registered with the broker so new guests can still find us.
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    peer.on('error', e => {
      if (net.code) return; // a guest's failed connection; the game goes on
      clearTimeout(timer);
      if (e.type === 'unavailable-id' && tries < 6) { peer.destroy(); net.peer = new PeerHost(net, tries + 1); return; }
      net.fail(UNREACHABLE);
    });
  }
  accept(conn) {
    conn.on('open', () => {
      if (this.guests.size >= MAX_GUESTS) { conn.send(JSON.stringify({ type: 'error', text: 'That game is full.' })); setTimeout(() => conn.close(), 300); return; }
      const guest = { client: this.hub.connect(data => { if (conn.open) conn.send(data); }), budget: 60 };
      this.guests.set(conn, guest);
      conn.on('data', data => {
        if (--guest.budget < 0 || typeof data !== 'string' || data.length > 64 * 1024) return;
        try { guest.client.receive(JSON.parse(data)); } catch { /* ignore malformed messages */ }
      });
    });
    const gone = () => { const g = this.guests.get(conn); if (g) { g.client.close(); this.guests.delete(conn); } };
    conn.on('close', gone); conn.on('error', gone);
  }
  send(m) { this.local?.receive(m); }
  close() {
    clearInterval(this.ticker);
    for (const [conn, g] of this.guests) { g.client.close(); conn.close(); }
    this.guests.clear(); this.local?.close();
    this.peer.destroy();
  }
}

// Joins a player-hosted game by its code.
export class PeerGuest {
  constructor(net, code) {
    this.net = net;
    const peer = new Peer(brokerOptions());
    this.peer = peer;
    const timer = setTimeout(() => net.fail(`Could not connect to game ${code}. Check the code, or ask the host to try again.`), 25000);
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'raw' });
      this.conn = conn;
      conn.on('open', () => {
        clearTimeout(timer); net.code = code; conn.send(JSON.stringify(net.hello()));
        // The host sends something at least once a second (snapshots, or its 1 s heartbeat relayed); a silent
        // host has gone, even if the connection hasn't noticed yet.
        this.heard = Date.now();
        this.watchdog = setInterval(() => { if (Date.now() - this.heard > 8000 && net.peer === this) net.fail('The host has closed the game.'); }, 1000);
      });
      conn.on('data', data => { this.heard = Date.now(); if (String(data).includes('"type":"error"')) this.refused = true; net.receive(data); });
      conn.on('close', () => { if (net.peer === this && !this.refused) net.fail('The host has closed the game.'); else if (net.peer === this) net.close(); });
    });
    peer.on('error', e => { clearTimeout(timer); net.fail(e.type === 'peer-unavailable' ? `No game found with code ${code}.` : UNREACHABLE); });
  }
  send(m) { if (this.conn?.open) this.conn.send(JSON.stringify(m)); }
  close() { clearInterval(this.watchdog); this.peer.destroy(); }
}
