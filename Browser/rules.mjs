// Player rules: inventory, skills, crafting, alchemy, building, needs, magic and quests. No rendering here.
import { CLASSES, SPELLS, ITEMS, RECIPES, BUILDINGS, SKILLS, SELL, BUY } from './data.mjs';
import { NODES } from './world.mjs';

const STATS = () => ({ kills: 0, eliteKills: 0, boss: 0, trades: 0, souls: 0, titans: 0, discovered: 0, attuned: 0, talked: 0, brewed: 0, covenCasts: 0, crafted: {}, gathered: {}, built: {} });

export function newPlayer(classId, spawn) {
  const k = CLASSES[classId];
  return {
    class: classId, x: spawn.x, z: spawn.z, y: 0, vy: 0, yaw: 0, grounded: true,
    hp: k.hp, maxHp: k.hp, mana: k.mana, maxMana: k.mana, stamina: 100, maxStamina: 100, food: 100, water: 100,
    level: 1, xp: 0, inv: {}, skills: Object.fromEntries(Object.keys(SKILLS).map(s => [s, 0])),
    effects: {}, poison: 0, cooldowns: {}, coven: [], home: { x: spawn.x, z: spawn.z, name: 'your hearth' },
    stats: STATS(), quest: 0,
  };
}

export const count = (p, id) => p.inv[id] ?? 0;
export function addItem(p, id, n = 1) { p.inv[id] = count(p, id) + n; }
export function removeItem(p, id, n = 1) {
  if (count(p, id) < n) return false;
  p.inv[id] -= n;
  if (!p.inv[id]) delete p.inv[id];
  return true;
}
const hasAll = (p, needs) => Object.entries(needs).every(([id, n]) => count(p, id) >= n);
const payAll = (p, needs) => { for (const [id, n] of Object.entries(needs)) removeItem(p, id, n); };

// ---------- levels & skills ----------
export const xpToNext = level => 80 + level * 70;
export function gainXp(p, amount) {
  let levels = 0;
  p.xp += amount;
  while (p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level++; levels++;
    p.maxHp += 10; p.maxMana += 6; p.maxStamina += 4;
    p.hp = p.maxHp; p.mana = p.maxMana; p.stamina = p.maxStamina;
  }
  return levels;
}

export const SKILL_CAP = 30;
export const skillLevel = (p, id) => Math.min(SKILL_CAP, 1 + Math.floor(Math.sqrt(p.skills[id] / 25)));
// Returns the new level if the skill went up, else 0.
export function train(p, id, xp) {
  const before = skillLevel(p, id);
  p.skills[id] += xp;
  const after = skillLevel(p, id);
  return after > before ? after : 0;
}

// ---------- combat numbers ----------
export function weapon(p) {
  const melee = (CLASSES[p.class].melee ?? 1) * (1 + (skillLevel(p, 'hunting') - 1) * .03);
  if (count(p, 'spear')) return { name: 'spear', damage: 22 * melee, reach: 3.6 };
  if (count(p, 'ironHatchet')) return { name: 'hatchet', damage: 18 * melee, reach: 2.6 };
  if (count(p, 'hatchet')) return { name: 'hatchet', damage: 13 * melee, reach: 2.6 };
  return { name: 'fists', damage: 6 * melee, reach: 2.2 };
}

export function spellPower(p, night = false) {
  let power = CLASSES[p.class].power * (1 + (skillLevel(p, 'spellcraft') - 1) * .04);
  if (count(p, 'staff')) power *= 1.15;
  if (p.class === 'hex' && night) power *= 1.25;
  return power;
}

export const moveSpeedFactor = p => (p.class === 'bloom' ? 1.15 : 1) * (p.effects.swift ? 1.3 : 1);
export const poisonsOnHit = p => p.class === 'bog' || !!p.effects.venom;

// Damage taken by the player after potions and spells. Returns the amount dealt.
export function damagePlayer(p, amount, { poison = false } = {}) {
  let dmg = amount;
  if (p.effects.ironbark) dmg *= .6;
  if (p.effects.barkskin) dmg *= .5;
  p.hp -= dmg;
  if (poison && p.class !== 'bog') p.poison = Math.max(p.poison, 5);
  return dmg;
}

