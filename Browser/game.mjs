import { createWorld, HALF, WORLD_SIZE, NODES, REGIONS, CROWN, HUMAN_VILLAGE } from './world.mjs';
import { WorldView } from './view.mjs';
import { CLASSES, SPELLS, ITEMS, RECIPES, BUILDINGS, SKILLS, VILLAGE_RADIUS, SELL, BUY, COVEN_SPELLS } from './data.mjs';
import { CREATURE, BESTIARY, BOSS, ELITE_RESPAWN } from './bestiary.mjs';
import * as R from './rules.mjs';
import { makeCreature, pickCreature, updateCreature, hurtCreature, makeAlly, updateAlly, ALLIES } from './creatures.mjs';
import { Net, defaultServer } from './net.mjs';

const SAVE_KEY = 'coven-save-v2', ONLINE_KEY = 'coven-online', DAY_LENGTH = 1200, NODE_RESPAWN = 600, EXPLORE = 64, MAX_CREATURES = 16, COVEN_REACH = 25;
const REGION_CLASS = { swamp: 'bog', darkforest: 'hex', meadow: 'bloom', forest: 'wild' };
const SPELL_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];
const ALARM = 180, HUMAN_SPAWN = 300, HUMAN_DESPAWN = 450;
const $ = s => document.querySelector(s), canvas = $('#world');
const world = createWorld(1337);

let view;
try { view = new WorldView(canvas, world); }
catch (error) {
  $('#description').textContent = '3D graphics could not start. Enable hardware acceleration and use a browser with WebGL 2 support.';
  $('#play').disabled = true;
  throw error;
}

function freshState(classId) {
  const p = R.newPlayer(classId, world.spawnPoint(CLASSES[classId].region));
  p.yaw = Math.atan2(world.hearthOf(CLASSES[classId].region).z - p.z, world.hearthOf(CLASSES[classId].region).x - p.x);
  return { version: 2, player: p, clock: 0, dayTime: .3, day: 1, harvested: {}, nodeHp: {}, buildings: [], discovered: [], attuned: [], looted: [], blessedDay: {}, explored: [], elites: {}, bossHp: BOSS.hp, bossDefeated: false };
}
function loadState() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s?.version === 2 && CLASSES[s.player?.class] ? s : null; } catch { return null; }
}
function saveState() { if (state) try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* storage unavailable: progress lasts this session only */ } }

const net = new Net();
let remotes = new Map(), villages = new Map(), serverBoss = null, netTimer = 0;
let state = null, explored, creatures = [], allies = [], projectiles = [], boss = null, keys = new Set(), mode = 'menu';
let yaw = 0, pitch = .3, swing = 0, swingCooldown = 0, last = 0, accumulator = 0, saveTimer = 0, spawnTimer = 0, moving = false, hurtFlash = 0, mapBase = null, tab = 'items', nextId = 1;

function begin(s) {
  state = s;
  const p = state.player;
  explored = new Uint8Array(EXPLORE * EXPLORE);
  for (const i of state.explored) explored[i] = 1;
  for (const id of [...view.hidden]) view.showNode(id);
  for (const id of Object.keys(state.harvested)) view.hideNode(id);
  creatures = []; projectiles = []; boss = null;
  allies = p.coven.map(cls => Object.assign(makeAlly('witch', p.x + 2, p.z + 2), { cls }));
  if (p.class === 'wild') allies.push(makeAlly('fox', p.x - 1, p.z));
  view.ensurePlayer(p.class, CLASSES[p.class].familiar.species);
  p.y = Math.max(world.ground(p.x, p.z), -1.1);
  yaw = p.yaw;
  view.stream(p.x, p.z, 30);
}

// ---------- messages ----------
function toast(text, big = false) {
  const el = document.createElement('div');
  el.textContent = text; if (big) el.className = 'big';
  $('#toast').prepend(el);
  while ($('#toast').children.length > 5) $('#toast').lastChild.remove();
  setTimeout(() => el.remove(), 4500);
}
function reward(amount) {
  const p = state.player, levels = R.gainXp(p, amount);
  if (levels) toast(`Level ${p.level}. Your power grows.`, true);
}
function trained(skill, level) { if (level) toast(`${SKILLS[skill].name} rises to ${level}.`); }
function quests() {
  const q = R.checkQuest(state.player);
  if (q) { toast(`Quest complete: ${q.title}`, true); if (R.QUESTS[state.player.quest]) toast(`New task: ${R.QUESTS[state.player.quest].title}`); }
}

// ---------- world queries ----------
const isNight = () => state.dayTime < .23 || state.dayTime > .77;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const near = (a, b, r) => dist(a, b) < r;
const facing = (p, x, z) => { const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 1; return (dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw)) / d; };
const builtNear = (type, r) => state.buildings.find(b => b.type === type && near(b, state.player, r));
const heart = () => state.buildings.find(b => b.type === 'heart');
const hearthFires = () => world.pois.filter(p => p.type === 'hearth');
const nearFire = r => !!builtNear('campfire', r) || hearthFires().some(h => near(h, state.player, r));
const stations = () => new Set(['cauldron', 'altar'].filter(t => builtNear(t, 8)));
const sisters = () => allies.filter(a => a.ally === 'witch');
const covenMates = () => { const c = online.coven.toLowerCase(); return c ? [...remotes.values()].filter(r => r.coven.toLowerCase() === c) : []; };
const covenNearby = () => Math.min(4, 1 + sisters().filter(s => near(s, state.player, COVEN_REACH)).length + covenMates().filter(r => r.hp > 0 && near(r, state.player, COVEN_REACH)).length);
const allBuildings = () => [...state.buildings, ...[...villages.values()].flatMap(v => v.list)];
const elders = () => world.pois.filter(p => p.type === 'hearth').map(h => ({ id: `elder-${h.region}`, cls: REGION_CLASS[h.region], x: h.x + 3, z: h.z + 3, y: h.y, yaw: Math.PI / 4, hearth: h }))
  .filter(e => !state.player.coven.includes(e.cls));
const wards = () => state.buildings.filter(b => b.type === 'totem');

// ---------- human villages ----------
const humanVillages = world.pois.filter(o => o.type === 'village');
const villageState = new Map(humanVillages.map(v => [v.id, { alarm: 0, spawned: false }]));
const glamoured = () => !!state.player.effects.glamour;
const villageAt = (o, extra = 0) => humanVillages.find(v => near(v, o, HUMAN_VILLAGE.radius + extra));
const merchantNear = () => creatures.find(c => c.kind === 'merchant' && c.hp > 0 && near(c, state.player, 5));
const canTrade = () => glamoured() && merchantNear() && !(villageState.get(merchantNear().village).alarm > 0);

function raiseAlarm(v, why) {
  const vs = villageState.get(v.id), was = vs.alarm > 0;
  vs.alarm = ALARM;
  if (glamoured()) { delete state.player.effects.glamour; toast('Your glamour shatters!'); }
  if (!was) toast(`${why} The witch hunters of ${v.name} are coming!`, true);
}

function spawnVillagers(v) {
  const add = (kind, x, z, roam) => creatures.push(makeCreature(kind, x, z, { village: v.id, homeX: x, homeZ: z, roam, calm: true }));
  const L = v.layout;
  add('merchant', L.stall.x, L.stall.z, 0);
  for (const g of L.gates) { const ix = v.x + Math.cos(g.angle) * (HUMAN_VILLAGE.radius - 4), iz = v.z + Math.sin(g.angle) * (HUMAN_VILLAGE.radius - 4); add('hunter', ix, iz, 3); }
  for (let i = 0; i < 2; i++) add('hunter', v.x + (i ? 10 : -10), v.z + 6, 25);
  for (let i = 0; i < 5; i++) { const a = i * 1.3; add('villager', v.x + Math.cos(a) * 15, v.z + Math.sin(a) * 15, 25); }
}

