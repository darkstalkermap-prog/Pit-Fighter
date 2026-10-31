# Coven

An open-world survival RPG in the browser. You play a witch of a broken coven on a 10 km × 10 km island. Gather, hunt and brew to survive, build a village, level your skills, and recruit three sister witches. Coven spells need two, three or four witches, and only the four-witch Grand Rite can break the ward of the Unwitch at the Crown.

Built with JavaScript and Three.js (WebGL 2). Graphics are deliberately low-detail for now — flat-shaded blocks, no shadows, a short view distance — while the mechanics are worked out.

## Play

**[Play Coven](https://darkstalkermap-prog.github.io/Coven/)** (once GitHub Pages is enabled for this repository), or download `Browser/Play-Coven.html` and open it offline. It is a single self-contained file.

Use a desktop browser with a keyboard and mouse. Progress saves in the browser's local storage.

| Input | Action |
| --- | --- |
| WASD / Shift / Space | Move / sprint / jump |
| Mouse (or ← →) | Look |
| Left mouse | Strike, or gather from the tree, rock, bush or herb in front of you |
| Right mouse or 1 | Your first spell |
| 1–7 | Spells: 1–2 your class, 3–4 two-witch rites, 5–6 three-witch rites, 7 the Grand Rite |
| E | Interact: talk, recruit, attune, rest, cook, harvest, drink |
| Q | Eat your best food |
| Tab / B / K / C | Pack, build, skills, coven panels (Pack · Craft · Alchemy · Build · Skills · Coven) |
| M | World map |
| Esc | Pause / close panel |

## The world

The island is split into four lands around the Crown, a mountain summit at its centre. Mountain ridges with passes divide the lands. Danger rises from 1 at the coast to 12 at the Crown.

| Land | Quadrant | Witch | Herbs |
| --- | --- | --- | --- |
| The Mirefen (swamp) | south-west | Bog Witch | Mirecap, Bog Myrtle, Leechweed |
| The Gloamwood (dark forest) | north-west | Hex Witch | Nightshade, Gravemoss, Shadowcap |
| Springvale Meadows | south-east | Bloom Witch | Sunpetal, Honeyclover, Dewbell |
| The Greenwood (forest) | north-east | Wild Witch | Wolfsbane, Elderberry, Fernheart |

Each land has a **Hearth** (class starting point, with that path's elder) and a **Lair** guarded by an elite. Stone circles (attune to make them your respawn point), ruins (one-time caches) and shrines (daily full restore) are scattered across the isle. Moonstone is mined in the Crown mountains with a Stone Pick.

## Witch classes and familiars

| Class | Spells | Familiar | Bonus | Ability |
| --- | --- | --- | --- | --- |
| Bog Witch | Leech Bolt, Miasma | Grimtoad | Immune to poison | Strikes and spells poison foes |
| Hex Witch | Shadow Bolt, Withering Hex | Corvin the Raven | Undiscovered places show on the compass | +25% spell damage at night |
| Bloom Witch | Sunburst, Renewal | Clover the Hare | +15% move speed | Herbs and berries yield double |
| Wild Witch | Thorn Lash, Barkskin | Ember the Fox | +1 meat and hide from hunts | Ember fights beside you |

## Creatures

Ten per land (40 in all), from timid prey to hunters that only come out at night. The tenth of each land is an elite that drops **Heartfire**:

- **Mirefen:** Bog Toad, Marsh Heron, Mire Leech, Mudback Boar, Fen Crawler, Will-o'-Wisp, Bog Serpent, Rotting Shambler, Moss Troll, *Grendlemaw the Fen Wyrm*
- **Gloamwood:** Gloom Bat, Shadow Hare, Gravecrow, Duskwolf, Webweaver, Hollow Stag, Gloam Stalker, Bone Revenant, Night Hag's Shade, *Old Mournhide the Shadow Bear*
- **Springvale:** Meadow Rabbit, Bumble Drone, Spring Deer, Gilded Pheasant, Thornback Hedgehog, Hollow Scarecrow, Highmeadow Ram, Pixie Swarm, Bramble Bull, *Queen Vesperia the Great Hornet*
- **Greenwood:** Red Squirrel, Greenwood Deer, Wild Boar, Tusked Badger, Grey Wolf, Horned Owl, Treant Sapling, Brown Bear, Moonhowler, *Elderhorn the Ancient Stag*

Creatures drop meat, hide, bone, feathers, slime, chitin, silk, venom, ectoplasm, honeycomb and the essences of their land.

## Progression

- **Survival:** health, mana, stamina, food and water. Cold in the high mountains (craft a Hide Cloak or stay near fire). Poison from bites.
- **Skills** level with use: Gathering, Herbalism, Hunting, Alchemy, Spellcraft, Building.
- **Crafting** by hand: hatchet, pick, spear, staff, cloak, bandages.
- **Alchemy** at your Cauldron: Healing Draught, Mana Tonic, Swiftfoot Elixir, Venom Coating, Ironbark Brew, Gloamsight Philter, Coven Ink. At a Ritual Altar: Moonstone Dust and Heartfire Sigils.
- **Village:** found it with a Village Heart, then build within 60 m: Cauldron, Witch Hut (rest and respawn), Well, Herb Garden (grows homeland herbs), Warding Totem (beasts stay away), Ritual Altar, Palisade walls and Lantern Posts. Campfires can go anywhere.
- **The coven:** recruit the elder of each other path at her Hearth: the first at level 3, the second at level 6, the third at level 9, each for a potion gift. Sisters follow you and fight with their own spells.
- **Coven rites:** Summon Beast and Binding Circle (2 witches, Coven Ink), Storm of the Three and Call the Guardian (3 witches, Moonstone Dust), the Grand Rite (4 witches, Heartfire Sigil).
- **The end:** the Unwitch at the Crown takes only 10% damage until a Grand Rite cast within reach shatters her ward for 25 seconds.

A twelve-step quest line guides the way from first gathering to the Grand Rite.

## Current limits

This is a **single-player prototype**. Coven sisters are AI companions; real multiplayer covens need a game server and are future work. Graphics are placeholder-level. Balance numbers are first guesses.

## Development

Requires Node.js 24 (22 works locally).

```sh
npm ci
npm test
npm run build
npm start
```

`npm start` rebuilds and serves `_site` on port 8000. Do not open `Browser/index.html` directly; it is the build template. `npm run build` writes `Browser/Play-Coven.html` and `_site/index.html`.

| File | Contents |
| --- | --- |
| `Browser/world.mjs` | Deterministic terrain, regions, points of interest, resource scatter |
| `Browser/data.mjs` | Classes, familiars, spells, items, recipes, buildings, skills |
| `Browser/bestiary.mjs` | The 40 creatures and the boss |
| `Browser/rules.mjs` | Inventory, skills, crafting, alchemy, building, needs, magic, coven, quests |
| `Browser/creatures.mjs` | Creature and ally behaviour |
| `Browser/view.mjs` | Three.js rendering |
| `Browser/game.mjs` | Game loop, input, HUD and panels |

### Browser test

```sh
npx playwright install --with-deps chromium
npm run build
npm run test:browser
```

Set `CHROMIUM_PATH` to use an installed Chromium. The test serves the game at the Pages subpath, picks a class, walks, builds a village, brews at the cauldron, checks coven-spell gating, hunts a wolf with spells, opens the map, and breaks the Unwitch's ward with a four-witch Grand Rite. It fails on any browser error. Screenshots go to `test-results/`.
