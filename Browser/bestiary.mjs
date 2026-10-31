// Ten creatures for each witch region. The tenth of each is an elite that guards the region's lair.
// plan: body shape used by the renderer. temper: timid (flees), provoked (fights back), hostile (hunts you).
// night: only appears after dark. fly: hovers above ground. poison: bites apply poison.

const c = (id, name, region, level, plan, size, color, accent, temper, loot, extra = {}) => ({
  id, name, region, level, plan, size, color, accent, temper, loot,
  hp: Math.round((18 + level * 14) * (extra.elite ? 9 : 1) * (extra.tough ?? 1)),
  damage: temper === 'timid' ? 0 : Math.round((3 + level * 2.2) * (extra.elite ? 2 : 1)),
  speed: extra.speed ?? 7,
  xp: Math.round((8 + level * 9) * (extra.elite ? 8 : 1)),
  ...extra,
});

export const BESTIARY = [
  // The Mirefen — swamp
  c('bogtoad', 'Bog Toad', 'swamp', 1, 'blob', .6, '#5c7a3a', '#c9b45a', 'timid', { slime: 1 }, { speed: 4 }),
  c('heron', 'Marsh Heron', 'swamp', 2, 'bird', .9, '#9aa7a8', '#d8c27a', 'timid', { feather: 2, rawMeat: 1 }, { speed: 8 }),
  c('leech', 'Mire Leech', 'swamp', 2, 'serpent', .5, '#3a2a2a', '#7a3a3a', 'hostile', { slime: 2 }, { speed: 4, poison: true }),
  c('mudboar', 'Mudback Boar', 'swamp', 3, 'quad', 1, '#4a3a2a', '#e8e0c8', 'provoked', { rawMeat: 3, hide: 1 }, { tusks: true, speed: 6.5 }),
  c('fencrawler', 'Fen Crawler', 'swamp', 4, 'spider', .9, '#4b4a2a', '#a8d84a', 'hostile', { chitin: 2, venom: 1 }, { poison: true, speed: 6 }),
  c('wisp', 'Will-o\'-Wisp', 'swamp', 5, 'wisp', .6, '#b8ff9a', '#ffffff', 'hostile', { ectoplasm: 1, mireEssence: 1 }, { night: true, fly: true, speed: 6, glow: true }),
  c('bogserpent', 'Bog Serpent', 'swamp', 6, 'serpent', 1.6, '#2f4a2a', '#c9d84a', 'hostile', { hide: 2, venom: 2 }, { poison: true, speed: 6 }),
  c('shambler', 'Rotting Shambler', 'swamp', 7, 'biped', 1.2, '#4a5a3a', '#2a2a1a', 'hostile', { slime: 2, bone: 2, mireEssence: 1 }, { speed: 4.5, tough: 1.3 }),
  c('mosstroll', 'Moss Troll', 'swamp', 9, 'biped', 2, '#4f6a3a', '#8a7a5a', 'provoked', { hide: 3, bone: 3, mireEssence: 1 }, { speed: 5, tough: 1.5 }),
  c('fenwyrm', 'Grendlemaw the Fen Wyrm', 'swamp', 12, 'serpent', 3.4, '#1f3a2a', '#e8d84a', 'hostile', { heartfire: 1, hide: 4, mireEssence: 3 }, { elite: true, poison: true, speed: 6 }),

  // The Gloamwood — dark forest
  c('gloombat', 'Gloom Bat', 'darkforest', 1, 'bird', .5, '#2a2230', '#6a4a7a', 'hostile', { hide: 1 }, { fly: true, speed: 7 }),
  c('shadowhare', 'Shadow Hare', 'darkforest', 1, 'quad', .45, '#3a3440', '#b0a0c0', 'timid', { rawMeat: 1, hide: 1 }, { ears: true, speed: 9 }),
  c('gravecrow', 'Gravecrow', 'darkforest', 2, 'bird', .7, '#1a1a22', '#c8c040', 'provoked', { feather: 2 }, { fly: true, speed: 8 }),
  c('duskwolf', 'Duskwolf', 'darkforest', 3, 'quad', .9, '#2e2a36', '#9a6bff', 'hostile', { rawMeat: 1, hide: 2 }, { ears: true, tail: true, speed: 8.5 }),
  c('webweaver', 'Webweaver', 'darkforest', 3, 'spider', 1, '#2a2028', '#d0d0d0', 'hostile', { silk: 2, chitin: 1 }, { speed: 6 }),
  c('hollowstag', 'Hollow Stag', 'darkforest', 5, 'quad', 1.3, '#3a3036', '#d9c7a4', 'provoked', { rawMeat: 2, hide: 2, bone: 1 }, { antlers: true, speed: 8 }),
  c('gloamstalker', 'Gloam Stalker', 'darkforest', 6, 'quad', 1.2, '#1e1a26', '#9a6bff', 'hostile', { hide: 3, gloamEssence: 1 }, { tail: true, ears: true, speed: 9 }),
  c('revenant', 'Bone Revenant', 'darkforest', 7, 'biped', 1.1, '#d8d0c0', '#5a2a6a', 'hostile', { bone: 3, ectoplasm: 1 }, { speed: 5 }),
  c('shade', 'Night Hag\'s Shade', 'darkforest', 8, 'wisp', 1.2, '#4a2a6a', '#e0c0ff', 'hostile', { ectoplasm: 2, gloamEssence: 1 }, { night: true, fly: true, glow: true, speed: 6.5 }),
  c('mournhide', 'Old Mournhide the Shadow Bear', 'darkforest', 12, 'quad', 2.6, '#1a1620', '#9a6bff', 'hostile', { heartfire: 1, hide: 5, gloamEssence: 3 }, { elite: true, ears: true, speed: 7 }),

  // Springvale Meadows
  c('rabbit', 'Meadow Rabbit', 'meadow', 1, 'quad', .4, '#b89a72', '#ffffff', 'timid', { rawMeat: 1, hide: 1 }, { ears: true, speed: 9 }),
  c('bumbledrone', 'Bumble Drone', 'meadow', 1, 'insect', .5, '#e8b83a', '#2a2a1a', 'provoked', { honeycomb: 1 }, { fly: true, speed: 6, poison: true }),
  c('springdeer', 'Spring Deer', 'meadow', 2, 'quad', 1, '#b07a48', '#f2e6cc', 'timid', { rawMeat: 2, hide: 1 }, { antlers: true, speed: 8 }),
  c('pheasant', 'Gilded Pheasant', 'meadow', 2, 'bird', .6, '#b8602a', '#e8c84a', 'timid', { feather: 3, rawMeat: 1 }, { speed: 7 }),
  c('hedgehog', 'Thornback Hedgehog', 'meadow', 3, 'blob', .6, '#6a5a42', '#3a3026', 'provoked', { chitin: 1, rawMeat: 1 }, { speed: 4, tough: 1.4 }),
  c('scarecrow', 'Hollow Scarecrow', 'meadow', 4, 'biped', 1.1, '#c8a860', '#5a3a2a', 'hostile', { fiber: 4, ectoplasm: 1 }, { night: true, speed: 5 }),
  c('ram', 'Highmeadow Ram', 'meadow', 4, 'quad', 1.1, '#e8e0d0', '#8a7a6a', 'provoked', { rawMeat: 2, hide: 2 }, { horns: true, speed: 7.5 }),
  c('pixies', 'Pixie Swarm', 'meadow', 6, 'wisp', .5, '#ffb0e8', '#fff8a0', 'hostile', { bloomEssence: 1, honeycomb: 1 }, { fly: true, glow: true, speed: 8 }),
  c('bramblebull', 'Bramble Bull', 'meadow', 8, 'quad', 1.8, '#5a4030', '#3f7a3a', 'provoked', { rawMeat: 4, hide: 3, bloomEssence: 1 }, { horns: true, speed: 7, tough: 1.3 }),
  c('hornetqueen', 'Queen Vesperia the Great Hornet', 'meadow', 12, 'insect', 2.6, '#e8a82a', '#1a1a10', 'hostile', { heartfire: 1, honeycomb: 4, bloomEssence: 3 }, { elite: true, fly: true, poison: true, speed: 7.5 }),

  // The Greenwood — forest
  c('squirrel', 'Red Squirrel', 'forest', 1, 'quad', .35, '#a8482a', '#e8c8a0', 'timid', { rawMeat: 1 }, { tail: true, speed: 8 }),
  c('forestdeer', 'Greenwood Deer', 'forest', 2, 'quad', 1, '#8a6038', '#d9c7a4', 'timid', { rawMeat: 2, hide: 1 }, { antlers: true, speed: 8 }),
  c('boar', 'Wild Boar', 'forest', 3, 'quad', 1, '#3e3028', '#e8e0c8', 'provoked', { rawMeat: 3, hide: 1 }, { tusks: true, speed: 6.5 }),
  c('badger', 'Tusked Badger', 'forest', 3, 'quad', .7, '#4a4a4a', '#f0f0f0', 'provoked', { hide: 2, rawMeat: 1 }, { speed: 6 }),
  c('wolf', 'Grey Wolf', 'forest', 4, 'quad', .95, '#6b6e72', '#d0d0d0', 'hostile', { rawMeat: 1, hide: 2 }, { ears: true, tail: true, speed: 8.6 }),
  c('owl', 'Horned Owl', 'forest', 5, 'bird', .7, '#7a6a50', '#e8c84a', 'hostile', { feather: 3 }, { night: true, fly: true, speed: 8 }),
  c('sapling', 'Treant Sapling', 'forest', 6, 'biped', 1.4, '#5a4430', '#4f8a3a', 'provoked', { wood: 6, wildEssence: 1 }, { speed: 4, tough: 1.4 }),
  c('bear', 'Brown Bear', 'forest', 7, 'quad', 1.7, '#5a3e2a', '#3a2a1a', 'provoked', { rawMeat: 4, hide: 3, bone: 1 }, { ears: true, speed: 7, tough: 1.3 }),
  c('moonhowler', 'Moonhowler', 'forest', 9, 'biped', 1.5, '#4a4a52', '#e8e0ff', 'hostile', { hide: 3, bone: 2, wildEssence: 1 }, { night: true, ears: true, speed: 8.5 }),
  c('elderhorn', 'Elderhorn the Ancient Stag', 'forest', 12, 'quad', 2.8, '#6a5a3a', '#bfffa0', 'hostile', { heartfire: 1, hide: 4, wildEssence: 3 }, { elite: true, antlers: true, glow: true, speed: 8 }),
];

// The people of the human villages. Hostile to any witch they recognise; fooled by Glamour.
export const HUMANS = [
  c('villager', 'Villager', 'human', 3, 'human', 1, '#7a6a52', '#e2bfa0', 'timid', { silver: 3, bread: 1 }, { speed: 6.5, human: true }),
  c('hunter', 'Witch Hunter', 'human', 8, 'human', 1.05, '#2a2a2e', '#e2bfa0', 'provoked', { silver: 8, bread: 1 }, { speed: 7.5, human: true, hat: true, tough: 1.3 }),
  c('merchant', 'Merchant', 'human', 4, 'human', 1.1, '#6a3a6a', '#e2bfa0', 'timid', { silver: 30 }, { speed: 0, human: true }),
];

export const CREATURE = Object.fromEntries([...BESTIARY, ...HUMANS].map(b => [b.id, b]));

// The boss at the Crown. Warded: takes 10% damage until the Grand Rite breaks the ward.
export const BOSS = { id: 'unwitch', name: 'The Unwitch', level: 15, hp: 6000, damage: 26, plan: 'biped', size: 3.2, color: '#14101c', accent: '#ff3c6e', xp: 3000 };

export const ELITE_RESPAWN = 900;
