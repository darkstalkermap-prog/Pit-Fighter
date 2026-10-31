import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, HALF, CELL, WATER, REGIONS, NODES, HUMAN_VILLAGE } from './world.mjs';
import { CLASSES, SPELLS, RECIPES, BUILDINGS, ITEMS, SELL, BUY } from './data.mjs';
import { BESTIARY, CREATURE, HUMANS } from './bestiary.mjs';
import * as R from './rules.mjs';
import { makeCreature, updateCreature, hurtCreature, pickCreature, makeAlly, updateAlly } from './creatures.mjs';

const world = createWorld(1337);
const flat = () => 10;
const player = cls => R.newPlayer(cls, { x: 0, z: 0 });

test('world generation is deterministic', () => {
  const other = createWorld(1337);
  for (const [x, z] of [[0, 0], [1234.5, -987.25], [-4000, 3500]]) assert.equal(world.height(x, z), other.height(x, z));
  assert.deepEqual(world.scatter(3, -2), other.scatter(3, -2));
});

test('the island is four regions around the Crown, ringed by sea', () => {
  for (const [x, z] of [[HALF - 10, 0], [0, -HALF + 10], [-HALF + 10, HALF - 10]]) assert.ok(world.height(x, z) < WATER, 'edges are sea');
  assert.equal(world.region(-3000, -3000), 'darkforest');
  assert.equal(world.region(3000, -3000), 'forest');
  assert.equal(world.region(-3000, 3000), 'swamp');
  assert.equal(world.region(3000, 3000), 'meadow');
  assert.ok(world.height(0, 0) > 250, 'Crown is a high summit');
  assert.ok(Math.abs(world.height(30, 20) - world.height(0, 0)) < 1, 'summit arena is flat');
  assert.equal(world.danger(0, 0), 12);
  assert.equal(world.danger(2500, 2500), 1);
});

test('each region has a hearth on land, a lair and its own herbs', () => {
  for (const id of Object.keys(REGIONS)) {
    const h = world.hearthOf(id);
    assert.equal(world.region(h.x, h.z), id);
    assert.ok(world.height(h.x, h.z) > 3, `${h.name} on land`);
    assert.ok(world.pois.some(p => p.type === 'lair' && p.region === id));
    const s = world.spawnPoint(id);
    assert.ok(world.height(s.x, s.z) > 3);
    assert.equal(Object.values(ITEMS).filter(i => i.herb === id).length, 3);
  }
  assert.ok(world.pois.some(p => p.type === 'crown'));
});

test('ground height matches mesh vertices', () => {
  const x = 10 * CELL, z = -4 * CELL;
  assert.ok(Math.abs(world.ground(x, z) - world.height(x, z)) < 1e-9);
});

test('four witch classes, each with a familiar, two spells and a homeland', () => {
  assert.deepEqual(Object.keys(CLASSES).sort(), ['bloom', 'bog', 'hex', 'wild']);
  assert.deepEqual(Object.values(CLASSES).map(c => c.region).sort(), Object.keys(REGIONS).sort());
  for (const k of Object.values(CLASSES)) {
    assert.ok(k.familiar.bonus && k.familiar.ability);
    assert.equal(k.spells.length, 2);
    for (const s of k.spells) assert.equal(SPELLS[s].coven, 1);
    assert.ok(RECIPES.some(r => r.id === k.gift), 'gift is brewable');
  }
});

test('ten creatures per region, one elite each, all with loot', () => {
  for (const id of Object.keys(REGIONS)) {
    const list = BESTIARY.filter(b => b.region === id);
    assert.equal(list.length, 10);
    assert.equal(list.filter(b => b.elite).length, 1);
    assert.equal(new Set(list.map(b => b.name)).size, 10);
    for (const b of list) for (const item of Object.keys(b.loot)) assert.ok(ITEMS[item], `${b.name} drops a real item: ${item}`);
  }
  assert.ok(BESTIARY.filter(b => b.elite).every(b => b.loot.heartfire));
});

test('every recipe and building uses known items, and every herb grows somewhere', () => {
  for (const r of RECIPES) for (const id of [r.id, ...Object.keys(r.needs)]) assert.ok(ITEMS[id], id);
  for (const b of Object.values(BUILDINGS)) for (const id of Object.keys(b.needs)) assert.ok(ITEMS[id], id);
  for (const [id, n] of Object.entries(NODES)) if (n.herb) assert.ok(ITEMS[id]?.herb);
});

