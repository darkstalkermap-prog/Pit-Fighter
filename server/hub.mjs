// Shared-world rules for Coven multiplayer. Each world (room) relays player positions, chat and spell effects,
// and owns the state everyone must agree on: depleted resource nodes, villages and the Unwitch.
// Pure logic: the transport passes in a `send` function per client, which makes this testable without sockets.

export const LIMITS = { players: 32, name: 20, coven: 20, world: 16, chat: 200, buildings: 200 };
export const BOSS_HP = 6000, BOSS_RESPAWN_MS = 10 * 60 * 1000, BOSS_IDLE_RESET_MS = 60 * 1000, CROWN_RANGE = 400;
const BUILDING_TYPES = new Set(['heart', 'campfire', 'cauldron', 'palisade', 'lantern', 'hut', 'well', 'garden', 'totem', 'altar']);
const CLASSES = new Set(['bog', 'hex', 'bloom', 'wild']);

const num = (v, lo, hi, fallback = 0) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const text = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '');
const worldCode = v => text(v, LIMITS.world).replace(/[^A-Za-z0-9-]/g, '').toLowerCase() || 'isle';

export function createHub({ now = Date.now } = {}) {
  const worlds = new Map();
  let nextId = 1;

  function getWorld(code) {
    if (!worlds.has(code)) worlds.set(code, { code, players: new Map(), harvested: new Map(), villages: new Map(), boss: { hp: BOSS_HP, wardUntil: 0, downUntil: 0, lastNear: 0 } });
    return worlds.get(code);
  }
  const publicPlayer = p => ({ id: p.id, name: p.name, coven: p.coven, cls: p.cls, level: p.level, x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: p.hp, maxHp: p.maxHp, moving: p.moving, swing: p.swing });
  const bossState = b => ({ hp: b.hp, max: BOSS_HP, warded: now() >= b.wardUntil, wardLeft: Math.max(0, (b.wardUntil - now()) / 1000), down: now() < b.downUntil });
  const broadcast = (world, msg, except) => { for (const p of world.players.values()) if (p !== except) p.send(msg); };

  function connect(send) {
    const client = { id: nextId++, send, world: null, lastChat: 0 };

    function hello(m) {
      if (client.world) return;
      const world = getWorld(worldCode(m.world));
      if (world.players.size >= LIMITS.players) { send({ type: 'error', text: 'That world is full.' }); return; }
      Object.assign(client, {
        name: text(m.name, LIMITS.name) || `Witch ${client.id}`, coven: text(m.coven, LIMITS.coven),
        key: text(m.key, 40) || `anon-${client.id}`, cls: CLASSES.has(m.cls) ? m.cls : 'wild', level: num(m.level, 1, 999, 1),
        x: 0, y: 0, z: 0, yaw: 0, hp: 1, maxHp: 1, moving: false, swing: 0, world,
      });
      world.players.set(client.id, client);
      const t = now();
      for (const [node, until] of world.harvested) if (until <= t) world.harvested.delete(node);
      send({
        type: 'welcome', id: client.id, world: world.code,
        players: [...world.players.values()].filter(p => p !== client).map(publicPlayer),
        harvested: [...world.harvested].map(([node, until]) => [node, (until - t) / 1000]),
        villages: [...world.villages].filter(([key]) => key !== client.key).map(([owner, v]) => ({ owner, name: v.name, list: v.list })),
        boss: bossState(world.boss),
      });
      broadcast(world, { type: 'join', player: publicPlayer(client) }, client);
      if (Array.isArray(m.buildings)) village({ list: m.buildings });
    }

    function village(m) {
      if (!Array.isArray(m.list)) return;
      const list = m.list.slice(0, LIMITS.buildings).filter(b => b && BUILDING_TYPES.has(b.type)).map(b => ({
        id: text(String(b.id), 40), type: b.type, x: num(b.x, -6000, 6000), y: num(b.y, -100, 1000), z: num(b.z, -6000, 6000), rot: num(b.rot, -100, 100),
      }));
      client.world.villages.set(client.key, { name: client.name, list });
      broadcast(client.world, { type: 'village', owner: client.key, name: client.name, list }, client);
    }

    function bossHit(m) {
      const b = client.world.boss, t = now();
      if (t < b.downUntil) return;
      b.hp -= num(m.amount, 0, 1500) * (t < b.wardUntil ? 1 : .1);
      b.lastNear = t;
      if (b.hp <= 0) {
        b.hp = 0; b.downUntil = t + BOSS_RESPAWN_MS; b.wardUntil = 0;
        broadcast(client.world, { type: 'bossDown', by: client.name, boss: bossState(b) });
      } else broadcast(client.world, { type: 'boss', boss: bossState(b) });
    }

    const handlers = {
      hello,
      village,
      bossHit,
      state(m) {
        Object.assign(client, { x: num(m.x, -6000, 6000), y: num(m.y, -100, 1000), z: num(m.z, -6000, 6000), yaw: num(m.yaw, -1e4, 1e4), hp: num(m.hp, -1e4, 1e5), maxHp: num(m.maxHp, 1, 1e5, 1), level: num(m.level, 1, 999, 1), moving: !!m.moving, swing: num(m.swing, 0, 1), cls: CLASSES.has(m.cls) ? m.cls : client.cls });
        if (Math.hypot(client.x, client.z) < CROWN_RANGE) client.world.boss.lastNear = now();
      },
      harvest(m) {
        const node = text(m.node, 40);
        if (!node) return;
        const seconds = num(m.seconds, 30, 1800, 600);
        client.world.harvested.set(node, now() + seconds * 1000);
        broadcast(client.world, { type: 'harvest', node, seconds }, client);
      },
      ward(m) {
        const b = client.world.boss;
        if (now() < b.downUntil) return;
        b.wardUntil = now() + num(m.seconds, 0, 25) * 1000;
        broadcast(client.world, { type: 'boss', boss: bossState(b) });
      },
      fx(m) {
        broadcast(client.world, { type: 'fx', x: num(m.x, -6000, 6000), y: num(m.y, -100, 1000), z: num(m.z, -6000, 6000), r: num(m.r, .5, 40, 3), color: /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#ffffff' }, client);
      },
      chat(m) {
        const t = now(), msg = text(m.text, LIMITS.chat);
        if (!msg || t - client.lastChat < 500) return;
        client.lastChat = t;
        broadcast(client.world, { type: 'chat', id: client.id, name: client.name, text: msg });
      },
    };

    return {
      id: client.id,
      receive(m) {
        if (!m || typeof m.type !== 'string' || !handlers[m.type]) return;
        if (m.type !== 'hello' && !client.world) return;
        handlers[m.type](m);
      },
      close() {
        const world = client.world;
        if (!world) return;
        world.players.delete(client.id);
        broadcast(world, { type: 'leave', id: client.id });
        if (!world.players.size) worlds.delete(world.code);
      },
    };
  }

  // Called ~10 times a second: send everyone the others' positions, and look after the Unwitch.
  function tick() {
    const t = now();
    for (const world of worlds.values()) {
      const b = world.boss;
      if (b.downUntil && t >= b.downUntil) { Object.assign(b, { hp: BOSS_HP, downUntil: 0, wardUntil: 0 }); broadcast(world, { type: 'boss', boss: bossState(b) }); }
      if (b.hp < BOSS_HP && !b.downUntil && t - b.lastNear > BOSS_IDLE_RESET_MS) { b.hp = BOSS_HP; b.wardUntil = 0; broadcast(world, { type: 'boss', boss: bossState(b) }); }
      if (world.players.size < 2) continue;
      const all = [...world.players.values()].map(publicPlayer);
      for (const p of world.players.values()) p.send({ type: 'snap', players: all.filter(o => o.id !== p.id) });
    }
  }

  return { connect, tick, worlds };
}
