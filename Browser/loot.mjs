// Gear dropped by creatures: armor and weapons scaled to the creature's level, in five rarities from grey (worst)
// to gold (best). Each piece is generated once and kept in the player's save (`p.gear`), and registered in ITEMS
// so the rest of the game treats it like any other item.
import { ITEMS } from './data.mjs';

export const RARITIES = [
  { name: 'Poor', color: '#9d9d9d', mult: .7, affixes: 0, value: 1 },
  { name: 'Uncommon', color: '#3fc75a', mult: 1, affixes: 1, value: 3 },
  { name: 'Rare', color: '#4d94ff', mult: 1.3, affixes: 1, value: 8 },
  { name: 'Epic', color: '#b45cff', mult: 1.65, affixes: 2, value: 20 },
  { name: 'Legendary', color: '#ffb43a', mult: 2.1, affixes: 3, value: 50 },
];

// What can drop. `kind` is also how the piece looks on the hero. `main` is its chief stat; `scale` weights it.
export const BASES = [
  { kind: 'hat', slot: 'head', name: 'Hat', main: 'spell' },
  { kind: 'hood', slot: 'head', name: 'Hood', main: 'mana' },
  { kind: 'circlet', slot: 'head', name: 'Circlet', main: 'armor', scale: .45 },
  { kind: 'robe', slot: 'chest', name: 'Robe', main: 'spell', armor: .4 },
  { kind: 'jerkin', slot: 'chest', name: 'Jerkin', main: 'armor', scale: .8 },
  { kind: 'mail', slot: 'chest', name: 'Mail', main: 'armor', scale: 1.1 },
  { kind: 'gloves', slot: 'hands', name: 'Gloves', main: 'armor', scale: .3 },
  { kind: 'bracers', slot: 'hands', name: 'Bracers', main: 'spell' },
  { kind: 'boots', slot: 'feet', name: 'Boots', main: 'armor', scale: .3 },
  { kind: 'cloak', slot: 'cloak', name: 'Cloak', main: 'armor', scale: .25, warm: true },
  { kind: 'amulet', slot: 'amulet', name: 'Amulet', main: 'mana' },
  { kind: 'staff', slot: 'weapon', name: 'Staff', main: 'power', damage: .6 },
  { kind: 'wand', slot: 'weapon', name: 'Wand', main: 'power', powerScale: 1.25, damage: .4 },
  { kind: 'sickle', slot: 'weapon', name: 'Sickle', main: 'damage' },
  { kind: 'spear', slot: 'weapon', name: 'Spear', main: 'damage', scale: 1.15, reach: 3.6 },
];

// Stat formulas by item level (the creature's level) and rarity multiplier.
const STAT = {
  armor: (L, m, s = 1) => Math.max(1, Math.round((2 + L * 1.2) * s * m)),
  damage: (L, m, s = 1) => Math.round((10 + L * 2.6) * s * m),
  power: (L, m, s = 1) => Math.round((1 + (.06 + L * .015) * s * m) * 100) / 100,
  spell: (L, m) => Math.round((2 + L * .8) * m),
  mana: (L, m) => Math.round((8 + L * 3) * m),
  health: (L, m) => Math.round((6 + L * 3) * m),
  haste: (L, m) => Math.round((2 + L * .3) * m),
};
const AFFIX_NAMES = { health: 'the Bear', mana: 'the Moon', spell: 'Sorcery', armor: 'Warding', haste: 'the Hare' };
const WORDS = {
  swamp: ['Bogwoven', 'Mire-Touched', 'Fenmoss', 'Leechbane'], darkforest: ['Gloamthread', 'Duskbound', 'Ravencall', 'Nightveil'],
  meadow: ['Sunwoven', 'Bloomkissed', 'Dewlit', 'Honeyed'], forest: ['Thornbark', 'Wildhide', 'Oakheart', 'Wolfsbane'],
  human: ['Hunter\'s', 'Ironbound', 'Chapel-Blessed', 'Warden\'s'], crown: ['Crownforged', 'Heartfire', 'Voidtouched', 'Unmade'],
};
const POOR = ['Tattered', 'Frayed', 'Cracked', 'Worn'];
const LEGENDS = ['Vesper', 'Morwyn', 'Grandmother Thorne', 'Ysolde', 'Old Ashe', 'Hollowmere', 'Sable'];
const pick = (list, random) => list[Math.floor(random() * list.length)];

// Rarity odds rise with level; elites and the boss skip grey and favour purple and gold.
export function rollRarity(level, { elite = false, boss = false } = {}, random = Math.random) {
  const w = [elite || boss ? 0 : Math.max(5, 60 - 5 * level), 30, 8 + 1.5 * level, 1 + .8 * level + (elite ? 20 : 0), (level >= 6 ? .3 * level : 0) + (elite ? 8 : 0)];
  if (boss) { w[1] = 0; w[2] = 0; w[3] = 60; w[4] = 40; }
  let roll = random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) if ((roll -= w[i]) < 0) return i;
  return 0;
}