test('spawning respects region, danger and night', () => {
  for (let i = 0; i < 50; i++) {
    const id = pickCreature('swamp', 3, false);
    assert.equal(CREATURE[id].region, 'swamp');
    assert.ok(CREATURE[id].level <= 4 && !CREATURE[id].night && !CREATURE[id].elite);
  }
  assert.ok(Array.from({ length: 200 }, () => pickCreature('swamp', 6, true)).includes('wisp'));
});

test('alchemy needs a station and Coven Ink makes two', () => {
  const p = player('bloom');
  R.addItem(p, 'gravemoss'); R.addItem(p, 'wolfsbane'); R.addItem(p, 'feather');
  assert.equal(R.craft(p, 'covenInk'), 0);
  assert.equal(R.craft(p, 'covenInk', new Set(['cauldron']), () => 1), 2);
  assert.equal(R.count(p, 'covenInk'), 2);
  assert.equal(p.stats.brewed, 1);
  assert.ok(p.skills.alchemy > 0);
});

test('gathering trains skills and familiars change yields', () => {
  const p = player('wild');
  assert.deepEqual(R.gatherYield(p, 'oak'), { wood: 1 });
  assert.ok(p.skills.gathering > 0);
  assert.deepEqual(R.gatherYield(p, 'moonstone'), {}, 'moonstone needs a pick');
  R.addItem(p, 'pick');
  assert.deepEqual(R.gatherYield(p, 'moonstone'), { moonstone: 1 });
  assert.deepEqual(R.gatherYield(player('bloom'), 'sunpetal'), { sunpetal: 2 }, 'the hare doubles herbs');
  assert.deepEqual(R.lootFor(p, { rawMeat: 1, hide: 1 }), { rawMeat: 2, hide: 2 }, 'the fox adds meat and hide');
});

test('buildings need a village heart nearby and the right skill', () => {
  const p = player('hex');
  R.addItem(p, 'wood', 40); R.addItem(p, 'stone', 40); R.addItem(p, 'fiber', 20); R.addItem(p, 'hide', 5);
  assert.equal(R.buildBlocker(p, 'cauldron', { hasHeart: false }), 'Build a Village Heart first');
  assert.equal(R.buildBlocker(p, 'campfire', { hasHeart: false }), null, 'campfires go anywhere');
  assert.equal(R.buildBlocker(p, 'heart', { hasHeart: false }), null);
  R.build(p, 'heart');
  assert.equal(R.buildBlocker(p, 'cauldron', { hasHeart: true, nearHeart: false }), 'Too far from your Village Heart');
  R.addItem(p, 'moonstone', 3);
  assert.equal(R.buildBlocker(p, 'altar', { hasHeart: true, nearHeart: true }), 'Needs Building 4');
  p.skills.building = 25 * 3 ** 2;
  assert.equal(R.buildBlocker(p, 'altar', { hasHeart: true, nearHeart: true }), null);
});

test('coven spells need enough witches, spellcraft and reagents', () => {
  const p = player('hex');
  assert.equal(R.castBlocker(p, 'shadowbolt', 1), null);
  assert.equal(R.castBlocker(p, 'binding', 1), 'Needs Spellcraft 3');
  p.skills.spellcraft = 25 * 6 ** 2;
  assert.equal(R.castBlocker(p, 'binding', 1), 'Needs a coven of 2');
  assert.match(R.castBlocker(p, 'binding', 2), /Coven Ink/);
  R.addItem(p, 'covenInk');
  assert.equal(R.castBlocker(p, 'binding', 2), null);
  R.payCast(p, 'binding');
  assert.equal(R.count(p, 'covenInk'), 0);
  assert.equal(R.castBlocker(p, 'binding', 2), 'Not ready');
  assert.equal(p.stats.covenCasts, 1);
  assert.equal(R.castBlocker(p, 'grandrite', 3), 'Needs a coven of 4');
});

test('recruiting sisters needs levels 3, 6 and 9 and her gift', () => {
  const p = player('wild');
  assert.equal(R.recruitBlocker(p, 'wild'), 'Already of your coven');
  assert.equal(R.recruitBlocker(p, 'bog'), 'Return when you are level 3');
  p.level = 3;
  assert.equal(R.recruitBlocker(p, 'bog'), 'Bring her a Ironbark Brew');
  R.addItem(p, 'ironbark');
  assert.equal(R.recruitBlocker(p, 'bog'), null);
  R.recruit(p, 'bog');
  assert.deepEqual(p.coven, ['bog']);
  assert.equal(R.recruitLevel(p.coven.length), 6);
});

