import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, HALF, CELL, WATER, REGIONS, NODES, HUMAN_VILLAGE, WORLD_SIZE, ZONES, ZONE_LEVELS } from './world.mjs';
import { CLASSES, SPELLS, RECIPES, BUILDINGS, ITEMS, SELL, BUY } from './data.mjs';
import { BESTIARY, CREATURE, HUMANS } from './bestiary.mjs';
import * as R from './rules.mjs';
import { makeCreature, updateCreature, hurtCreature, pickCreature, makeAlly, updateAlly, WEAKENED } from './creatures.mjs';

const world = createWorld(1337);
const flat = () => 10;
const player = cls => R.newPlayer(cls, { x: 0, z: 0 });

test('world generation is deterministic', () => {
  const other = createWorld(1337);
  for (const [x, z] of [[0, 0], [1234.5, -987.25], [-4000, 3500]]) assert.equal(world.height(x, z), other.height(x, z));
  assert.deepEqual(world.scatter(3, -2), other.scatter(3, -2));
});

test('the island is four regions around the Crown, ringed by sea', () => {
  assert.equal(WORLD_SIZE, 5000, 'a quarter of the old 10 km island');
  for (const [x, z] of [[HALF - 10, 0], [0, -HALF + 10], [-HALF + 10, HALF - 10]]) assert.ok(world.height(x, z) < WATER, 'edges are sea');
  const q = HALF * .55;
  assert.equal(world.region(-q, -q), 'darkforest');
  assert.equal(world.region(q, -q), 'forest');
  assert.equal(world.region(-q, q), 'swamp');
  assert.equal(world.region(q, q), 'meadow');
  assert.ok(world.height(0, 0) > 250, 'Crown is a high summit');
  assert.ok(Math.abs(world.height(30, 20) - world.height(0, 0)) < 1, 'summit arena is flat');
  assert.equal(world.danger(0, 0), 12);
  assert.equal(world.danger(HALF, HALF), 1);
});

test('water is never far: a pond by every hearth, and lakes all over the lowlands', () => {
  const waterWithin = (x, z, r) => { for (let d = 5; d <= r; d += 5) for (let a = 0; a < Math.PI * 2; a += 4 / d) if (world.ground(x + Math.cos(a) * d, z + Math.sin(a) * d) < -.2) return true; return false; };
  for (const id of Object.keys(REGIONS)) { const h = world.hearthOf(id); assert.ok(waterWithin(h.x, h.z, 150), `water by ${h.name}`); }
  let far = 0, land = 0;
  for (let x = -HALF * .7; x <= HALF * .7; x += 250) for (let z = -HALF * .7; z <= HALF * .7; z += 250) if (world.ground(x, z) > 0 && Math.hypot(x, z) > 700) { land++; if (!waterWithin(x, z, 500)) far++; }
  assert.ok(far / land < .05, `${far} of ${land} lowland spots are over 500 m from water`);
});

