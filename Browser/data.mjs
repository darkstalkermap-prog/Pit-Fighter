// Static game tables: witch classes, familiars, spells, items, recipes, buildings and skills.

export const CLASSES = {
  bog: {
    name: 'Bog Witch', region: 'swamp', robe: '#3f5a2e', hat: '#232b1a', hp: 130, mana: 80, power: 1,
    blurb: 'Hardy and patient. Drains life and fills the air with rot.',
    elder: 'Old Mab Mirewater', gift: 'ironbark',
    familiar: { name: 'Grimtoad', species: 'toad', bonus: 'Poison cannot touch you.', ability: 'Toxic Tongue: your strikes and spells poison foes.' },
    spells: ['leechbolt', 'miasma'],
  },
  hex: {
    name: 'Hex Witch', region: 'darkforest', robe: '#2b1d3d', hat: '#120c1a', hp: 90, mana: 120, power: 1.2,
    blurb: 'Fragile and deadly. Curses that wither and shadows that strike.',
    elder: 'Morwen Duskveil', gift: 'gloamsight',
    familiar: { name: 'Corvin the Raven', species: 'raven', bonus: 'Undiscovered places show on your compass from anywhere.', ability: 'Eye of Night: +25% spell damage after dark.' },
    spells: ['shadowbolt', 'wither'],
  },
  bloom: {
    name: 'Bloom Witch', region: 'meadow', robe: '#b86f98', hat: '#5e3350', hp: 100, mana: 110, power: 1,
    blurb: 'Light and life. Heals her coven and burns her foes with sunfire.',
    elder: 'Elowen Brightbloom', gift: 'healing',
    familiar: { name: 'Clover the Hare', species: 'hare', bonus: 'You move 15% faster.', ability: 'Forager: herbs and berries yield double.' },
    spells: ['sunburst', 'renewal'],
  },
  wild: {
    name: 'Wild Witch', region: 'forest', robe: '#5a4426', hat: '#2d4a22', hp: 115, mana: 90, power: 1, melee: 1.3,
    blurb: 'Fierce and rooted. Thorns, bark and the hunt.',
    elder: 'Bryony Thornfoot', gift: 'swiftfoot',
    familiar: { name: 'Ember the Fox', species: 'fox', bonus: 'Hunts yield an extra meat and hide.', ability: 'Pack Hunter: Ember fights at your side.' },
    spells: ['thornlash', 'barkskin'],
  },
};

// kind: bolt (single target), aoe (around target), nova (around you), self, summon, rite.
// coven: witches needed within 25 m (you count as one). skill: Spellcraft level needed.
export const SPELLS = {
  leechbolt: { name: 'Leech Bolt', kind: 'bolt', coven: 1, skill: 1, mana: 12, cooldown: 1.2, damage: 18, lifesteal: .5, color: '#7dff6a' },
  miasma: { name: 'Miasma', kind: 'aoe', coven: 1, skill: 2, mana: 24, cooldown: 8, damage: 4, radius: 7, poison: 6, color: '#a8d84a' },
  shadowbolt: { name: 'Shadow Bolt', kind: 'bolt', coven: 1, skill: 1, mana: 12, cooldown: 1.2, damage: 26, color: '#9a6bff' },
  wither: { name: 'Withering Hex', kind: 'bolt', coven: 1, skill: 2, mana: 22, cooldown: 6, damage: 8, poison: 7, slow: 6, color: '#c03cff' },
  sunburst: { name: 'Sunburst', kind: 'aoe', coven: 1, skill: 1, mana: 14, cooldown: 2, damage: 16, radius: 5, healCoven: 8, color: '#ffd86a' },
  renewal: { name: 'Renewal', kind: 'self', coven: 1, skill: 2, mana: 20, cooldown: 10, regen: 10, duration: 6, color: '#ffb0e8' },
  thornlash: { name: 'Thorn Lash', kind: 'bolt', coven: 1, skill: 1, mana: 10, cooldown: 1, damage: 22, color: '#6ad84a' },
  barkskin: { name: 'Barkskin', kind: 'self', coven: 1, skill: 2, mana: 20, cooldown: 15, shield: .5, duration: 10, color: '#a87a4a' },
  summonbeast: { name: 'Summon Beast', kind: 'summon', coven: 2, skill: 3, mana: 30, cooldown: 30, reagent: { covenInk: 1 }, summon: 'beast', duration: 60, color: '#d6b46a' },
  binding: { name: 'Binding Circle', kind: 'nova', coven: 2, skill: 3, mana: 30, cooldown: 20, reagent: { covenInk: 1 }, damage: 25, radius: 12, root: 5, color: '#9a6bff' },
  storm: { name: 'Storm of the Three', kind: 'nova', coven: 3, skill: 5, mana: 50, cooldown: 25, reagent: { moonDust: 1 }, damage: 120, radius: 15, color: '#8fd3f4' },
  guardian: { name: 'Call the Guardian', kind: 'summon', coven: 3, skill: 5, mana: 50, cooldown: 60, reagent: { moonDust: 1, covenInk: 1 }, summon: 'guardian', duration: 90, color: '#c9c3b8' },
  grandrite: { name: 'The Grand Rite', kind: 'rite', coven: 4, skill: 7, mana: 80, cooldown: 30, reagent: { heartSigil: 1 }, damage: 400, radius: 25, breakWard: 25, color: '#ff3c6e' },
  glamour: { name: 'Glamour', kind: 'glamour', coven: 1, skill: 1, mana: 25, cooldown: 10, reagent: { glamourDust: 1 }, duration: 150, color: '#f0e0ff' },
  skyward: { name: 'Skyward Charm', kind: 'enchant', coven: 2, skill: 2, mana: 40, cooldown: 10, reagent: { feather: 4 }, color: '#bfe8ff' },
  titan: { name: 'Summon the Wyrd Titan', kind: 'summon', coven: 4, skill: 8, mana: 100, cooldown: 180, reagent: { humanSoul: 3, heartSigil: 1 }, summon: 'titan', duration: 90, color: '#7dffd8' },
};
export const COVEN_SPELLS = ['skyward', 'summonbeast', 'binding', 'storm', 'guardian', 'grandrite', 'titan'];

