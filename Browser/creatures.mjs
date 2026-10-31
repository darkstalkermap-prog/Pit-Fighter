// Creature behaviour: spawning rules, AI, status effects and allied summons. No rendering here.
import { BESTIARY, CREATURE } from './bestiary.mjs';

let nextId = 1;

export function makeCreature(kind, x, z, extra = {}) {
  const b = CREATURE[kind];
  return { id: nextId++, kind, x, z, y: 0, yaw: Math.random() * Math.PI * 2, hp: b.hp, maxHp: b.hp, state: 'wander', timer: 0, cooldown: 0, tx: x, tz: z, angry: false, walk: 0, hurt: 0, poison: 0, poisonDps: 0, slow: 0, root: 0, ...extra };
}

// Pick a non-elite creature suited to the region, the danger level and the time of day.
export function pickCreature(region, danger, night, random = Math.random) {
  const options = BESTIARY.filter(b => b.region === region && !b.elite && b.level <= danger + 1 && b.level >= danger - 5 && (!b.night || night));
  return options.length ? options[Math.floor(random() * options.length)].id : null;
}

const wrap = a => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

function steer(c, heading, speed, dt, ground, fly) {
  c.yaw += Math.max(-dt * 6, Math.min(dt * 6, wrap(heading - c.yaw)));
  const nx = c.x + Math.cos(c.yaw) * speed * dt, nz = c.z + Math.sin(c.yaw) * speed * dt;
  if (fly || ground(nx, nz) > .3) { c.x = nx; c.z = nz; c.walk += speed * dt; return true; }
  return false;
}

// Advance one creature. `bite(damage, creature)` hits the player. `wards` are points beasts avoid.
export function updateCreature(c, player, ground, dt, night, bite, wards = [], random = Math.random) {
  const b = CREATURE[c.kind], dx = player.x - c.x, dz = player.z - c.z, d = Math.hypot(dx, dz), alive = player.hp > 0;
  c.cooldown -= dt; c.timer -= dt; c.hurt = Math.max(0, c.hurt - dt); c.slow = Math.max(0, c.slow - dt); c.root = Math.max(0, c.root - dt);
  if (c.poison > 0) { c.poison -= dt; c.hp -= c.poisonDps * dt; }

  const ward = wards.find(w => Math.hypot(w.x - c.x, w.z - c.z) < 30);
  if (b.temper === 'timid') {
    if (alive && (c.hurt > 0 || !c.calm && d < (player.sprinting ? 22 : 12))) c.state = 'flee';
    else if (c.state === 'flee' && d > 45) c.state = 'wander';
  } else if (alive && (b.temper === 'hostile' || c.angry) && !ward) {
    const sense = b.elite ? 45 : b.temper === 'hostile' ? (night ? 36 : 22) : 60;
    if (d < sense || c.hurt > 0) c.state = 'chase';
    else if (c.state === 'chase' && d > sense * 2.2) { c.state = 'wander'; c.angry = false; }
  } else if (c.state === 'chase') c.state = 'wander';

  let speed = 0, heading = c.yaw;
  const pace = b.speed * (c.slow > 0 ? .5 : 1) * (c.root > 0 ? 0 : 1), reach = 1.6 + b.size * .8;
  if (ward && b.temper !== 'timid') { heading = Math.atan2(c.z - ward.z, c.x - ward.x); speed = pace * .8; c.state = 'wander'; }
  else if (c.state === 'flee') { heading = Math.atan2(-dz, -dx); speed = pace; }
  else if (c.state === 'chase') {
    heading = Math.atan2(dz, dx);
    if (d > reach * .8) speed = pace * .9;
    if (d < reach + .6 && c.cooldown <= 0 && c.root <= 0) { c.cooldown = b.elite ? 1.6 : 1.3; bite(b.damage, c); }
  } else {
    // Elites keep near their lair; others roam.
    if (c.timer <= 0) {
      c.timer = 3 + random() * 6;
      const a = random() * Math.PI * 2, r = 8 + random() * 25, hx = c.homeX ?? c.x, hz = c.homeZ ?? c.z;
      const leash = b.elite || c.homeX !== undefined, roam = c.roam ?? r;
      c.tx = (leash ? hx : c.x) + Math.cos(a) * Math.min(r, roam); c.tz = (leash ? hz : c.z) + Math.sin(a) * Math.min(r, roam);
    }
    const tx = c.tx - c.x, tz = c.tz - c.z;
    if (Math.hypot(tx, tz) > 1) { heading = Math.atan2(tz, tx); speed = pace * .25; }
  }
  if (speed && !steer(c, heading, speed, dt, ground, b.fly)) {
    c.tx = c.x - Math.cos(c.yaw) * 20; c.tz = c.z - Math.sin(c.yaw) * 20; c.timer = 4;
    if (c.state === 'flee') c.yaw += Math.PI / 2;
  }
  c.y = ground(c.x, c.z) + (b.fly ? 1.8 + b.size + Math.sin(c.walk * .7) * .3 : 0);
}