test('familiar and potion effects', () => {
  const bog = player('bog'), hex = player('hex');
  R.damagePlayer(bog, 10, { poison: true }); R.damagePlayer(hex, 10, { poison: true });
  assert.equal(bog.poison, 0, 'the toad keeps poison off');
  assert.ok(hex.poison > 0);
  assert.ok(R.spellPower(hex, true) > R.spellPower(hex, false), 'the raven empowers night spells');
  assert.ok(R.moveSpeedFactor(player('bloom')) > 1);
  R.addItem(hex, 'ironbark'); R.useItem(hex, 'ironbark');
  const before = hex.hp; R.damagePlayer(hex, 10);
  assert.equal(before - hex.hp, 6);
});

test('needs drain, death respawns at home, and levels raise health and mana', () => {
  const p = player('bloom');
  R.tickSurvival(p, 100);
  assert.ok(p.food < 100 && p.water < 100);
  p.hp = 1; p.food = 0;
  assert.equal(R.tickSurvival(p, 10), true);
  R.respawn(p);
  assert.ok(p.hp > 0);
  const mana = p.maxMana;
  R.gainXp(p, R.xpToNext(1));
  assert.equal(p.level, 2);
  assert.ok(p.maxMana > mana);
});

test('quests advance in order', () => {
  const p = player('wild');
  assert.equal(R.checkQuest(p), null);
  p.stats.talked = 1;
  assert.equal(R.checkQuest(p).title, 'The Elder\'s Word');
  assert.equal(R.QUESTS.at(-1).title, 'The Grand Rite');
});

test('hostile creatures hunt and bite; timid ones flee; provoked ones fight back', () => {
  const you = { x: 0, z: 0, hp: 100 };
  const wolf = makeCreature('wolf', 15, 0);
  let bitten = 0;
  for (let i = 0; i < 300; i++) updateCreature(wolf, you, flat, 1 / 60, false, d => { bitten += d; });
  assert.ok(bitten > 0);
  const deer = makeCreature('forestdeer', 8, 0);
  for (let i = 0; i < 120; i++) updateCreature(deer, you, flat, 1 / 60, false, () => {});
  assert.ok(deer.x > 8);
  const boar = makeCreature('boar', 10, 0);
  assert.equal(hurtCreature(boar, 5), false);
  assert.equal(boar.state, 'chase');
  const rooted = makeCreature('duskwolf', 10, 0);
  hurtCreature(rooted, 1, { root: 5 });
  for (let i = 0; i < 60; i++) updateCreature(rooted, you, flat, 1 / 60, false, () => {});
  assert.equal(rooted.x, 10, 'rooted creatures stay put');
});

test('warding totems keep hostile beasts away', () => {
  const you = { x: 0, z: 0, hp: 100 }, wolf = makeCreature('wolf', 10, 0);
  let bitten = 0;
  for (let i = 0; i < 300; i++) updateCreature(wolf, you, flat, 1 / 60, false, d => { bitten += d; }, [{ x: 0, z: 0 }]);
  assert.equal(bitten, 0);
});

test('allies follow you and attack what hunts you', () => {
  const you = { x: 0, z: 0, yaw: 0, hp: 100 }, fox = makeAlly('fox', 30, 0), foe = makeCreature('wolf', 5, 5);
  foe.state = 'chase';
  let hits = 0;
  for (let i = 0; i < 300; i++) updateAlly(fox, you, [foe], flat, 1 / 60, () => hits++);
  assert.ok(hits > 0);
  const idle = makeAlly('witch', 40, 0);
  for (let i = 0; i < 600; i++) updateAlly(idle, you, [], flat, 1 / 60, () => {});
  assert.ok(Math.hypot(idle.x, idle.z) < 5, 'sister returns to your side');
});