function updateVillages(dt) {
  const p = state.player;
  for (const v of humanVillages) {
    const vs = villageState.get(v.id), d = dist(v, p);
    vs.alarm = Math.max(0, vs.alarm - dt);
    if (d < HUMAN_SPAWN && !vs.spawned) { vs.spawned = true; spawnVillagers(v); }
    if (d > HUMAN_DESPAWN && vs.spawned) { vs.spawned = false; creatures = creatures.filter(c => c.village !== v.id); }
    if (!vs.spawned) continue;
    if (d < HUMAN_VILLAGE.radius + 3 && p.hp > 0 && !glamoured() && vs.alarm <= 0) raiseAlarm(v, `A witch walks in ${v.name}!`);
    const alarm = vs.alarm > 0;
    for (const c of creatures) {
      if (c.village !== v.id) continue;
      c.calm = !alarm;
      if (c.kind === 'hunter') { c.angry = alarm && d < 160; if (c.angry) c.state = 'chase'; }
    }
  }
  if (p.wasGlamoured && !glamoured()) { const v = villageAt(p, 10); if (v) raiseAlarm(v, 'Your glamour fades!'); else toast('Your glamour fades.'); }
  p.wasGlamoured = glamoured();
}

// The palisade has two gates; houses are solid.
function villageWalls(x, z, px, pz) {
  for (const v of humanVillages) {
    if (Math.abs(v.x - x) > 50 || Math.abs(v.z - z) > 50) continue;
    const R = HUMAN_VILLAGE.radius, dx = x - v.x, dz = z - v.z, d = Math.hypot(dx, dz) || 1;
    if (Math.abs(d - R) < 1.1) {
      const a = Math.atan2(dz, dx), gap = Math.min(...v.layout.gates.map(g => Math.abs(((a - g.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI)));
      if (gap > HUMAN_VILLAGE.gate * .75) { const r = Math.hypot(px - v.x, pz - v.z) < R ? R - 1.1 : R + 1.1; x = v.x + dx / d * r; z = v.z + dz / d * r; }
    }
    for (const h of v.layout.houses) {
      const r = Math.max(h.w, h.d) / 2 + .5, hx = x - h.x, hz = z - h.z, hd = Math.hypot(hx, hz);
      if (hd < r && hd > 0) { x = h.x + hx / hd * r; z = h.z + hz / hd * r; }
    }
  }
  return [x, z];
}

// ---------- interaction ----------
function interaction() {
  const p = state.player;
  const merchant = merchantNear();
  if (merchant) return canTrade()
    ? { label: 'Trade with the merchant', act: () => openPanel('pack', 'trade') }
    : { label: villageState.get(merchant.village).alarm > 0 ? 'The merchant cowers. The village is on guard.' : 'The merchant would see a witch. Cast Glamour [8] first.', act: () => {} };
  const elder = elders().find(e => near(e, p, 5));
  if (elder) {
    const k = CLASSES[elder.cls];
    if (elder.cls === p.class) return { label: `Speak with ${k.elder}`, act: () => {
      if (!p.stats.talked) { p.stats.talked = 1; toast(`${k.elder}: "The coven broke when the Unwitch rose at the Crown. Grow strong, find your sisters in the other lands, and together end her."`); reward(20); quests(); }
      else toast(`${k.elder}: "${R.QUESTS[p.quest]?.text ?? 'You have done all I asked, sister.'}"`);
    } };
    const blocker = R.recruitBlocker(p, elder.cls);
    return blocker
      ? { label: `${k.elder} (${k.name}): ${blocker}`, act: () => toast(`${k.elder}: "${blocker}, and I will join your coven."`) }
      : { label: `Ask ${k.elder} to join your coven`, act: () => {
        R.recruit(p, elder.cls);
        allies.push(Object.assign(makeAlly('witch', elder.x, elder.z), { cls: elder.cls }));
        toast(`${k.elder} the ${k.name} joins your coven!`, true); quests();
      } };
  }
  const poi = world.pois.find(o => near(o, p, o.type === 'hearth' ? 0 : 14));
  if (poi?.type === 'circle') return state.attuned.includes(poi.id)
    ? { label: `Rest at the ${poi.name} circle`, act: () => { p.home = { x: poi.x + 3, z: poi.z + 3, name: poi.name }; p.hp = p.maxHp; p.mana = p.maxMana; saveState(); toast('You rest within the stones. Progress saved.'); } }
    : { label: `Attune to the ${poi.name} circle`, act: () => { state.attuned.push(poi.id); p.stats.attuned++; p.home = { x: poi.x + 3, z: poi.z + 3, name: poi.name }; reward(80); toast(`The ${poi.name} circle remembers you. You will return here if you fall.`, true); } };
  if (poi?.type === 'ruin' && !state.looted.includes(poi.id)) return { label: `Search the ruins of ${poi.name}`, act: () => {
    state.looted.push(poi.id);
    const loot = { stone: 6, hide: 2, bandage: 2, feather: 3, ectoplasm: 1 };
    for (const [id, n] of Object.entries(loot)) R.addItem(p, id, n);
    reward(40); toast('An old witch\'s cache: stone, hide, bandages, feathers and ectoplasm.');
  } };
  if (poi?.type === 'shrine') return state.blessedDay[poi.id] === state.day
    ? { label: 'The shrine is quiet until tomorrow', act: () => {} }
    : { label: `Pray at the ${poi.name} shrine`, act: () => { state.blessedDay[poi.id] = state.day; Object.assign(p, { hp: p.maxHp, mana: p.maxMana, stamina: p.maxStamina, poison: 0 }); p.food = Math.max(p.food, 80); p.water = Math.max(p.water, 80); reward(30); toast('A green light washes over you. Fully restored.'); } };
  const hut = builtNear('hut', 5);
  if (hut) return { label: 'Rest in your hut', act: () => { Object.assign(p, { hp: p.maxHp, mana: p.maxMana, stamina: p.maxStamina }); p.home = { x: hut.x + 4, z: hut.z, name: 'your hut' }; saveState(); toast('You rest. You will wake here if you fall. Progress saved.'); } };
  const garden = builtNear('garden', 4);
  if (garden?.stock) return { label: `Harvest the garden (${garden.stock})`, act: () => {
    const herbs = Object.keys(ITEMS).filter(id => ITEMS[id].herb === CLASSES[p.class].region);
    for (let i = 0; i < garden.stock; i++) R.addItem(p, herbs[Math.floor(Math.random() * herbs.length)]);
    toast(`Harvested ${garden.stock} herbs.`); trained('herbalism', R.train(p, 'herbalism', 4 * garden.stock)); garden.stock = 0;
  } };
  if (nearFire(3) && R.count(p, 'rawMeat')) return { label: `Cook ${R.count(p, 'rawMeat')} raw meat`, act: () => { const n = R.count(p, 'rawMeat'); R.removeItem(p, 'rawMeat', n); R.addItem(p, 'cookedMeat', n); reward(n * 3); toast(`Cooked ${n} meat.`); } };
  const ahead = world.ground(p.x + Math.cos(p.yaw) * 1.5, p.z + Math.sin(p.yaw) * 1.5);
  if ((builtNear('well', 3) || ahead < .2 || world.ground(p.x, p.z) < .2) && p.water < 100) return { label: 'Drink', act: () => R.drink(p) };
  return null;
}

// A spell ring, shown here and to other players.
function ring(x, y, z, r, color) { view.ring(x, y, z, r, color); net.send({ type: 'fx', x, y, z, r, color }); }

// ---------- combat ----------
function hostiles() { return boss ? [...creatures, boss] : creatures; }

// Best target near the centre of view, within `range` metres.
function pickTarget(range) {
  const p = state.player, fx = Math.cos(yaw), fz = Math.sin(yaw);
  let best = null, score = Infinity;
  for (const c of hostiles()) {
    if (c.hp <= 0) continue;
    const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz);
    if (d > range) continue;
    const angle = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / (d || 1))));
    if (angle > .6 && d > 6) continue;
    const s = angle * 20 + d;
    if (s < score) { score = s; best = c; }
  }
  return best;
}