// ---------- gathering ----------
// What one strike on a resource node gives. `random` is injectable for tests.
export function gatherYield(p, type, random = Math.random) {
  const node = NODES[type], out = {}, forage = p.class === 'bloom' ? 2 : 1;
  if (node.herb) {
    out[type] = (1 + Math.floor((skillLevel(p, 'herbalism') - 1) / 4)) * forage;
    train(p, 'herbalism', 6);
    p.stats.gathered.herbs = (p.stats.gathered.herbs ?? 0) + out[type];
  } else if (type === 'bush') {
    out.fiber = 2;
    if (random() < .45) out.berries = forage;
    train(p, 'herbalism', 2);
  } else {
    const bonus = Math.floor((skillLevel(p, 'gathering') - 1) / 5);
    if (node.yields === 'stone') out.stone = (count(p, 'ironPick') ? 5 : count(p, 'pick') ? 3 : 1) + bonus;
    else if (node.yields === 'moonstone') { if (!count(p, 'pick') && !count(p, 'ironPick')) return out; out.moonstone = count(p, 'ironPick') ? 2 : 1; }
    else out.wood = (count(p, 'ironHatchet') ? 5 : count(p, 'hatchet') ? 3 : 1) + bonus;
    train(p, 'gathering', 3);
  }
  for (const [id, n] of Object.entries(out)) { addItem(p, id, n); p.stats.gathered[id] = (p.stats.gathered[id] ?? 0) + n; }
  return out;
}

// Loot from a slain creature, with the fox familiar's bonus.
export function lootFor(p, loot) {
  const out = { ...loot };
  if (p.class === 'wild') { if (out.rawMeat) out.rawMeat++; if (out.hide) out.hide++; }
  for (const [id, n] of Object.entries(out)) addItem(p, id, n);
  return out;
}

// ---------- crafting, alchemy & building ----------
export function canCraft(p, recipe, stations = new Set()) {
  return (!recipe.station || stations.has(recipe.station)) && hasAll(p, recipe.needs);
}

// Returns how many were made (0 if the craft failed).
export function craft(p, id, stations = new Set(), random = Math.random) {
  const recipe = RECIPES.find(r => r.id === id);
  if (!recipe || !canCraft(p, recipe, stations)) return 0;
  payAll(p, recipe.needs);
  let made = recipe.makes ?? 1;
  if (recipe.station) {
    if (random() < (skillLevel(p, 'alchemy') - 1) * .03) made++;
    train(p, 'alchemy', 15);
    p.stats.brewed++;
  }
  addItem(p, id, made);
  p.stats.crafted[id] = (p.stats.crafted[id] ?? 0) + made;
  gainXp(p, recipe.station ? 25 : 15);
  return made;
}

// `village` is { hasHeart, nearHeart }. Returns null if allowed, else the reason.
export function buildBlocker(p, id, village) {
  const b = BUILDINGS[id];
  if (skillLevel(p, 'building') < b.skill) return `Needs Building ${b.skill}`;
  if (id === 'heart' && village.hasHeart) return 'You already have a village';
  if (id !== 'heart' && !b.anywhere && !village.hasHeart) return 'Build a Village Heart first';
  if (id !== 'heart' && !b.anywhere && !village.nearHeart) return 'Too far from your Village Heart';
  if (!hasAll(p, b.needs)) return 'Missing materials';
  return null;
}
export function build(p, id) {
  payAll(p, BUILDINGS[id].needs);
  p.stats.built[id] = (p.stats.built[id] ?? 0) + 1;
  train(p, 'building', 20 + Object.keys(BUILDINGS[id].needs).length * 5);
  gainXp(p, 20);
}

// ---------- items & needs ----------
// Returns a short message, or null if the item can't be used directly.
export function useItem(p, id) {
  const item = ITEMS[id];
  if (!item || !count(p, id) || !(item.food || item.heal || item.mana || item.effect)) return null;
  removeItem(p, id);
  if (item.food) p.food = Math.min(100, p.food + item.food);
  if (item.water) p.water = Math.min(100, p.water + item.water);
  if (item.heal) p.hp = Math.min(p.maxHp, p.hp + item.heal);
  if (item.mana) p.mana = Math.min(p.maxMana, p.mana + item.mana);
  if (item.effect) p.effects[item.effect] = item.duration;
  if (item.hurt) { p.hp = Math.max(1, p.hp - item.hurt); return `Ate ${item.name}. Your stomach turns.`; }
  return item.food ? `Ate ${item.name}.` : `Used ${item.name}.`;
}
export const bestFood = p => ['cookedMeat', 'bread', 'honeycomb', 'berries', 'rawMeat'].find(id => count(p, id));
export const warm = p => !!(count(p, 'cloak') || count(p, 'woolCloak'));
export function drink(p) { p.water = Math.min(100, p.water + 25); }