export const ITEMS = {
  wood: { name: 'Wood' }, stone: { name: 'Stone' }, fiber: { name: 'Fiber' }, moonstone: { name: 'Moonstone' },
  berries: { name: 'Berries', food: 8, water: 3 }, honeycomb: { name: 'Honeycomb', food: 12 },
  rawMeat: { name: 'Raw Meat', food: 10, hurt: 6 }, cookedMeat: { name: 'Cooked Meat', food: 35 },
  hide: { name: 'Hide' }, bone: { name: 'Bone' }, feather: { name: 'Feather' }, slime: { name: 'Slime' }, chitin: { name: 'Chitin' },
  silk: { name: 'Spider Silk' }, venom: { name: 'Venom Gland' }, ectoplasm: { name: 'Ectoplasm' },
  mireEssence: { name: 'Mire Essence' }, gloamEssence: { name: 'Gloam Essence' }, bloomEssence: { name: 'Bloom Essence' }, wildEssence: { name: 'Wild Essence' },
  heartfire: { name: 'Heartfire' },
  mirecap: { name: 'Mirecap', herb: 'swamp' }, bogmyrtle: { name: 'Bog Myrtle', herb: 'swamp' }, leechweed: { name: 'Leechweed', herb: 'swamp' },
  nightshade: { name: 'Nightshade', herb: 'darkforest' }, gravemoss: { name: 'Gravemoss', herb: 'darkforest' }, shadowcap: { name: 'Shadowcap', herb: 'darkforest' },
  sunpetal: { name: 'Sunpetal', herb: 'meadow' }, honeyclover: { name: 'Honeyclover', herb: 'meadow' }, dewbell: { name: 'Dewbell', herb: 'meadow' },
  wolfsbane: { name: 'Wolfsbane', herb: 'forest' }, elderberry: { name: 'Elderberry', herb: 'forest' }, fernheart: { name: 'Fernheart', herb: 'forest' },
  // Equipment: `slot` is where it is worn. Tools gather (chop/mine: yield per strike) and double as weapons.
  // `kind` is how a piece looks on the witch; `rarity` 0-4 runs grey, green, blue, purple, gold (see loot.mjs).
  hatchet: { name: 'Stone Hatchet', slot: 'tool', kind: 'hatchet', rarity: 0, chop: 3, damage: 13 }, pick: { name: 'Stone Pick', slot: 'tool', kind: 'pick', rarity: 0, mine: 3, damage: 9 },
  spear: { name: 'Hunting Spear', slot: 'weapon', kind: 'spear', rarity: 1, damage: 22, reach: 3.6 },
  staff: { name: 'Witch\'s Staff', slot: 'weapon', kind: 'staff', rarity: 1, damage: 8, power: 1.15 },
  cloak: { name: 'Hide Cloak', slot: 'cloak', kind: 'cloak', rarity: 0, armor: 2, warm: true },
  hideCap: { name: 'Hide Cap', slot: 'head', kind: 'hood', rarity: 0, armor: 4 }, boneHelm: { name: 'Bone Helm', slot: 'head', kind: 'circlet', rarity: 1, armor: 9 },
  hideJerkin: { name: 'Hide Jerkin', slot: 'chest', kind: 'jerkin', rarity: 0, armor: 10 }, chitinMail: { name: 'Chitin Mail', slot: 'chest', kind: 'mail', rarity: 1, armor: 20 },
  ironMail: { name: 'Iron Mail', slot: 'chest', kind: 'mail', rarity: 2, armor: 26 },
  hideGloves: { name: 'Hide Gloves', slot: 'hands', kind: 'gloves', rarity: 0, armor: 2 }, hideBoots: { name: 'Hide Boots', slot: 'feet', kind: 'boots', rarity: 0, armor: 2 },
  moonAmulet: { name: 'Moonstone Amulet', slot: 'amulet', kind: 'amulet', rarity: 1, mana: 25 },
  broom: { name: 'Witch\'s Broom', slot: 'mount', kind: 'broom', rarity: 0, speed: 1.7 },
  skyBroom: { name: 'Skyward Broom', slot: 'mount', kind: 'broom', rarity: 2, speed: 1.7, flySpeed: 3, flies: true },
  bandage: { name: 'Fiber Bandage', heal: 25 },
  healing: { name: 'Healing Draught', heal: 70 },
  manaTonic: { name: 'Mana Tonic', mana: 70 },
  swiftfoot: { name: 'Swiftfoot Elixir', effect: 'swift', duration: 60 },
  venomCoat: { name: 'Venom Coating', effect: 'venom', duration: 90 },
  ironbark: { name: 'Ironbark Brew', effect: 'ironbark', duration: 45 },
  gloamsight: { name: 'Gloamsight Philter', effect: 'sight', duration: 180 },
  covenInk: { name: 'Coven Ink', reagent: true }, moonDust: { name: 'Moonstone Dust', reagent: true }, heartSigil: { name: 'Heartfire Sigil', reagent: true },
  glamourDust: { name: 'Glamour Dust', reagent: true }, soulJar: { name: 'Soul Jar' }, humanSoul: { name: 'Human Soul', reagent: true },
  silver: { name: 'Silver' },
  bread: { name: 'Bread', food: 30, water: 5 }, ale: { name: 'Ale', water: 40, food: 5 },
  ironHatchet: { name: 'Iron Hatchet', slot: 'tool', kind: 'hatchet', rarity: 1, chop: 5, damage: 18 }, ironPick: { name: 'Iron Pick', slot: 'tool', kind: 'pick', rarity: 1, mine: 5, moonstone: 2, damage: 12 },
  woolCloak: { name: 'Wool Cloak', slot: 'cloak', kind: 'cloak', rarity: 1, armor: 3, warm: true },
};