function damage(target, amount, opts = {}, fromPlayer = true) {
  const p = state.player;
  if (target === boss) {
    if (net.online) { net.send({ type: 'bossHit', amount }); boss.hp -= amount * (boss.warded ? .1 : 1); boss.hurt = 3; return; }
    boss.hp -= amount * (boss.warded ? .1 : 1); boss.hurt = 3;
    state.bossHp = boss.hp;
    if (boss.hp <= 0) {
      boss = null; state.bossDefeated = true; p.stats.boss = 1;
      toast('The Unwitch is unmade. The coven is whole again.', true); reward(BOSS.xp); quests(); saveState();
    }
    return;
  }
  const b = CREATURE[target.kind];
  if (b.human && target.village !== undefined) { const v = humanVillages.find(o => o.id === target.village); if (v) raiseAlarm(v, `You attacked the people of ${v.name}.`); }
  if (fromPlayer && R.poisonsOnHit(p)) opts = { ...opts, poison: Math.max(opts.poison ?? 0, 4) };
  if (hurtCreature(target, amount * (fromPlayer ? 1 + (R.skillLevel(p, 'hunting') - 1) * .02 : 1), opts)) slain(target, b);
}

function slain(c, b) {
  const p = state.player;
  c.hp = 0; c.dead = true;
  const loot = R.lootFor(p, b.loot);
  p.stats.kills++;
  if (b.elite) { p.stats.eliteKills++; state.elites[b.region] = state.clock + ELITE_RESPAWN; toast(`${b.name} has fallen!`, true); }
  toast(`${b.name} slain. ${Object.entries(loot).map(([id, n]) => `+${n} ${ITEMS[id].name}`).join(', ')}`);
  trained('hunting', R.train(p, 'hunting', b.level * 4 + (b.elite ? 80 : 0)));
  if (b.human) toast(R.captureSoul(p) ? 'A soul is drawn into your Soul Jar.' : 'A soul slips away. Carry an empty Soul Jar to capture it.');
  reward(b.xp); quests();
}

function strike() {
  const p = state.player;
  if (swingCooldown > 0 || p.hp <= 0) return;
  swing = 1; swingCooldown = .55; p.yaw = yaw;
  p.stamina = Math.max(0, p.stamina - 5);
  const w = R.weapon(p), tired = p.stamina < 5 ? .5 : 1;
  const target = hostiles().filter(c => c.hp > 0 && near(c, p, w.reach + 1 + (c === boss ? BOSS.size : CREATURE[c.kind].size * .6)) && facing(p, c.x, c.z) > .4).sort((a, b) => dist(a, p) - dist(b, p))[0];
  if (target) { damage(target, w.damage * tired); return; }
  const node = view.nodesNear(p.x, p.z, 5).map(n => ({ n, d: dist(n, p) })).filter(({ n, d }) => d < 2.1 + Math.max(.6, NODES[n.type].radius) * n.s && facing(p, n.x, n.z) > .2).sort((a, b) => a.d - b.d)[0]?.n;
  if (!node) return;
  const before = { ...p.skills }, got = R.gatherYield(p, node.type);
  if (!Object.keys(got).length) { toast('You need a Stone Pick to mine moonstone.'); return; }
  for (const s of Object.keys(SKILLS)) if (R.skillLevel({ skills: before }, s) < R.skillLevel(p, s)) trained(s, R.skillLevel(p, s));
  toast(Object.entries(got).map(([id, n]) => `+${n} ${ITEMS[id].name}`).join('  '));
  const hp = (state.nodeHp[node.id] ?? NODES[node.type].hp) - 1;
  if (hp <= 0) { delete state.nodeHp[node.id]; state.harvested[node.id] = state.clock + NODE_RESPAWN; view.hideNode(node.id); net.send({ type: 'harvest', node: node.id, seconds: NODE_RESPAWN }); }
  else state.nodeHp[node.id] = hp;
  reward(2); quests();
}

function bolt(from, target, amount, color, opts = {}, fromPlayer = true) {
  projectiles.push({ id: nextId++, x: from.x, y: from.y + 1.6, z: from.z, target, amount, color, opts, fromPlayer });
}

function cast(index) {
  const p = state.player, id = R.knownSpells(p)[index];
  if (!id || p.hp <= 0) return;
  const s = SPELLS[id], blocker = R.castBlocker(p, id, covenNearby());
  if (blocker) { toast(`${s.name}: ${blocker}`); return; }
  if (s.kind === 'glamour') {
    const v = humanVillages.find(o => near(o, p, 150) && villageState.get(o.id).alarm > 0);
    if (v) { toast(`Glamour: ${v.name} is on guard. Wait for the alarm to die down.`); return; }
  } else if (glamoured()) {
    delete p.effects.glamour; p.wasGlamoured = false;
    const v = villageAt(p, 15);
    if (v) raiseAlarm(v, 'Witchcraft in plain sight!'); else toast('Casting breaks your glamour.');
  }
  const power = R.spellPower(p, isNight());
  let target = null;
  if (s.kind === 'bolt' || s.kind === 'aoe') {
    target = pickTarget(36);
    if (!target) { toast(`${s.name}: no target in sight`); return; }
  }
  trained('spellcraft', R.payCast(p, id));
  swing = 1; p.yaw = yaw;
  const area = (x, z, radius, fn) => hostiles().filter(c => c.hp > 0 && Math.hypot(c.x - x, c.z - z) < radius).forEach(fn);
  if (s.kind === 'bolt') bolt(p, target, s.damage * power, s.color, { poison: s.poison, slow: s.slow, lifesteal: s.lifesteal });
  if (s.kind === 'aoe') {
    ring(target.x, target.y, target.z, s.radius, s.color);
    area(target.x, target.z, s.radius, c => damage(c, s.damage * power, { poison: s.poison }));
    if (s.healCoven) p.hp = Math.min(p.maxHp, p.hp + s.healCoven);
  }
  if (s.kind === 'self') {
    if (s.regen) { p.effects.regen = s.duration; p.effects.regenRate = s.regen; }
    if (s.shield) p.effects.barkskin = s.duration;
    ring(p.x, p.y, p.z, 3, s.color);
  }
  if (s.kind === 'nova' || s.kind === 'rite') {
    ring(p.x, p.y, p.z, s.radius, s.color);
    if (s.breakWard && boss && near(boss, p, s.radius + 10)) { boss.warded = false; boss.wardTimer = s.breakWard; net.send({ type: 'ward', seconds: s.breakWard }); toast('The ward shatters! Strike now!', true); }
    area(p.x, p.z, s.radius, c => damage(c, s.damage * power, { root: s.root }));
    if (s.kind === 'rite') toast('Four voices rise as one: THE GRAND RITE!', true);
  }
  if (s.kind === 'summon') {
    const a = makeAlly(s.summon, p.x + Math.cos(yaw) * 3, p.z + Math.sin(yaw) * 3, s.duration);
    allies.push(a); ring(a.x, p.y, a.z, s.summon === 'titan' ? 12 : 3, s.color);
    if (s.summon === 'titan') { p.stats.titans++; toast('Three souls burn. The earth splits, and the Wyrd Titan rises!', true); }
    else toast(`${ALLIES[s.summon].name} answers the coven's call.`);
  }
  if (s.kind === 'glamour') { p.effects.glamour = s.duration; p.wasGlamoured = true; ring(p.x, p.y, p.z, 2, s.color); toast('You wear a borrowed human face. Spells or violence will break it.'); if (allies.some(a => a.ally === 'witch' || a.ally === 'fox')) toast('Your companions will wait here until the glamour ends.'); }
  if (s.coven > 1) quests();
}