test('two walled human villages per region, with gates, houses and a market', () => {
  const villages = world.pois.filter(p => p.type === 'village');
  assert.equal(villages.length, 8);
  for (const id of Object.keys(REGIONS)) assert.equal(villages.filter(v => v.region === id).length, 2);
  for (const v of villages) {
    assert.equal(world.region(v.x, v.z), v.region);
    assert.equal(v.layout.gates.length, 2);
    assert.ok(v.layout.houses.length >= 4 && v.layout.houses.some(h => h.chapel));
    assert.ok(v.layout.posts.length > 50);
    for (const h of v.layout.houses) assert.ok(Math.hypot(h.x - v.x, h.z - v.z) < HUMAN_VILLAGE.radius - 5);
  }
  const v = villages[0];
  assert.ok(!world.scatter(Math.floor(v.x / 250), Math.floor(v.z / 250)).some(n => Math.hypot(n.x - v.x, n.z - v.z) < 45), 'no trees inside');
});

test('humans drop real items and are not region wildlife', () => {
  for (const h of HUMANS) for (const id of Object.keys(h.loot)) assert.ok(ITEMS[id], id);
  assert.ok(Array.from({ length: 100 }, () => pickCreature('forest', 10, true)).every(id => !CREATURE[id].human));
});

test('trading: sell witch goods for silver, buy human goods', () => {
  const p = player('hex');
  for (const id of [...Object.keys(SELL), ...Object.keys(BUY)]) assert.ok(ITEMS[id], id);
  assert.equal(R.tradeBlocker(p, 'hide', true), 'Nothing to sell');
  R.addItem(p, 'hide', 10);
  for (let i = 0; i < 10; i++) assert.equal(R.trade(p, 'hide', true), true);
  assert.equal(R.count(p, 'silver'), 30);
  assert.equal(R.tradeBlocker(p, 'ironHatchet', false), 'Needs 40 silver');
  assert.equal(R.trade(p, 'woolCloak', false), true);
  assert.equal(R.count(p, 'silver'), 5);
  assert.ok(R.warm(p), 'a wool cloak keeps out the cold');
  assert.equal(p.stats.trades, 11);
  R.addItem(p, 'ironHatchet');
  assert.deepEqual(R.gatherYield(p, 'oak'), { wood: 5 });
});

test('souls need an empty Soul Jar; the Titan needs four witches and three souls', () => {
  const p = player('bog');
  assert.equal(R.captureSoul(p), false);
  R.addItem(p, 'moonstone'); R.addItem(p, 'slime', 2);
  assert.equal(R.craft(p, 'soulJar', new Set(['altar']), () => 1), 2);
  assert.equal(R.captureSoul(p), true);
  assert.equal(R.count(p, 'humanSoul'), 1);
  assert.equal(R.count(p, 'soulJar'), 1);
  p.skills.spellcraft = 25 * 9 ** 2; p.mana = p.maxMana = 200;
  assert.equal(R.castBlocker(p, 'titan', 3), 'Needs a coven of 4');
  assert.match(R.castBlocker(p, 'titan', 4), /Human Soul/);
  R.addItem(p, 'humanSoul', 2); R.addItem(p, 'heartSigil');
  assert.equal(R.castBlocker(p, 'titan', 4), null);
  assert.ok(R.knownSpells(p).includes('glamour') && R.knownSpells(p).at(-1) === 'titan');
});

test('glamour needs dust; calm villagers do not flee, alarmed ones do', () => {
  const p = player('wild');
  assert.match(R.castBlocker(p, 'glamour', 1), /Glamour Dust/);
  R.addItem(p, 'glamourDust');
  assert.equal(R.castBlocker(p, 'glamour', 1), null);
  const you = { x: 0, z: 0, hp: 100 }, calm = makeCreature('villager', 5, 0, { calm: true }), scared = makeCreature('villager', 5, 0, { calm: false });
  for (let i = 0; i < 60; i++) { updateCreature(calm, you, flat, 1 / 60, false, () => {}); updateCreature(scared, you, flat, 1 / 60, false, () => {}); }
  assert.notEqual(calm.state, 'flee');
  assert.equal(scared.state, 'flee');
  const hunter = makeCreature('hunter', 8, 0);
  let bitten = 0;
  for (let i = 0; i < 120; i++) updateCreature(hunter, you, flat, 1 / 60, false, d => { bitten += d; });
  assert.equal(bitten, 0, 'calm hunters leave you be');
  hunter.angry = true;
  for (let i = 0; i < 180; i++) updateCreature(hunter, you, flat, 1 / 60, false, d => { bitten += d; });
  assert.ok(bitten > 0, 'alarmed hunters attack');
});