export function generateGear(level, { region = 'forest', rarity, elite = false, boss = false, random = Math.random } = {}) {
  const r = rarity ?? rollRarity(level, { elite, boss }, random), R = RARITIES[r], base = pick(BASES, random), L = Math.max(1, Math.round(level));
  const def = { id: `g${Math.floor(random() * 2 ** 40).toString(36)}${Date.now().toString(36).slice(-4)}`, slot: base.slot, kind: base.kind, rarity: r, level: L, generated: true };
  if (base.main === 'armor') def.armor = STAT.armor(L, R.mult, base.scale);
  if (base.armor) def.armor = STAT.armor(L, R.mult, base.armor * .3);
  if (base.main === 'damage') { def.damage = STAT.damage(L, R.mult, base.scale); def.reach = base.reach; }
  if (base.main === 'power') { def.power = STAT.power(L, R.mult, base.powerScale); def.damage = STAT.damage(L, R.mult, base.damage); }
  if (base.main === 'spell') def.spell = STAT.spell(L, R.mult);
  if (base.main === 'mana') def.mana = STAT.mana(L, R.mult);
  if (base.warm) def.warm = true;
  if (!def.reach) delete def.reach;
  // Extra stats ("affixes") for green and above, never repeating the main one.
  const pool = Object.keys(AFFIX_NAMES).filter(k => k !== base.main && !(k === 'armor' && def.armor));
  const affixes = [];
  for (let i = 0; i < R.affixes && pool.length; i++) {
    const k = pool.splice(Math.floor(random() * pool.length), 1)[0];
    def[k] = (def[k] ?? 0) + (k === 'armor' ? STAT.armor(L, R.mult * .6, .3) : STAT[k](L, R.mult * .5));
    affixes.push(k);
  }
  const word = pick(WORDS[region] ?? WORDS.forest, random);
  def.name = r === 0 ? `${pick(POOR, random)} ${base.name}`
    : r === 4 ? `${pick(LEGENDS, random)}'s ${base.name}`
      : r >= 2 && affixes.length ? `${word} ${base.name} of ${AFFIX_NAMES[affixes[0]]}` : `${word} ${base.name}`;
  def.value = Math.max(1, Math.round(L * R.value * .6));
  return def;
}

// Whether a slain creature drops gear, and what. `b` is its bestiary entry.
export function dropGear(b, random = Math.random) {
  const boss = b.id === 'unwitch', chance = boss || b.elite ? 1 : .16 + b.level * .02;
  if (random() >= chance) return null;
  return generateGear(b.level, { region: boss ? 'crown' : b.region, elite: b.elite, boss, random });
}

// Put a generated piece in the pack and make it known to ITEMS.
export function addGear(p, def) {
  (p.gear ??= {})[def.id] = def;
  ITEMS[def.id] = def;
  p.inv[def.id] = (p.inv[def.id] ?? 0) + 1;
}
// After loading a save: make its generated pieces known again.
export function registerGear(p) { for (const def of Object.values(p.gear ?? {})) ITEMS[def.id] = def; }
// Forget a generated piece that is no longer carried or worn.
export function forgetGear(p, id) {
  if (!p.gear?.[id] || p.inv[id] || Object.values(p.equip ?? {}).includes(id)) return;
  delete p.gear[id];
}

// Break a piece down for materials. Returns what it gave, or null if it can't be salvaged.
export function salvage(p, id) {
  const def = ITEMS[id];
  if (!def?.slot || def.slot === 'mount' || def.slot === 'tool' || !p.inv[id]) return null;
  p.inv[id]--; if (!p.inv[id]) delete p.inv[id];
  forgetGear(p, id);
  const n = 1 + (def.rarity ?? 0), material = def.slot === 'weapon' ? 'wood' : def.kind === 'mail' || def.kind === 'circlet' ? 'stone' : ['robe', 'hat', 'hood', 'cloak'].includes(def.kind) ? 'fiber' : 'hide';
  p.inv[material] = (p.inv[material] ?? 0) + n;
  return { [material]: n };
}

// What a witch looks like: for each visible slot, the kind of piece and its rarity. Sent to other players
// as a short string, e.g. "head:hat:3|chest:mail:2".
const LOOK_SLOTS = ['head', 'chest', 'hands', 'feet', 'cloak', 'amulet', 'weapon', 'mount'];
export function lookOf(p) {
  const look = {};
  for (const slot of LOOK_SLOTS) {
    const def = ITEMS[p.equip?.[slot]];
    if (def) look[slot] = [def.kind ?? slot, def.rarity ?? 0];
  }
  if (!look.weapon) { const tool = ITEMS[p.equip?.tool1] ?? ITEMS[p.equip?.tool2]; if (tool) look.weapon = [tool.kind, tool.rarity ?? 0]; }
  return look;
}
export const encodeLook = look => Object.entries(look).map(([slot, [kind, rarity]]) => `${slot}:${kind}:${rarity}`).join('|');
export function decodeLook(text) {
  const look = {};
  for (const part of String(text ?? '').split('|')) {
    const [slot, kind, rarity] = part.split(':');
    if (LOOK_SLOTS.includes(slot) && /^[a-z]{2,12}$/i.test(kind ?? '')) look[slot] = [kind, Math.max(0, Math.min(4, Number(rarity) | 0))];
  }
  return look;
}