// What the human merchants pay for witch goods (in silver), and what they sell.
export const SELL = { hide: 3, bone: 1, feather: 1, honeycomb: 3, cookedMeat: 2, moonstone: 6, healing: 10, manaTonic: 10, swiftfoot: 8, ironbark: 8, gloamsight: 8, venomCoat: 8, mireEssence: 12, gloamEssence: 12, bloomEssence: 12, wildEssence: 12, mirecap: 2, bogmyrtle: 2, leechweed: 2, nightshade: 2, gravemoss: 2, shadowcap: 2, sunpetal: 2, honeyclover: 2, dewbell: 2, wolfsbane: 2, elderberry: 2, fernheart: 2 };
export const BUY = { bread: 4, ale: 3, ironHatchet: 40, ironPick: 45, woolCloak: 25, ironMail: 70, bandage: 5 };

// Equipment slots, in display order. Two tool slots so a hatchet and a pick can both be carried ready.
export const SLOTS = { head: 'Head', chest: 'Chest', hands: 'Hands', feet: 'Feet', cloak: 'Cloak', amulet: 'Amulet', weapon: 'Weapon', tool1: 'Tool', tool2: 'Tool', mount: 'Mount' };

// station: null (by hand), cauldron or altar (built in your village). makes: how many one craft yields.
export const RECIPES = [
  { id: 'hatchet', needs: { wood: 3, stone: 3, fiber: 4 } },
  { id: 'pick', needs: { wood: 3, stone: 5, fiber: 4 } },
  { id: 'spear', needs: { wood: 5, stone: 2, fiber: 6 } },
  { id: 'staff', needs: { wood: 6, feather: 3, fiber: 4 } },
  { id: 'cloak', needs: { hide: 4, fiber: 6 } },
  { id: 'bandage', needs: { fiber: 5 } },
  { id: 'hideCap', needs: { hide: 2, fiber: 2 } },
  { id: 'hideJerkin', needs: { hide: 6, fiber: 4 } },
  { id: 'hideGloves', needs: { hide: 2, fiber: 1 } },
  { id: 'hideBoots', needs: { hide: 2, fiber: 2 } },
  { id: 'boneHelm', needs: { bone: 5, hide: 1 } },
  { id: 'chitinMail', needs: { chitin: 6, silk: 2, hide: 2 } },
  { id: 'moonAmulet', needs: { moonstone: 2, silk: 1 } },
  { id: 'broom', needs: { wood: 8, fiber: 6, feather: 4 } },
  { id: 'healing', station: 'cauldron', needs: { sunpetal: 2, honeyclover: 1 } },
  { id: 'manaTonic', station: 'cauldron', needs: { dewbell: 2, mirecap: 1 } },
  { id: 'swiftfoot', station: 'cauldron', needs: { fernheart: 2, honeycomb: 1 } },
  { id: 'venomCoat', station: 'cauldron', needs: { leechweed: 2, venom: 1 } },
  { id: 'ironbark', station: 'cauldron', needs: { bogmyrtle: 2, elderberry: 1 } },
  { id: 'gloamsight', station: 'cauldron', needs: { shadowcap: 2, nightshade: 1 } },
  { id: 'covenInk', station: 'cauldron', needs: { gravemoss: 1, wolfsbane: 1, feather: 1 }, makes: 2 },
  { id: 'glamourDust', station: 'cauldron', needs: { dewbell: 1, nightshade: 1, feather: 1 }, makes: 2 },
  { id: 'soulJar', station: 'altar', needs: { moonstone: 1, slime: 2 }, makes: 2 },
  { id: 'moonDust', station: 'altar', needs: { moonstone: 2, ectoplasm: 1 }, makes: 2 },
  { id: 'heartSigil', station: 'altar', needs: { heartfire: 1, mireEssence: 1, gloamEssence: 1, bloomEssence: 1, wildEssence: 1 }, makes: 3 },
];