// Advance needs, effects and regeneration by dt seconds. Returns true if the player died this tick.
export function tickSurvival(p, dt, { sprinting = false, swimming = false, cold = false, resting = false } = {}) {
  p.food = Math.max(0, p.food - dt * (sprinting ? .1 : .05));
  p.water = Math.max(0, p.water - dt * (sprinting ? .14 : .075));
  if (sprinting) p.stamina = Math.max(0, p.stamina - dt * 16);
  else if (swimming) p.stamina = Math.max(0, p.stamina - dt * 3);
  else p.stamina = Math.min(p.maxStamina, p.stamina + dt * (p.class === 'bloom' ? 18 : 14));
  p.mana = Math.min(p.maxMana, p.mana + dt * (1.5 + p.maxMana * .01) * (resting ? 3 : 1));
  if (swimming && p.stamina === 0) p.hp -= dt * 4;
  if (p.food === 0) p.hp -= dt;
  if (p.water === 0) p.hp -= dt * 1.5;
  if (cold && !warm(p)) p.hp -= dt * .8;
  if (p.poison > 0) { p.poison = Math.max(0, p.poison - dt); p.hp -= dt * 3; }
  if (p.effects.regen) p.hp = Math.min(p.maxHp, p.hp + dt * p.effects.regenRate);
  for (const k of Object.keys(p.effects)) if (k !== 'regenRate') { p.effects[k] -= dt; if (p.effects[k] <= 0) delete p.effects[k]; }
  for (const k of Object.keys(p.cooldowns)) { p.cooldowns[k] -= dt; if (p.cooldowns[k] <= 0) delete p.cooldowns[k]; }
  if (p.food > 40 && p.water > 40 && !cold && p.poison <= 0 && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + dt * (p.class === 'bog' ? .9 : .6));
  return p.hp <= 0;
}

export function respawn(p) {
  Object.assign(p, { x: p.home.x, z: p.home.z, vy: 0, hp: p.maxHp * .6, mana: p.maxMana * .5, stamina: p.maxStamina, poison: 0, food: Math.max(p.food, 50), water: Math.max(p.water, 50), effects: {} });
}

// ---------- magic ----------
export const knownSpells = p => [...CLASSES[p.class].spells, 'summonbeast', 'binding', 'storm', 'guardian', 'grandrite', 'glamour', 'titan'];

// `covenNearby` counts witches within reach including you. Returns null if castable, else the reason.
export function castBlocker(p, id, covenNearby) {
  const s = SPELLS[id];
  if (skillLevel(p, 'spellcraft') < s.skill) return `Needs Spellcraft ${s.skill}`;
  if (covenNearby < s.coven) return `Needs a coven of ${s.coven}`;
  if (p.cooldowns[id]) return 'Not ready';
  if (p.mana < s.mana) return 'Not enough mana';
  if (s.reagent && !hasAll(p, s.reagent)) return `Needs ${Object.entries(s.reagent).map(([r, n]) => `${n} ${ITEMS[r].name}`).join(', ')}`;
  return null;
}
export function payCast(p, id) {
  const s = SPELLS[id];
  p.mana -= s.mana;
  p.cooldowns[id] = s.cooldown;
  if (s.reagent) payAll(p, s.reagent);
  if (s.coven > 1) p.stats.covenCasts++;
  return train(p, 'spellcraft', 8 + s.coven * 6);
}

// ---------- trade with the human villages ----------
// Returns null if the trade can happen, else the reason. Selling gives silver; buying costs it.
export function tradeBlocker(p, id, selling) {
  if (selling) return SELL[id] && count(p, id) ? null : 'Nothing to sell';
  if (!BUY[id]) return 'Not for sale';
  return count(p, 'silver') >= BUY[id] ? null : `Needs ${BUY[id]} silver`;
}
export function trade(p, id, selling) {
  if (tradeBlocker(p, id, selling)) return false;
  if (selling) { removeItem(p, id); addItem(p, 'silver', SELL[id]); }
  else { removeItem(p, 'silver', BUY[id]); addItem(p, id); }
  p.stats.trades++;
  return true;
}