// ---------- building ----------
function placeBuilding(type) {
  const p = state.player, x = p.x + Math.cos(p.yaw) * 5, z = p.z + Math.sin(p.yaw) * 5, y = world.ground(x, z), h = heart();
  const blocker = R.buildBlocker(p, type, { hasHeart: !!h, nearHeart: !!h && Math.hypot(h.x - x, h.z - z) < VILLAGE_RADIUS });
  if (blocker) { toast(`${BUILDINGS[type].name}: ${blocker}`); return false; }
  if (y < .3) { toast('The ground here is too wet to build on.'); return false; }
  const before = R.skillLevel(p, 'building');
  R.build(p, type);
  if (R.skillLevel(p, 'building') > before) trained('building', R.skillLevel(p, 'building'));
  state.buildings.push({ id: `b${Date.now()}${Math.random()}`, type, x, y, z, rot: -p.yaw + Math.PI / 2, stock: 0, grow: 0 });
  if (type === 'heart') { p.home = { x: x + 3, z, name: 'your village' }; toast('Your village is founded. Build within 60 m of the Heart.', true); }
  else toast(`Built: ${BUILDINGS[type].name}.`);
  quests(); saveState(); sendVillage();
  return true;
}

// Push (x, z) out of solid nodes and buildings.
function collide(x, z) {
  for (const n of view.nodesNear(x, z, 3)) {
    const r0 = NODES[n.type].radius;
    if (!r0) continue;
    const r = r0 * n.s + .35, dx = x - n.x, dz = z - n.z, d = Math.hypot(dx, dz);
    if (d < r && d > 0) { x = n.x + dx / d * r; z = n.z + dz / d * r; }
  }
  for (const b of allBuildings()) {
    const def = BUILDINGS[b.type];
    if (Math.abs(b.x - x) > 6 || Math.abs(b.z - z) > 6 || ['campfire', 'garden', 'lantern'].includes(b.type)) continue;
    let px = b.x, pz = b.z;
    if (def.wall) { const ux = Math.cos(b.rot), uz = -Math.sin(b.rot), t = Math.max(-2, Math.min(2, (x - b.x) * ux + (z - b.z) * uz)); px = b.x + ux * t; pz = b.z + uz * t; }
    const r = (def.wall ? .3 : def.size) + .4, dx = x - px, dz = z - pz, d = Math.hypot(dx, dz);
    if (d < r && d > 0) { x = px + dx / d * r; z = pz + dz / d * r; }
  }
  return [x, z];
}