// village: must stand within VILLAGE_RADIUS of your Village Heart. skill: Building level needed.
export const VILLAGE_RADIUS = 60;
export const BUILDINGS = {
  heart: { name: 'Village Heart', needs: { wood: 10, stone: 10 }, skill: 1, size: 1.5, text: 'Founds your village. Others must be built near it.' },
  campfire: { name: 'Campfire', needs: { wood: 6, stone: 4 }, skill: 1, size: .8, anywhere: true, text: 'Cook meat [E]. Keeps the cold away.' },
  cauldron: { name: 'Cauldron', needs: { stone: 8, wood: 4 }, skill: 1, size: 1, text: 'Brew potions and Coven Ink.' },
  palisade: { name: 'Palisade', needs: { wood: 6 }, skill: 1, size: 2, wall: true, text: 'A 4 m wall section.' },
  lantern: { name: 'Lantern Post', needs: { wood: 2, slime: 1 }, skill: 1, size: .3, text: 'A witch-light.' },
  hut: { name: 'Witch Hut', needs: { wood: 20, fiber: 10, hide: 2 }, skill: 2, size: 3, text: 'Rest fully [E]. You return here if you fall.' },
  well: { name: 'Well', needs: { stone: 12 }, skill: 2, size: 1.2, text: 'Drink [E].' },
  garden: { name: 'Herb Garden', needs: { wood: 6, fiber: 6 }, skill: 2, size: 2, text: 'Grows herbs of your homeland. Harvest [E].' },
  totem: { name: 'Warding Totem', needs: { wood: 8, bone: 4 }, skill: 3, size: .6, text: 'Beasts will not come within 30 m.' },
  altar: { name: 'Ritual Altar', needs: { stone: 15, moonstone: 3 }, skill: 4, size: 1.8, text: 'Make Moonstone Dust and Heartfire Sigils.' },
};

export const SKILLS = {
  gathering: { name: 'Gathering', text: 'More wood and stone per strike.' },
  herbalism: { name: 'Herbalism', text: 'More herbs per plant.' },
  hunting: { name: 'Hunting', text: 'More damage to beasts.' },
  alchemy: { name: 'Alchemy', text: 'Chance of an extra potion.' },
  spellcraft: { name: 'Spellcraft', text: 'Stronger spells; unlocks coven rites.' },
  building: { name: 'Building', text: 'Unlocks new buildings.' },
};