// Apply a hit. Returns true if the creature died.
export function hurtCreature(c, damage, { poison = 0, slow = 0, root = 0 } = {}) {
  c.hp -= damage; c.hurt = 3;
  if (poison) { c.poison = Math.max(c.poison, 5); c.poisonDps = Math.max(c.poisonDps, poison); }
  if (slow) c.slow = Math.max(c.slow, slow);
  if (root) c.root = Math.max(c.root, root);
  if (CREATURE[c.kind].temper === 'provoked') { c.angry = true; c.state = 'chase'; }
  return c.hp <= 0;
}

export const ALLIES = {
  fox: { name: 'Ember', speed: 9, damage: 7, reach: 1.8, cooldown: 1.1, size: .45, color: '#d0602a' },
  beast: { name: 'Summoned Beast', speed: 8.5, damage: 16, reach: 2.4, cooldown: 1.2, size: 1.1, color: '#d6b46a' },
  guardian: { name: 'Stone Guardian', speed: 6, damage: 45, reach: 3.5, cooldown: 1.6, size: 2.4, color: '#8a8780' },
  witch: { name: 'Coven Sister', speed: 8, damage: 11, reach: 16, cooldown: 2.2, ranged: true },
  titan: { name: 'The Wyrd Titan', speed: 7, damage: 150, reach: 6, cooldown: 1.5, size: 4.5, color: '#1f3a36' },
};

export function makeAlly(kind, x, z, life = Infinity) {
  return { id: nextId++, ally: kind, x, z, y: 0, yaw: 0, life, cooldown: 0, walk: 0, target: null };
}

// Allies guard the player: attack whatever hunts or was hit near them, else follow at heel.
export function updateAlly(a, player, foes, ground, dt, strike, slot = 0) {
  const s = ALLIES[a.ally];
  a.life -= dt; a.cooldown -= dt;
  let target = foes.find(f => f.id === a.target && f.hp > 0 && Math.hypot(f.x - player.x, f.z - player.z) < 40);
  if (!target) {
    target = foes.filter(f => f.hp > 0 && (f.state === 'chase' || f.hurt > 0) && Math.hypot(f.x - player.x, f.z - player.z) < 30)
      .sort((f, g) => Math.hypot(f.x - a.x, f.z - a.z) - Math.hypot(g.x - a.x, g.z - a.z))[0];
    a.target = target?.id ?? null;
  }
  const side = (slot % 2 ? 1 : -1) * (1.6 + Math.floor(slot / 2)), back = 2 + slot * .4;
  const gx = target ? target.x : player.x - Math.cos(player.yaw) * back - Math.sin(player.yaw) * side;
  const gz = target ? target.z : player.z - Math.sin(player.yaw) * back + Math.cos(player.yaw) * side;
  const dx = gx - a.x, dz = gz - a.z, d = Math.hypot(dx, dz);
  if (d > 60) { a.x = gx; a.z = gz; }
  else if (d > (target ? s.reach * .8 : .8)) {
    const run = target || d > 6 ? s.speed : s.speed * .55;
    a.yaw = Math.atan2(dz, dx);
    a.x += Math.cos(a.yaw) * Math.min(d, run * dt); a.z += Math.sin(a.yaw) * Math.min(d, run * dt); a.walk += run * dt;
  } else if (!target) a.yaw = player.yaw;
  if (target && d < s.reach + 1 && a.cooldown <= 0) { a.cooldown = s.cooldown; strike(target, s.damage); }
  a.y = ground(a.x, a.z);
}