test('the map is zoned by level: three rings in each land, then the Crown', () => {
  assert.deepEqual(ZONE_LEVELS.flat(), [1, 3, 4, 7, 8, 11, 12, 15], 'ranges run 1 to 15 without gaps');
  for (const id of Object.keys(REGIONS)) {
    const h = world.hearthOf(id), z = world.zone(h.x, h.z);
    assert.deepEqual([z.name, z.region, z.min, z.max], [ZONES[id][0], id, 1, 3], `${h.name} is in the starting zone`);
  }
  assert.deepEqual([world.zone(0, 0).name, world.zone(0, 0).min, world.zone(0, 0).max], ['The Crown', 12, 15]);
  // Every creature level a place can spawn falls in its zone's range, and zones rise towards the centre.
  for (let i = 0; i < 400; i++) {
    const a = i * 2.39996, r = (i / 400) * HALF * .9, x = Math.cos(a) * r, z = Math.sin(a) * r, zone = world.zone(x, z), d = world.danger(x, z);
    assert.ok(d >= zone.min && d <= zone.max, `danger ${d} inside ${zone.name} ${zone.min}-${zone.max}`);
  }
  const names = new Set(Object.values(ZONES).flat());
  assert.equal(names.size, 12, 'twelve named zones');
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
  R.addItem(p, 'pick'); R.equip(p, 'pick');
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

test('the Hex Witch\'s Withering Hex weakens what it curses', () => {
  const you = { x: 0, z: 0, hp: 100 }, bites = kind => {
    const wolf = makeCreature('wolf', 1, 0), hits = [];
    if (kind) hurtCreature(wolf, 1, { weaken: SPELLS.wither.weaken });
    for (let i = 0; i < 240; i++) updateCreature(wolf, you, flat, 1 / 60, false, d => hits.push(d));
    return hits;
  };
  const plain = bites(false), cursed = bites(true);
  assert.equal(cursed[0], plain[0] * WEAKENED, 'cursed bites land soft');
  assert.ok(SPELLS.wither.weaken >= SPELLS.wither.cooldown, 'one cast keeps the curse up until the next');
  assert.ok(CLASSES.hex.hp >= 100);
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
  assert.ok(!R.warm(p), 'a cloak in the pack does nothing');
  R.equip(p, 'woolCloak');
  assert.ok(R.warm(p), 'a worn wool cloak keeps out the cold');
  assert.equal(p.stats.trades, 11);
  R.addItem(p, 'ironHatchet'); R.equip(p, 'ironHatchet');
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
  assert.ok(R.knownSpells(p).includes('glamour') && R.knownSpells(p).includes('titan'));
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

test('equipment: only worn gear counts; two tool slots; armor reduces damage', () => {
  const p = player('wild');
  for (const id of ['hatchet', 'pick', 'ironHatchet', 'spear', 'staff', 'hideJerkin', 'boneHelm', 'moonAmulet']) R.addItem(p, id);
  assert.deepEqual(R.gatherYield(p, 'oak'), { wood: 1 }, 'carried, not equipped');
  assert.equal(R.equip(p, 'hatchet'), 'tool1');
  assert.equal(R.equip(p, 'pick'), 'tool2');
  assert.deepEqual(R.gatherYield(p, 'oak'), { wood: 3 });
  assert.deepEqual(R.gatherYield(p, 'rock'), { stone: 3 });
  assert.equal(R.equip(p, 'ironHatchet'), 'tool1', 'both tool slots full: the first is swapped');
  assert.equal(R.count(p, 'hatchet'), 1, 'the old hatchet goes back to the pack');
  assert.deepEqual(R.gatherYield(p, 'oak'), { wood: 5 });
  assert.equal(R.weapon(p).damage, 18 * 1.3, 'no weapon: strike with the best tool (Wild Witch melee x1.3)');
  R.equip(p, 'spear');
  assert.equal(R.weapon(p).name, 'spear');
  R.equip(p, 'staff');
  assert.equal(R.count(p, 'spear'), 1, 'one weapon at a time');
  assert.ok(R.spellPower(p) > R.spellPower({ ...p, equip: {} }));
  const mana = p.maxMana;
  R.equip(p, 'moonAmulet');
  assert.equal(p.maxMana, mana + 25);
  R.unequip(p, 'amulet');
  assert.equal(p.maxMana, mana);
  R.equip(p, 'hideJerkin'); R.equip(p, 'boneHelm');
  assert.equal(R.armor(p), 19);
  p.hp = 100; R.damagePlayer(p, 69);
  assert.equal(Math.round(100 - p.hp), 50, 'armor 19 turns 69 damage into 50');
});

test('new crafts equip themselves when their slot is free', () => {
  const p = player('hex');
  Object.assign(p.inv, { hide: 4, fiber: 4 });
  R.craft(p, 'hideCap');
  assert.equal(R.autoEquip(p, 'hideCap'), 'head');
  R.addItem(p, 'boneHelm');
  assert.equal(R.autoEquip(p, 'boneHelm'), false, 'never replaces worn gear on its own');
});

test('old saves put on the best gear they carry', () => {
  const p = player('bog');
  delete p.equip;
  Object.assign(p.inv, { hatchet: 1, ironHatchet: 1, pick: 1, cloak: 1, spear: 1 });
  R.ensureEquip(p);
  assert.deepEqual(Object.values(p.equip).sort(), ['cloak', 'ironHatchet', 'pick', 'spear']);
  assert.equal(R.count(p, 'hatchet'), 1);
});

test('the broom: 70% faster ridden; the two-witch Skyward Charm makes it fly for good, 200% faster', () => {
  const p = player('bloom');
  assert.match(R.mountBlocker(p), /Mount slot/);
  Object.assign(p.inv, { wood: 8, fiber: 6, feather: 4 });
  assert.equal(R.craft(p, 'broom'), 1);
  R.equip(p, 'broom');
  assert.equal(R.mountBlocker(p, { swimming: true }), 'You cannot mount while swimming');
  assert.equal(R.mountBlocker(p), null);
  const walk = R.moveSpeedFactor(p);
  p.mounted = true;
  assert.ok(Math.abs(R.moveSpeedFactor(p) / walk - 1.7) < 1e-9);
  assert.match(R.flightBlocker(p), /Skyward Charm/, 'a plain broom only skims the ground');
  p.skills.spellcraft = 25 * 2 ** 2; p.mana = p.maxMana;
  assert.equal(R.castBlocker(p, 'skyward', 1), 'Needs a coven of 2');
  assert.match(R.castBlocker(p, 'skyward', 2), /Feather/);
  R.addItem(p, 'feather', 4);
  assert.equal(R.castBlocker(p, 'skyward', 2), null);
  R.payCast(p, 'skyward');
  assert.equal(R.enchantBroom(p), true);
  assert.equal(p.equip.mount, 'skyBroom');
  assert.equal(R.flightBlocker(p), null, 'it now flies, with no second witch needed');
  p.flying = true;
  assert.ok(Math.abs(R.moveSpeedFactor(p) / walk - 3) < 1e-9, 'flying is 200% faster than walking');
  p.flying = false;
  assert.ok(Math.abs(R.moveSpeedFactor(p) / walk - 1.7) < 1e-9, 'on the ground it rides like any broom');
  p.cooldowns = {};
  assert.equal(R.castBlocker(p, 'skyward', 2), 'Your broom already flies');
  R.unequip(p, 'mount');
  assert.equal(p.mounted, false, 'taking the broom off dismounts');
  assert.equal(R.count(p, 'skyBroom'), 1);
});

test('every hearth starts with enough close by for a broom: wood, fiber and feathers', () => {
  for (const id of Object.keys(REGIONS)) {
    const h = world.hearthOf(id), got = { wood: 0, fiber: 0, feather: 0 };
    for (let cx = Math.floor((h.x - 200) / 250); cx <= Math.floor((h.x + 200) / 250); cx++)
      for (let cz = Math.floor((h.z - 200) / 250); cz <= Math.floor((h.z + 200) / 250); cz++)
        for (const n of world.scatter(cx, cz)) {
          if (Math.hypot(n.x - h.x, n.z - h.z) > 150) continue;
          const yields = NODES[n.type].yields;
          if (yields in got) got[yields] += NODES[n.type].hp * (yields === 'feather' || yields === 'fiber' ? 2 : 1);
        }
    assert.ok(got.wood >= 8 && got.fiber >= 6 && got.feather >= 4, `${h.name} within 150 m: ${JSON.stringify(got)}`);
  }
  const p = player('wild');
  assert.deepEqual(R.gatherYield(p, 'nest'), { feather: 2 });
});

import { RARITIES, BASES, rollRarity, generateGear, dropGear, addGear, registerGear, salvage, lookOf, encodeLook, decodeLook } from './loot.mjs';

test('gear rarities run grey to gold, and better rarity and level mean better stats', () => {
  assert.deepEqual(RARITIES.map(r => r.name), ['Poor', 'Uncommon', 'Rare', 'Epic', 'Legendary']);
  const mail = (level, rarity) => { let g; do g = generateGear(level, { rarity }); while (g.kind !== 'mail'); return g; };
  for (let r = 1; r < 5; r++) assert.ok(mail(8, r).armor > mail(8, r - 1).armor, `rarity ${r} beats ${r - 1}`);
  assert.ok(mail(12, 2).armor > mail(2, 2).armor, 'higher level, more armor');
  assert.equal(new Set(BASES.map(b => b.slot)).size, 7, 'drops cover head, chest, hands, feet, cloak, amulet and weapon');
  const g = generateGear(10, { rarity: 4, region: 'swamp' });
  assert.match(g.name, /'s /, 'legendaries carry a name');
  assert.ok(g.value > generateGear(10, { rarity: 1 }).value);
});

test('rarity odds: no grey from elites, purple and gold from the boss, gold only from higher levels', () => {
  const roll = (level, opts) => Array.from({ length: 3000 }, (_, i) => rollRarity(level, opts, () => (i + .5) / 3000));
  assert.ok(!roll(1).includes(4), 'no gold at level 1');
  assert.ok(roll(10).includes(4));
  assert.ok(!roll(12, { elite: true }).includes(0));
  assert.ok(roll(15, { boss: true }).every(r => r >= 3));
  const elite = BESTIARY.find(b => b.elite), wolf = CREATURE.wolf;
  assert.ok(dropGear(elite, () => .99), 'elites always drop');
  assert.equal(dropGear(wolf, () => .99), null);
  assert.equal(dropGear(wolf, () => 0).level, wolf.level, 'gear level is the creature level');
});

test('generated gear lives in the save, equips with its bonuses, sells and salvages', () => {
  const p = player('hex'), g = generateGear(9, { rarity: 3 });
  addGear(p, g);
  assert.equal(R.count(p, g.id), 1);
  const saved = JSON.parse(JSON.stringify(p));
  delete ITEMS[g.id];
  registerGear(saved);
  assert.equal(ITEMS[g.id].name, g.name, 'reloaded from the save');
  const hp = p.maxHp, mana = p.maxMana;
  R.equip(p, g.id);
  assert.equal(p.maxHp, hp + (g.health ?? 0));
  assert.equal(p.maxMana, mana + (g.mana ?? 0));
  R.unequip(p, g.slot === 'tool' ? 'tool1' : g.slot);
  assert.equal(p.maxHp, hp);
  assert.equal(R.sellPrice(g.id), g.value);
  const got = salvage(p, g.id);
  assert.ok(Object.values(got)[0] === 4, 'epic salvages for 4 materials');
  assert.equal(p.gear[g.id], undefined, 'gone from the save once broken down');
});

test('the look of a witch: what she wears, shared as a short string', () => {
  const p = player('bloom');
  R.addItem(p, 'staff'); R.equip(p, 'staff'); R.addItem(p, 'ironMail'); R.equip(p, 'ironMail');
  const look = lookOf(p);
  assert.deepEqual(look, { chest: ['mail', 2], weapon: ['staff', 1] });
  assert.deepEqual(decodeLook(encodeLook(look)), look);
  assert.deepEqual(decodeLook('head:<script>:9|chest:robe:9|nope:hat:1'), { chest: ['robe', 4] }, 'bad parts are dropped, rarity clamped');
});

test('each sister\'s gift is brewed from her own land\'s herbs, and your elder sends Glamour Dust for the first trade', () => {
  for (const k of Object.values(CLASSES)) {
    const herbs = Object.keys(RECIPES.find(r => r.id === k.gift).needs);
    assert.ok(herbs.every(h => ITEMS[h].herb === k.region), `${k.gift} is made from ${REGIONS[k.region].name} herbs`);
  }
  const p = player('wild');
  p.quest = R.QUESTS.findIndex(q => q.title === 'The Cauldron Bubbles');
  p.stats.built.cauldron = 1; p.stats.brewed = 1;
  assert.equal(R.checkQuest(p).title, 'The Cauldron Bubbles');
  assert.equal(R.count(p, 'glamourDust'), 2);
});

test('alone, any spell can be cast once its materials are met', () => {
  const p = player('wild');
  p.mana = p.maxMana = 999;
  assert.equal(R.castBlocker(p, 'binding', 1), 'Needs Spellcraft 3');
  assert.match(R.castBlocker(p, 'binding', 1, { solo: true }), /Coven Ink/, 'solo: only the materials are asked');
  R.addItem(p, 'covenInk');
  assert.equal(R.castBlocker(p, 'binding', 1, { solo: true }), null);
  Object.assign(p.inv, { heartSigil: 1, humanSoul: 3 });
  assert.equal(R.castBlocker(p, 'grandrite', 1, { solo: true }), null);
  assert.equal(R.castBlocker(p, 'titan', 1, { solo: true }), null);
  p.mana = 0;
  assert.equal(R.castBlocker(p, 'binding', 1, { solo: true }), 'Not enough mana');
});