// A human falls: their soul goes into an empty Soul Jar if you carry one. Returns true if captured.
export function captureSoul(p) {
  if (!removeItem(p, 'soulJar')) return false;
  addItem(p, 'humanSoul'); p.stats.souls++;
  return true;
}

// ---------- the coven ----------
export const recruitLevel = members => [3, 6, 9][members] ?? Infinity;
// Returns null if the elder of `classId` will join, else the reason.
export function recruitBlocker(p, classId) {
  if (classId === p.class || p.coven.includes(classId)) return 'Already of your coven';
  const level = recruitLevel(p.coven.length), gift = CLASSES[classId].gift;
  if (p.level < level) return `Return when you are level ${level}`;
  if (!count(p, gift)) return `Bring her a ${ITEMS[gift].name}`;
  return null;
}
export function recruit(p, classId) {
  removeItem(p, CLASSES[classId].gift);
  p.coven.push(classId);
  gainXp(p, 150);
}

// ---------- quests ----------
const done = n => (n ? 1 : 0);
export const QUESTS = [
  { title: 'The Elder\'s Word', text: 'Speak with the elder at your hearth [E].', xp: 30, progress: p => done(p.stats.talked) },
  { title: 'First Gathering', text: 'Gather 10 wood, 10 stone and 6 herbs.', xp: 60, progress: p => (Math.min(10, p.stats.gathered.wood ?? 0) + Math.min(10, p.stats.gathered.stone ?? 0) + Math.min(6, p.stats.gathered.herbs ?? 0)) / 26 },
  { title: 'A Witch\'s Tools', text: 'Craft a Stone Hatchet [TAB].', xp: 60, progress: p => done(p.stats.crafted.hatchet) },
  { title: 'Found a Village', text: 'Build a Village Heart [B].', xp: 100, progress: p => done(p.stats.built.heart) },
  { title: 'The Cauldron Bubbles', text: 'Build a Cauldron and brew any potion.', xp: 120, progress: p => (done(p.stats.built.cauldron) + done(p.stats.brewed)) / 2 },
  { title: 'A Borrowed Face', text: 'Brew Glamour Dust, cast Glamour [8] and trade with a human merchant.', xp: 150, progress: p => done(p.stats.trades) },
  { title: 'Seek a Sister', text: 'At level 3, bring a gift to another region\'s elder and ask her to join your coven.', xp: 200, progress: p => done(p.coven.length >= 1) },
  { title: 'Two Voices', text: 'Brew Coven Ink and cast a two-witch coven spell [3] or [4].', xp: 200, progress: p => done(p.stats.covenCasts) },
  { title: 'The Third Hearth', text: 'At level 6, recruit a second sister.', xp: 250, progress: p => done(p.coven.length >= 2) },
  { title: 'Moonstone', text: 'Mine moonstone in the Crown mountains and make Moonstone Dust at a Ritual Altar.', xp: 250, progress: p => done(p.stats.crafted.moonDust) },
  { title: 'The Full Coven', text: 'At level 9, recruit the last sister.', xp: 400, progress: p => done(p.coven.length >= 3) },
  { title: 'Heartfire', text: 'Slay a lair elite and take its Heartfire.', xp: 400, progress: p => done(p.stats.eliteKills) },
  { title: 'Soul Harvest', text: 'Make Soul Jars at your altar and capture 3 human souls.', xp: 300, progress: p => Math.min(1, p.stats.souls / 3) },
  { title: 'The Wyrd Titan', text: 'With a full coven, three souls and a Heartfire Sigil, summon the Wyrd Titan [9].', xp: 500, progress: p => done(p.stats.titans) },
  { title: 'The Grand Rite', text: 'With all four witches, break the Unwitch\'s ward at the Crown [7] and destroy her.', xp: 2000, progress: p => done(p.stats.boss) },
];

// Completes the current quest if done. Returns the finished quest or null.
export function checkQuest(p) {
  const q = QUESTS[p.quest];
  if (!q || q.progress(p) < 1) return null;
  p.quest++;
  gainXp(p, q.xp);
  return q;
}