// ---------- simulation ----------
function updatePlayer(dt) {
  const p = state.player;
  const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  yaw += ((keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)) * dt * 1.8;
  let mx = Math.cos(yaw) * f - Math.sin(yaw) * s, mz = Math.sin(yaw) * f + Math.cos(yaw) * s;
  const len = Math.hypot(mx, mz), swimming = world.ground(p.x, p.z) < -1.3;
  moving = len > 0 && p.hp > 0;
  p.sprinting = moving && (keys.has('ShiftLeft') || keys.has('ShiftRight')) && p.stamina > 1 && !swimming;
  if (moving) {
    mx /= len; mz /= len;
    if (swing <= 0) p.yaw += Math.max(-dt * 12, Math.min(dt * 12, ((Math.atan2(mz, mx) - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
    const speed = (swimming ? 3 : p.sprinting ? 9 : 5) * R.moveSpeedFactor(p);
    const [cx, cz] = collide(Math.max(-HALF + 20, Math.min(HALF - 20, p.x + mx * speed * dt)), Math.max(-HALF + 20, Math.min(HALF - 20, p.z + mz * speed * dt)));
    const [nx, nz] = villageWalls(cx, cz, p.x, p.z);
    p.x = nx; p.z = nz;
  }
  const g = world.ground(p.x, p.z);
  if (g < -1.3) { p.y += (-1.1 - p.y) * Math.min(1, dt * 6); p.vy = 0; p.grounded = false; }
  else {
    p.vy -= 22 * dt; p.y += p.vy * dt;
    if (p.y <= g) { p.y = g; p.vy = 0; p.grounded = true; } else if (p.y > g + .3) p.grounded = false;
  }
  if (keys.has('Space') && p.grounded && p.stamina > 8 && p.hp > 0) { p.vy = 7.5; p.grounded = false; p.stamina -= 8; }

  const surface = world.surface(p.x, p.z), cold = (surface === 'snow' || surface === 'peaks' && isNight()) && !nearFire(10);
  if (cold && !p.cold && !R.warm(p)) toast('The cold bites. Find a fire or craft a Hide Cloak.');
  p.cold = cold;
  if (R.tickSurvival(p, dt, { sprinting: p.sprinting, swimming: g < -1.3, cold })) {
    toast('You have fallen.', true); toast(`You wake at ${p.home.name}.`);
    R.respawn(p); p.y = world.ground(p.x, p.z);
    creatures = creatures.filter(c => !near(c, p, 80));
    for (const a of allies) { a.x = p.x + 2; a.z = p.z + 2; a.target = null; }
  }
}

function bite(dmg, c) {
  const p = state.player, b = CREATURE[c.kind];
  R.damagePlayer(p, dmg, { poison: b.poison });
  hurtFlash = .3;
}

function updateCreatures(dt) {
  const p = state.player, night = isNight(), w = wards();
  for (const c of creatures) {
    updateCreature(c, p, world.ground, dt, night, bite, w);
    if (c.hp <= 0 && !c.dead) { c.dead = true; slain(c, CREATURE[c.kind]); }
  }
  creatures = creatures.filter(c => c.hp > 0);
  allies = allies.filter(a => a.life > 0);
  const hiding = glamoured();
  allies.forEach((a, i) => (hiding && (a.ally === 'witch' || a.ally === 'fox') && near(a, p, 200)) || updateAlly(a, p, hostiles(), world.ground, dt, (target, dmg) => {
    if (ALLIES[a.ally].ranged) bolt(a, target, dmg * (1 + p.level * .05), SPELLS[CLASSES[a.cls].spells[0]].color, {}, false);
    else damage(target, dmg * (1 + p.level * .05), {}, false);
  }, i));

  spawnTimer -= dt;
  if (spawnTimer > 0) return;
  spawnTimer = 1;
  creatures = creatures.filter(c => c.village !== undefined || near(c, p, CREATURE[c.kind].elite ? 500 : 360));
  for (const lair of world.pois.filter(o => o.type === 'lair' && near(o, p, 220))) {
    const elite = BESTIARY.find(b => b.elite && b.region === lair.region);
    if ((state.elites[lair.region] ?? 0) <= state.clock && !creatures.some(c => c.kind === elite.id)) {
      creatures.push(makeCreature(elite.id, lair.x, lair.z, { homeX: lair.x, homeZ: lair.z }));
      toast(`You sense ${elite.name} nearby…`);
    }
  }
  if (creatures.filter(c => c.village === undefined).length >= MAX_CREATURES) return;
  const a = Math.random() * Math.PI * 2, r = 90 + Math.random() * 140, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
  if (Math.abs(x) > HALF - 50 || Math.abs(z) > HALF - 50 || world.ground(x, z) < 1 || w.some(t => Math.hypot(t.x - x, t.z - z) < 40)) return;
  if (world.pois.some(o => (o.type === 'hearth' || o.type === 'village') && Math.hypot(o.x - x, o.z - z) < 80)) return;
  const kind = pickCreature(world.region(x, z), world.danger(x, z), night);
  if (kind) creatures.push(makeCreature(kind, x, z));
}

function updateBoss(dt) {
  const p = state.player, dCrown = Math.hypot(p.x - CROWN.x, p.z - CROWN.z);
  if (net.online ? serverBoss?.down : state.bossDefeated) { boss = null; return; }
  if (!boss && dCrown < 160) {
    boss = { id: 'boss', x: CROWN.x, z: CROWN.z, y: world.ground(0, 0), yaw: 0, hp: net.online ? serverBoss.hp : state.bossHp, maxHp: BOSS.hp, warded: true, wardTimer: 0, slam: 3, cast: 2, summon: 12, walk: 0, hurt: 0 };
    toast('The Unwitch awakens at the Crown. Only the Grand Rite of a full coven can break her ward.', true);
  }
  if (!boss) return;
  if (dCrown > 400) { boss = null; if (!net.online) state.bossHp = BOSS.hp; return; }
  boss.hurt = Math.max(0, boss.hurt - dt);
  if (!boss.warded && !net.online) { boss.wardTimer -= dt; if (boss.wardTimer <= 0) { boss.warded = true; toast('The Unwitch\'s ward knits itself back together.'); } }
  const d = dist(boss, p);
  boss.yaw = Math.atan2(p.z - boss.z, p.x - boss.x);
  if (d > 6 && dCrown < 90 && p.hp > 0) { const nx = boss.x + Math.cos(boss.yaw) * 4 * dt, nz = boss.z + Math.sin(boss.yaw) * 4 * dt; if (Math.hypot(nx, nz) < 80) { boss.x = nx; boss.z = nz; boss.walk += 4 * dt; } }
  boss.y = world.ground(boss.x, boss.z);
  boss.slam -= dt; boss.cast -= dt; boss.summon -= dt;
  if (boss.slam <= 0 && d < 8) { boss.slam = 3.5; view.ring(boss.x, boss.y, boss.z, 8, '#ff3c6e'); R.damagePlayer(p, BOSS.damage); hurtFlash = .4; }
  if (boss.cast <= 0 && d < 45 && p.hp > 0) { boss.cast = 3; projectiles.push({ id: nextId++, x: boss.x, y: boss.y + 6, z: boss.z, target: 'player', amount: 18, color: '#ff3c6e', opts: {}, fromPlayer: false }); }
  if (boss.summon <= 0) {
    boss.summon = 22;
    const pool = BESTIARY.filter(b => !b.elite && b.level >= 6 && !b.fly);
    for (let i = 0; i < 2; i++) { const b = pool[Math.floor(Math.random() * pool.length)], a = Math.random() * 6.28; creatures.push(Object.assign(makeCreature(b.id, boss.x + Math.cos(a) * 10, boss.z + Math.sin(a) * 10), { state: 'chase', angry: true })); }
    toast('The Unwitch calls her thralls!');
  }
}

function updateProjectiles(dt) {
  const p = state.player;
  projectiles = projectiles.filter(pr => {
    const t = pr.target === 'player' ? p : pr.target;
    if (!t || t.hp <= 0 || (t !== p && t !== boss && !creatures.includes(t))) return false;
    const ty = t.y + (t === boss ? BOSS.size * 1.5 : 1), dx = t.x - pr.x, dy = ty - pr.y, dz = t.z - pr.z, d = Math.hypot(dx, dy, dz), step = 32 * dt;
    if (d > step) { pr.x += dx / d * step; pr.y += dy / d * step; pr.z += dz / d * step; return true; }
    if (t === p) { R.damagePlayer(p, pr.amount); hurtFlash = .3; }
    else {
      damage(t, pr.amount, pr.opts, pr.fromPlayer);
      if (pr.opts.lifesteal) p.hp = Math.min(p.maxHp, p.hp + pr.amount * pr.opts.lifesteal);
    }
    return false;
  });
}

function updateWorld(dt) {
  const p = state.player;
  state.clock += dt;
  state.dayTime += dt / DAY_LENGTH;
  if (state.dayTime >= 1) { state.dayTime -= 1; state.day++; toast(`Day ${state.day} dawns.`); }
  for (const b of state.buildings) if (b.type === 'garden' && b.stock < 3) { b.grow += dt; if (b.grow >= 120) { b.grow = 0; b.stock++; } }
  if (Math.floor(state.clock) !== Math.floor(state.clock - dt)) {
    for (const [id, t] of Object.entries(state.harvested)) if (state.clock >= t) { delete state.harvested[id]; view.showNode(id); }
    const ex = Math.floor((p.x + HALF) / WORLD_SIZE * EXPLORE), ez = Math.floor((p.z + HALF) / WORLD_SIZE * EXPLORE), reach = p.class === 'hex' ? 3 : 2;
    for (let j = -reach; j <= reach; j++) for (let i = -reach; i <= reach; i++) {
      const x = ex + i, z = ez + j;
      if (x >= 0 && z >= 0 && x < EXPLORE && z < EXPLORE && i * i + j * j <= reach * reach + 1 && !explored[z * EXPLORE + x]) { explored[z * EXPLORE + x] = 1; state.explored.push(z * EXPLORE + x); }
    }
    for (const poi of world.pois) if (!state.discovered.includes(poi.id) && near(poi, p, poi.type === 'village' ? 140 : 50)) {
      state.discovered.push(poi.id); p.stats.discovered++;
      toast(`Discovered: ${poi.name}`, true); if (poi.type === 'village') toast('A human village. Its people hunt witches: go in glamoured [8], or not at all.'); reward(75); quests();
    }
  }
  saveTimer += dt;
  if (saveTimer > 20) { saveTimer = 0; saveState(); }
}

function update(dt) {
  netTimer -= dt;
  if (netTimer <= 0 && net.online) {
    netTimer = .1;
    const p = state.player;
    net.send({ type: 'state', x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: p.hp, maxHp: p.maxHp, level: p.level, cls: p.class, moving, swing });
  }
  swing = Math.max(0, swing - dt / .45); swingCooldown -= dt; hurtFlash = Math.max(0, hurtFlash - dt);
  updatePlayer(dt); updateVillages(dt); updateCreatures(dt); updateBoss(dt); updateProjectiles(dt); updateWorld(dt);
}

// ---------- HUD ----------
const bar = (id, v, max) => { $(`#${id}`).style.width = `${Math.max(0, v / max * 100)}%`; $(`#${id}Text`).textContent = `${Math.ceil(Math.max(0, v))}`; };
let lastRegion = '';
function hud() {
  const p = state.player;
  bar('hp', p.hp, p.maxHp); bar('mp', p.mana, p.maxMana); bar('st', p.stamina, p.maxStamina); bar('food', p.food, 100); bar('water', p.water, 100);
  $('#level').textContent = p.level;
  $('#className').textContent = CLASSES[p.class].name.toUpperCase();
  $('#xp').style.width = `${p.xp / R.xpToNext(p.level) * 100}%`;
  const minutes = Math.floor(state.dayTime * 24 * 60), fx = Object.keys(p.effects).filter(e => e !== 'regenRate');
  $('#clock').textContent = `DAY ${state.day} · ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}${p.cold && !R.warm(p) ? ' · FREEZING' : ''}${p.poison > 0 ? ' · POISONED' : ''}${fx.length ? ' · ' + fx.join(' ').toUpperCase() : ''}`;
  const alarmed = humanVillages.find(v => near(v, p, 150) && villageState.get(v.id).alarm > 0);
  const region = `${world.placeName(p.x, p.z)} · danger ${world.danger(p.x, p.z)}${alarmed ? ' · ALARM RAISED' : ''}`;
  if (region !== lastRegion) { lastRegion = region; $('#region').textContent = region; }
  const q = R.QUESTS[p.quest];
  $('#questTitle').textContent = q ? q.title : 'The Coven is Whole';
  $('#questText').textContent = q ? q.text : 'You have done all the coven asked. The isle is yours.';
  $('#questBar').style.width = `${(q ? q.progress(p) : 1) * 100}%`;
  const act = mode === 'playing' && interaction();
  $('#prompt').innerHTML = act ? `<kbd>E</kbd>${act.label}` : '';
  canvas.style.filter = hurtFlash > 0 ? `sepia(1) saturate(3) hue-rotate(-40deg) brightness(${1 - hurtFlash * .6})` : '';
  const covenHere = covenNearby();
  $('#covenList').innerHTML = [p.class, ...p.coven].map((c, i) => `<span class="${i && !near(sisters()[i - 1] ?? p, p, COVEN_REACH) ? 'far' : ''}" style="--robe:${CLASSES[c].robe}" title="${CLASSES[c].name}">${CLASSES[c].name[0]}</span>`).join('') + `<small>COVEN ${covenHere}/4</small>`;
  $('#spells').innerHTML = R.knownSpells(p).map((id, i) => {
    const s = SPELLS[id], blocker = R.castBlocker(p, id, covenHere), cd = p.cooldowns[id];
    return `<div class="spell${blocker ? ' locked' : ''}" title="${s.name}${blocker ? ': ' + blocker : ''}" style="--c:${s.color}"><kbd>${i + 1}</kbd><b>${s.name}</b><small>${s.coven > 1 ? `${s.coven} witches` : `${s.mana} mana`}</small>${cd ? `<i style="height:${cd / s.cooldown * 100}%"></i>` : ''}</div>`;
  }).join('');
  const mates = covenMates();
  for (const r of mates) { const el = document.createElement('span'); el.textContent = r.name[0]?.toUpperCase() ?? '?'; el.title = r.name; el.style.setProperty('--robe', CLASSES[r.cls]?.robe ?? '#555'); el.className = `real${near(r, p, COVEN_REACH) ? '' : ' far'}`; $('#covenList').insertBefore(el, $('#covenList small')); }
  $('#netStatus').textContent = net.status === 'online' ? `ONLINE · ${net.world ?? online.world} · ${remotes.size} other${remotes.size === 1 ? '' : 's'}${online.coven ? ` · coven ‹${online.coven}›` : ''}` : net.status === 'offline' ? '' : net.status.toUpperCase() + '…';
  const bossShown = boss && near(boss, p, 120);
  $('#boss').classList.toggle('hidden', !bossShown);
  if (bossShown) { $('#bossHp').style.width = `${boss.hp / BOSS.hp * 100}%`; $('#bossWard').textContent = boss.warded ? 'WARDED: cast the Grand Rite [7]' : `WARD BROKEN · ${Math.ceil(boss.wardTimer)}s`; }
  compass();
}

function compass() {
  const strip = $('#compassStrip'), p = state.player, heading = Math.atan2(Math.cos(yaw), -Math.sin(yaw)), marks = [];
  const place = (bearing, html, cls) => {
    const rel = ((bearing - heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    if (Math.abs(rel) < Math.PI / 2) marks.push(`<span class="${cls}" style="left:${50 + rel / (Math.PI / 2) * 50}%">${html}</span>`);
  };
  [['N', 0], ['E', Math.PI / 2], ['S', Math.PI], ['W', -Math.PI / 2]].forEach(([l, b]) => place(b, l, 'cardinal'));
  for (const poi of world.pois) {
    const d = dist(poi, p), found = state.discovered.includes(poi.id), raven = p.class === 'hex';
    if (found && d < 4000 || d < 1500 || raven || poi.type === 'hearth' || poi.type === 'crown') place(Math.atan2(poi.x - p.x, -(poi.z - p.z)), poi.type === 'crown' ? '♛' : poi.type === 'hearth' ? '⌂' : poi.type === 'village' && found ? '♜' : found ? '◆' : '◇', `poi${found ? ' found' : ''}`);
  }
  const h = heart();
  if (h) place(Math.atan2(h.x - p.x, -(h.z - p.z)), '✦', 'home');
  strip.innerHTML = marks.join('');
}

// ---------- panels ----------
function needsText(p, needs) { return Object.entries(needs).map(([id, n]) => `<span class="${R.count(p, id) < n ? 'short' : ''}">${n} ${ITEMS[id].name}</span>`).join(' · '); }
function renderPack() {
  const p = state.player, st = stations();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  let html = '';
  if (tab === 'items') {
    const items = Object.entries(p.inv).sort(([a], [b]) => ITEMS[a].name.localeCompare(ITEMS[b].name));
    html = items.length ? `<ul>${items.map(([id, n]) => { const it = ITEMS[id], usable = it.food || it.heal || it.mana || it.effect; return `<li><span>${it.name} <small>× ${n}${it.herb ? ` · herb of ${REGIONS[it.herb].name}` : ''}</small></span>${usable ? `<button data-use="${id}">${it.food ? 'EAT' : 'USE'}</button>` : ''}</li>`; }).join('')}</ul>` : '<p class="hint">Nothing yet. Strike trees, rocks, bushes and herbs to gather.</p>';
  }
  if (tab === 'craft' || tab === 'alchemy') {
    const list = RECIPES.filter(r => tab === 'craft' ? !r.station : r.station);
    html = `<p class="hint">${tab === 'alchemy' ? `Brew beside a Cauldron or Ritual Altar in your village. Near you: ${[...st].join(', ') || 'none'}.` : 'Crafted by hand, anywhere.'}</p><ul>${list.map(r => `<li><span>${ITEMS[r.id].name}${r.makes ? ` ×${r.makes}` : ''}<br><small>${needsText(p, r.needs)}${r.station ? ` · at ${r.station}` : ''}</small></span><button data-craft="${r.id}" ${R.canCraft(p, r, st) ? '' : 'disabled'}>${r.station ? 'BREW' : 'CRAFT'}</button></li>`).join('')}</ul>`;
  }
  if (tab === 'build') {
    const h = heart();
    html = `<p class="hint">${h ? `Your village has ${state.buildings.filter(b => near(b, h, VILLAGE_RADIUS)).length} buildings. ${Math.round(dist(h, p))} m from its Heart.` : 'Start with a Village Heart. Everything but campfires must stand within 60 m of it.'} Buildings are placed 5 m ahead of you.</p><ul>${Object.entries(BUILDINGS).map(([id, b]) => { const blocker = R.buildBlocker(p, id, { hasHeart: !!h, nearHeart: !!h && dist(h, p) < VILLAGE_RADIUS - 5 }); return `<li><span>${b.name}<br><small>${needsText(p, b.needs)} · ${b.text}${blocker ? ` · <em>${blocker}</em>` : ''}</small></span><button data-build="${id}" ${blocker ? 'disabled' : ''}>BUILD</button></li>`; }).join('')}</ul>`;
  }
  if (tab === 'skills') {
    html = `<ul>${Object.entries(SKILLS).map(([id, s]) => { const lv = R.skillLevel(p, id), lo = 25 * (lv - 1) ** 2, hi = 25 * lv ** 2; return `<li><span>${s.name} <small>${s.text}</small><div class="meter"><div style="width:${lv >= R.SKILL_CAP ? 100 : (p.skills[id] - lo) / (hi - lo) * 100}%"></div></div></span><b class="lv">${lv}</b></li>`; }).join('')}</ul>`;
  }
  if (tab === 'trade') {
    const ok = canTrade(), silver = R.count(p, 'silver');
    html = ok
      ? `<p class="hint">The merchant sees only a traveller. You carry <b>${silver} silver</b>.</p><h4>Sell</h4><ul>${Object.keys(p.inv).filter(id => SELL[id]).map(id => `<li><span>${ITEMS[id].name} <small>× ${R.count(p, id)} · ${SELL[id]} silver each</small></span><button data-sell="${id}">SELL</button></li>`).join('') || '<li><small>Nothing the merchant wants.</small></li>'}</ul><h4>Buy</h4><ul>${Object.entries(BUY).map(([id, price]) => `<li><span>${ITEMS[id].name} <small>${price} silver</small></span><button data-buy="${id}" ${silver >= price ? '' : 'disabled'}>BUY</button></li>`).join('')}</ul>`
      : '<p class="hint">Trade happens at a human village market stall, while you wear a Glamour [8] and the village is calm.</p>';
  }
  if (tab === 'coven') {
    const k = CLASSES[p.class];
    html = `<h4>${k.name} of ${REGIONS[k.region].name}</h4><p class="hint">${k.blurb}</p><h4>Familiar: ${k.familiar.name}</h4><p class="hint">${k.familiar.bonus}<br>${k.familiar.ability}</p><h4>Your coven (${1 + p.coven.length}/4)</h4><ul>${Object.entries(CLASSES).filter(([id]) => id !== p.class).map(([id, c]) => `<li><span>${c.elder}, ${c.name}<br><small>${p.coven.includes(id) ? 'Sworn to your coven.' : `At ${world.hearthOf(c.region).name} in ${REGIONS[c.region].name}. ${R.recruitBlocker(p, id)}.`}</small></span></li>`).join('')}</ul><h4>Coven rites</h4><ul>${COVEN_SPELLS.map(id => { const s = SPELLS[id]; return `<li><span>${s.name}<br><small>${s.coven} witches · Spellcraft ${s.skill} · ${needsText(p, s.reagent)}</small></span></li>`; }).join('')}</ul>`;
  }
  $('#tabBody').innerHTML = html;
}
$('#tabs').addEventListener('click', e => { if (e.target.dataset.tab) { tab = e.target.dataset.tab; renderPack(); } });
$('#tabBody').addEventListener('click', e => {
  const p = state.player, { use, craft, build, sell, buy } = e.target.dataset;
  if ((sell || buy) && canTrade() && R.trade(p, sell || buy, !!sell)) { toast(sell ? `Sold ${ITEMS[sell].name} for ${SELL[sell]} silver.` : `Bought ${ITEMS[buy].name}.`); quests(); }
  if (use) { const msg = R.useItem(p, use); if (msg) toast(msg); }
  if (craft) {
    const before = R.skillLevel(p, 'alchemy'), made = R.craft(p, craft, stations());
    if (made) { toast(`Made ${made} ${ITEMS[craft].name}.`); if (R.skillLevel(p, 'alchemy') > before) trained('alchemy', R.skillLevel(p, 'alchemy')); quests(); }
  }
  if (build && placeBuilding(build)) { play(); return; }
  renderPack();
});

function buildMapBase() {
  const size = 256, img = new ImageData(size, size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = (i + .5) / size * WORLD_SIZE - HALF, z = (j + .5) / size * WORLD_SIZE - HALF, h = world.height(x, z), c = world.color(x, z, h);
    const shade = Math.max(.6, Math.min(1.4, 1 + (h - world.height(x + 30, z + 30)) * .02)), k = (j * size + i) * 4;
    img.data.set([c[0] * shade * 255, c[1] * shade * 255, c[2] * shade * 255, 255], k);
  }
  const base = document.createElement('canvas'); base.width = base.height = size;
  base.getContext('2d').putImageData(img, 0, 0);
  return base;
}
function renderMap() {
  mapBase ??= buildMapBase();
  const c = $('#mapCanvas'), ctx = c.getContext('2d'), W = c.width, scale = W / WORLD_SIZE, p = state.player, cell = W / EXPLORE, px = x => (x + HALF) * scale;
  ctx.drawImage(mapBase, 0, 0, W, W);
  ctx.fillStyle = '#0c0a10e0';
  for (let j = 0; j < EXPLORE; j++) for (let i = 0; i < EXPLORE; i++) if (!explored[j * EXPLORE + i]) ctx.fillRect(i * cell, j * cell, cell + .5, cell + .5);
  ctx.font = '12px Georgia'; ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff55';
  for (const [id, r] of Object.entries(REGIONS)) ctx.fillText(r.name.toUpperCase(), W / 2 + r.quadrant[0] * W * .22, W / 2 + r.quadrant[1] * W * .36);
  for (const poi of world.pois) if (state.discovered.includes(poi.id) || poi.type === 'hearth' || poi.type === 'crown') {
    const x = px(poi.x), y = px(poi.z);
    ctx.fillStyle = { circle: state.attuned.includes(poi.id) ? '#d9b8ff' : '#9a6bff', ruin: '#d6b46a', shrine: '#5fe0b0', hearth: '#ffb347', lair: '#ff6a6a', crown: '#ff3c6e', village: '#e8e0c8' }[poi.type];
    ctx.beginPath(); ctx.arc(x, y, poi.type === 'crown' ? 8 : 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2ecf8'; ctx.fillText(poi.name, x, y - 10);
  }
  for (const b of state.buildings) { ctx.fillStyle = b.type === 'heart' ? '#b98cff' : '#ff9a4a'; ctx.fillRect(px(b.x) - 2, px(b.z) - 2, 4, 4); }
  ctx.save(); ctx.translate(px(p.x), px(p.z)); ctx.rotate(p.yaw + Math.PI / 2);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}

// ---------- multiplayer ----------
function loadOnline() {
  let o = {};
  try { o = JSON.parse(localStorage.getItem(ONLINE_KEY)) ?? {}; } catch { /* defaults */ }
  if (!o.key) o.key = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return { enabled: !!o.enabled, name: o.name ?? '', coven: o.coven ?? '', world: o.world ?? 'isle', server: o.server || defaultServer(), key: o.key };
}
const online = loadOnline();
function saveOnline() { try { localStorage.setItem(ONLINE_KEY, JSON.stringify(online)); } catch { /* not remembered */ } }
for (const f of ['name', 'coven', 'world', 'server']) { const el = $(`#mp-${f}`); el.value = online[f]; el.oninput = () => { online[f] = el.value.trim(); saveOnline(); }; }
$('#mp-enabled').checked = online.enabled;
$('#mp-enabled').onchange = () => { online.enabled = $('#mp-enabled').checked; saveOnline(); $('#mpFields').classList.toggle('hidden', !online.enabled); if (!online.enabled) net.close(); };
$('#mpFields').classList.toggle('hidden', !online.enabled);

function sendVillage() { net.send({ type: 'village', list: state.buildings.map(({ id, type, x, y, z, rot }) => ({ id, type, x, y, z, rot })) }); }
function goOnline() {
  if (!online.enabled || net.wanted) return;
  if (!online.server) { toast('No multiplayer server set. Enter one in the menu to play online.'); return; }
  remotes.clear(); villages.clear();
  net.connect(online.server, () => {
    const p = state.player;
    return { type: 'hello', world: online.world, name: online.name, coven: online.coven, key: online.key, cls: p.class, level: p.level, buildings: state.buildings.map(({ id, type, x, y, z, rot }) => ({ id, type, x, y, z, rot })) };
  });
}
const addRemote = r => remotes.set(r.id, { ...r, tx: r.x, ty: r.y, tz: r.z, walk: 0 });
const remoteVillage = v => villages.set(v.owner, { name: v.name, list: v.list.map(b => ({ ...b, id: `${v.owner}:${b.id}` })) });
function hideShared(node, seconds) { if (!state.harvested[node]) { state.harvested[node] = state.clock + seconds; view.hideNode(node); } }
function setBoss(b) {
  serverBoss = b;
  if (boss) { boss.hp = b.hp; boss.warded = b.warded; boss.wardTimer = b.wardLeft; }
}
function chatLine(name, text) {
  const line = document.createElement('div'), who = document.createElement('b');
  who.textContent = name ? `${name}: ` : ''; line.append(who, text);
  $('#chatLog').append(line);
  while ($('#chatLog').children.length > 8) $('#chatLog').firstChild.remove();
  setTimeout(() => line.classList.add('old'), 15000);
}
net.on('welcome', m => {
  net.world = m.world;
  remotes.clear(); villages.clear();
  m.players.forEach(addRemote); m.villages.forEach(remoteVillage);
  for (const [node, seconds] of m.harvested) hideShared(node, seconds);
  setBoss(m.boss);
  chatLine('', `Joined world “${m.world}”. ${m.players.length ? `${m.players.length} other witch${m.players.length > 1 ? 'es' : ''} here.` : 'You are alone here for now.'} Press Enter to chat.`);
});
net.on('join', m => { addRemote(m.player); chatLine('', `${m.player.name} has entered the isle.`); });
net.on('leave', m => { const r = remotes.get(m.id); if (r) chatLine('', `${r.name} has left.`); remotes.delete(m.id); });
net.on('snap', m => {
  for (const o of m.players) {
    const r = remotes.get(o.id);
    if (!r) { addRemote(o); continue; }
    Object.assign(r, { ...o, x: r.x, y: r.y, z: r.z, tx: o.x, ty: o.y, tz: o.z });
    if (Math.hypot(r.tx - r.x, r.tz - r.z) > 50) Object.assign(r, { x: o.x, y: o.y, z: o.z });
  }
});
net.on('harvest', m => hideShared(m.node, m.seconds));
net.on('village', remoteVillage);
net.on('boss', m => { const was = serverBoss?.warded; setBoss(m.boss); if (boss && was && !m.boss.warded) toast('A coven-sister\'s Grand Rite shatters the ward! Strike now!', true); });
net.on('bossDown', m => {
  setBoss(m.boss);
  const p = state.player;
  if (Math.hypot(p.x - CROWN.x, p.z - CROWN.z) < 250) {
    boss = null; state.bossDefeated = true; p.stats.boss = 1;
    toast(`The Unwitch is unmade${m.by ? ` — ${m.by} struck the last blow` : ''}. The coven is whole again.`, true); reward(BOSS.xp); quests(); saveState();
  } else chatLine('', `${m.by} and their coven have unmade the Unwitch.`);
});
net.on('fx', m => view.ring(m.x, m.y, m.z, m.r, m.color));
net.on('chat', m => chatLine(m.name, m.text));
net.on('error', m => toast(m.text));
net.on('status', (status) => {
  if (status === 'reconnecting') chatLine('', 'Lost the server. Reconnecting…');
  if (status !== 'online') { remotes.clear(); villages.clear(); }
});

function openChat() {
  if (!net.online) { toast('Chat needs an online world. Turn on “Play online” in the menu.'); return; }
  mode = 'chat'; keys.clear();
  $('#chatInput').classList.remove('hidden'); $('#chatInput').value = ''; $('#chatInput').focus();
}
$('#chatInput').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') { const text = e.target.value.trim(); if (text) net.send({ type: 'chat', text }); }
  if (e.key === 'Enter' || e.key === 'Escape') { e.target.blur(); $('#chatInput').classList.add('hidden'); mode = 'playing'; captureMouse(); }
});

// ---------- modes & input ----------
function captureMouse() { try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* arrow keys still turn */ } }
function play() { goOnline(); mode = 'playing'; accumulator = 0; keys.clear(); for (const id of ['#overlay', '#pack', '#map', '#classes']) $(id).classList.add('hidden'); captureMouse(); }
function openPanel(name, withTab) {
  mode = name; keys.clear(); document.exitPointerLock?.();
  $(`#${name}`).classList.remove('hidden');
  if (withTab) tab = withTab;
  if (name === 'pack') renderPack(); else renderMap();
}
function pause() {
  mode = 'paused'; keys.clear(); document.exitPointerLock?.(); saveState();
  $('#overlay').classList.remove('hidden'); $('#play').innerHTML = 'RESUME <span>→</span>';
  $('#description').textContent = `${CLASSES[state.player.class].name}, level ${state.player.level}, day ${state.day}. Your progress is saved.`;
}
function chooseClass() {
  $('#overlay').classList.add('hidden'); $('#classes').classList.remove('hidden'); mode = 'classes';
  $('#classCards').innerHTML = Object.entries(CLASSES).map(([id, k]) => `<button class="card" data-class="${id}" style="--robe:${k.robe}"><span class="eyebrow">${REGIONS[k.region].name}</span><h3>${k.name}</h3><p>${k.blurb}</p><p><b>Spells:</b> ${k.spells.map(s => SPELLS[s].name).join(', ')}</p><p><b>${k.familiar.name}:</b> ${k.familiar.bonus} ${k.familiar.ability}</p><small>${k.hp} health · ${k.mana} mana</small></button>`).join('');
}
$('#classCards').addEventListener('click', e => { const card = e.target.closest('[data-class]'); if (card) { begin(freshState(card.dataset.class)); saveState(); play(); } });
$('#classBack').onclick = () => { $('#classes').classList.add('hidden'); $('#overlay').classList.remove('hidden'); mode = state ? 'paused' : 'menu'; };
$('#play').onclick = () => state ? play() : chooseClass();
$('#newGame').onclick = () => { if (confirm('Abandon this life and start again? Your saved progress will be lost.')) chooseClass(); };
document.querySelectorAll('[data-close]').forEach(b => b.onclick = play);
addEventListener('resize', () => view.resize());
addEventListener('blur', () => { if (mode === 'playing') pause(); });
addEventListener('beforeunload', saveState);
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== canvas && mode === 'playing') pause(); });
addEventListener('keydown', e => {
  if (['Space', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  if (e.repeat) { if (mode === 'playing') keys.add(e.code); return; }
  if (e.code === 'Escape') { if (mode === 'playing') pause(); else if (mode === 'pack' || mode === 'map') play(); return; }
  if (e.code === 'Tab' || e.code === 'KeyB' || e.code === 'KeyK' || e.code === 'KeyC') {
    const want = { Tab: 'items', KeyB: 'build', KeyK: 'skills', KeyC: 'coven' }[e.code];
    if (mode === 'playing') openPanel('pack', want); else if (mode === 'pack') { if (tab === want || e.code === 'Tab') play(); else { tab = want; renderPack(); } }
    return;
  }
  if (e.code === 'Enter' && mode === 'playing') { e.preventDefault(); openChat(); return; }
  if (e.code === 'KeyM') { if (mode === 'playing') openPanel('map'); else if (mode === 'map') play(); return; }
  if (mode !== 'playing') return;
  keys.add(e.code);
  const spell = SPELL_KEYS.indexOf(e.code);
  if (spell >= 0) cast(spell);
  if (e.code === 'KeyE') interaction()?.act();
  if (e.code === 'KeyQ') { const food = R.bestFood(state.player); toast(food ? R.useItem(state.player, food) : 'You have nothing to eat. Gather berries or hunt.'); }
});
addEventListener('keyup', e => keys.delete(e.code));
document.addEventListener('mousemove', e => {
  if (mode !== 'playing' || document.pointerLockElement !== canvas) return;
  yaw += e.movementX * .0025;
  pitch = Math.max(-.25, Math.min(1.2, pitch + e.movementY * .002));
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  if (mode !== 'playing') return;
  if (document.pointerLockElement !== canvas) captureMouse();
  if (e.button === 0) strike();
  if (e.button === 2) cast(0);
});

const saved = loadState();
if (saved) { begin(saved); $('#play').innerHTML = 'CONTINUE <span>→</span>'; $('#newGame').classList.remove('hidden'); }
else begin(freshState('wild'));
window.__coven = { net, get remotes() { return remotes; }, get villages() { return villages; }, get state() { return state; }, world, view, get creatures() { return creatures; }, get allies() { return allies; }, get boss() { return boss; }, cast, placeBuilding, get mode() { return mode; }, spawn: (kind, x, z) => creatures.push(makeCreature(kind, x, z)), hit: (c, n) => damage(c, n), humanVillages, villageState, interact: () => interaction()?.act() };
// Without a save, the menu shows the world behind it but play starts at class selection.
if (!saved) state = null;
const preview = freshState('wild');

function frame(now) {
  const dt = Math.min((now - last) / 1000, .1); last = now;
  if (mode === 'playing') { accumulator += dt; while (accumulator >= 1 / 60) { update(1 / 60); accumulator -= 1 / 60; } }
  const s = state ?? preview, p = s.player;
  if (!state) yaw += dt * .05;
  view.stream(p.x, p.z, mode === 'playing' ? 2 : 4);
  if (state) {
    for (const r of remotes.values()) { const k = Math.min(1, dt * 10); r.x += (r.tx - r.x) * k; r.z += (r.tz - r.z) * k; r.y += (r.ty - r.y) * k; if (r.moving) r.walk += dt * 6; }
    const built = allBuildings(), lights = [...built.filter(b => b.type === 'campfire' || b.type === 'lantern'), ...hearthFires()];
    view.syncRemotes([...remotes.values()], now / 1000);
    view.syncWorld({ creatures, allies, boss, buildings: built, projectiles, elders: elders(), now: now / 1000 });
    view.render({ player: p, yaw, pitch, dayTime: state.dayTime, now: now / 1000, dt, swing, toolName: R.weapon(p).name, lights, moving: moving && mode === 'playing', sight: !!p.effects.sight, glamour: !!p.effects.glamour });
    hud();
  } else view.render({ player: p, yaw, pitch: .25, dayTime: .3, now: now / 1000, dt, swing: 0, toolName: 'fists', lights: hearthFires(), moving: false, sight: false });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
