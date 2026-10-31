// Deterministic world generation for the 5 km island of Coven.
// All distances are metres. The world spans -HALF..HALF on x and z; y is up, sea level is 0, north is -z.
// The island is split into four witch regions around the central Crown mountains.
//
// LAYOUT scales the big picture (regions, ridges, the Crown, places, danger) from the original 10 km design;
// hills, pools and scattered resources keep their real size in metres.

export const WORLD_SIZE = 5000, LAYOUT = WORLD_SIZE / 10000, HALF = WORLD_SIZE / 2, CHUNK = 250, SEGMENTS = 25, CELL = CHUNK / SEGMENTS, WATER = 0;
export const CROWN = { x: 0, z: 0, radius: 70 };

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(...values) {
  let h = 2166136261;
  for (const v of values) { h ^= v | 0; h = Math.imul(h, 16777619); h ^= h >>> 13; }
  return h >>> 0;
}

const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

class Perlin {
  constructor(seed) {
    const random = rng(seed), p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    this.p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.p[i] = p[i & 255];
  }
  noise(x, y) {
    const X = Math.floor(x), Y = Math.floor(y), xf = x - X, yf = y - Y, p = this.p;
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    const grad = (h, dx, dy) => { switch (h & 7) { case 0: return dx + dy; case 1: return dx - dy; case 2: return -dx + dy; case 3: return -dx - dy; case 4: return dx; case 5: return -dx; case 6: return dy; default: return -dy; } };
    const xi = X & 255, yi = Y & 255, aa = p[p[xi] + yi], ab = p[p[xi] + yi + 1], ba = p[p[xi + 1] + yi], bb = p[p[xi + 1] + yi + 1];
    const u = fade(xf), v = fade(yf);
    const x1 = grad(aa, xf, yf) + u * (grad(ba, xf - 1, yf) - grad(aa, xf, yf));
    const x2 = grad(ab, xf, yf - 1) + u * (grad(bb, xf - 1, yf - 1) - grad(ab, xf, yf - 1));
    return x1 + v * (x2 - x1);
  }
  fbm(x, y, octaves) {
    let sum = 0, amp = 1, freq = 1, total = 0;
    for (let i = 0; i < octaves; i++) { sum += amp * this.noise(x * freq, y * freq); total += amp; amp *= .5; freq *= 2.03; }
    return sum / total;
  }
}

// The four witch regions, by quadrant. `terrain` shapes the land: base height and hill amplitude.
export const REGIONS = {
  darkforest: { name: 'The Gloamwood', quadrant: [-1, -1], terrain: [34, 75], ground: [0.13, 0.17, 0.14] },
  forest: { name: 'The Greenwood', quadrant: [1, -1], terrain: [30, 55], ground: [0.22, 0.38, 0.17] },
  swamp: { name: 'The Mirefen', quadrant: [-1, 1], terrain: [5, 12], ground: [0.27, 0.31, 0.19] },
  meadow: { name: 'Springvale Meadows', quadrant: [1, 1], terrain: [20, 32], ground: [0.47, 0.62, 0.3] },
};

export const SURFACES = {
  ocean: { name: 'The Drowned Sea', color: [0.16, 0.3, 0.36] },
  beach: { name: 'Saltgrass Shore', color: [0.76, 0.7, 0.52] },
  mud: { name: 'Mudflats', color: [0.3, 0.27, 0.18] },
  peaks: { name: 'The Crown Mountains', color: [0.45, 0.43, 0.41] },
  snow: { name: 'The Crown Mountains', color: [0.9, 0.92, 0.95] },
};

// Resource nodes: what each yields, hits to deplete, and collision radius (0 = walk through).
export const NODES = {
  pine: { yields: 'wood', hp: 5, radius: .6 },
  oak: { yields: 'wood', hp: 6, radius: .7 },
  gloomtree: { yields: 'wood', hp: 6, radius: .6 },
  blossom: { yields: 'wood', hp: 5, radius: .6 },
  deadtree: { yields: 'wood', hp: 3, radius: .4 },
  rock: { yields: 'stone', hp: 5, radius: 1.3 },
  moonstone: { yields: 'moonstone', hp: 4, radius: 1 },
  bush: { yields: 'fiber', hp: 2, radius: 0 },
  nest: { yields: 'feather', hp: 2, radius: 0 },
  mirecap: { herb: true, hp: 1, radius: 0, color: '#c98a4b' },
  bogmyrtle: { herb: true, hp: 1, radius: 0, color: '#7e9a52' },
  leechweed: { herb: true, hp: 1, radius: 0, color: '#5b2f3a' },
  nightshade: { herb: true, hp: 1, radius: 0, color: '#6b3fa0' },
  gravemoss: { herb: true, hp: 1, radius: 0, color: '#8fa38a' },
  shadowcap: { herb: true, hp: 1, radius: 0, color: '#3a2f6e' },
  sunpetal: { herb: true, hp: 1, radius: 0, color: '#f2c94c' },
  honeyclover: { herb: true, hp: 1, radius: 0, color: '#e88fb4' },
  dewbell: { herb: true, hp: 1, radius: 0, color: '#8fd3f4' },
  wolfsbane: { herb: true, hp: 1, radius: 0, color: '#5a6bd8' },
  elderberry: { herb: true, hp: 1, radius: 0, color: '#3b2340' },
  fernheart: { herb: true, hp: 1, radius: 0, color: '#3f9a4a' },
};

// Chance per scatter attempt (300 attempts per 250 m chunk) of each node type, by surface.
const DENSITY = {
  beach: { rock: .04, bush: .03 },
  mud: { deadtree: .06, leechweed: .06, bush: .05 },
  peaks: { pine: .04, rock: .28, moonstone: .04 },
  snow: { rock: .12, moonstone: .07 },
  swamp: { deadtree: .15, bush: .2, mirecap: .075, bogmyrtle: .075, leechweed: .06, rock: .03 },
  darkforest: { nest: .008, gloomtree: .38, pine: .12, rock: .06, bush: .12, nightshade: .06, gravemoss: .075, shadowcap: .06 },
  meadow: { blossom: .04, oak: .02, rock: .06, bush: .14, sunpetal: .1, honeyclover: .09, dewbell: .075 },
  forest: { nest: .008, oak: .3, pine: .18, rock: .06, bush: .18, wolfsbane: .06, elderberry: .075, fernheart: .075 },
};

// Around each starting Hearth: an extra helping of everything a new witch needs, including the wood, fiber and
// feathers (from nests) for a broom. Each land's own trees and herbs, within START_RADIUS metres.
export const START_RADIUS = 350;
const START_BOUNTY = {
  swamp: { deadtree: .2, bush: .2, nest: .1, rock: .12, mirecap: .08, bogmyrtle: .08, leechweed: .06 },
  darkforest: { gloomtree: .22, bush: .2, nest: .1, rock: .12, nightshade: .08, gravemoss: .08, shadowcap: .06 },
  meadow: { blossom: .1, oak: .1, bush: .22, nest: .1, rock: .12, sunpetal: .08, honeyclover: .08, dewbell: .06 },
  forest: { oak: .14, pine: .08, bush: .2, nest: .1, rock: .12, wolfsbane: .08, elderberry: .08, fernheart: .06 },
};

// Level zones by region: the outer ring, the middle ring and the inner ring before the Crown.
export const ZONE_LEVELS = [[1, 3], [4, 7], [8, 11], [12, 15]];
export const ZONES = {
  swamp: ['Mirefen Shallows', 'Rotwater Reach', 'Wyrmdeep Bog'],
  darkforest: ['Gloam Edge', 'Hollow Night Wood', 'Mourning Thicket'],
  meadow: ['Springvale Fields', 'Hive Hills', 'Bramble Heath'],
  forest: ['Greenwood Glades', 'Howling Pines', 'Elderhorn Old Growth'],
};

const POI_NAMES = ['Hexmoor', 'Blackthorn Vale', 'Ravenhollow', 'Mosswick', 'Cinderfold', 'Wyrdmere', 'Gallows Rise', 'Thistledown', 'Briarwatch', 'Hollowell', 'Nightshade Fen', 'Ashgrove', 'Grimsby Barrow', 'Crowfoot Tor', 'Elderroot', 'Wolfsbane Ridge'];
const POI_TYPES = ['circle', 'ruin', 'circle', 'shrine'];
const VILLAGE_NAMES = { darkforest: ['Harrowgate', 'Dunmere'], forest: ['Oakhollow', 'Ashford'], swamp: ['Kettlewick', 'Saltmarsh'], meadow: ['Millbrook', 'Fairhaven'] };
// Human villages: a palisade ring of this radius with two gates, houses, a chapel and a market stall.
export const HUMAN_VILLAGE = { radius: 40, gate: .14 };
const HEARTHS = { swamp: 'Bogmother\'s Hearth', darkforest: 'Gloam Hearth', meadow: 'Bloomhearth', forest: 'Greenhearth' };
const LAIRS = { swamp: 'Wyrm\'s Wallow', darkforest: 'Mournhide Den', meadow: 'The Golden Hive', forest: 'Elderhorn Glade' };

export function createWorld(seed = 1337) {
  const base = new Perlin(seed), ridge = new Perlin(seed + 1), gaps = new Perlin(seed + 2), detail = new Perlin(seed + 3), warp = new Perlin(seed + 4), pools = new Perlin(seed + 5);

  // Warped coordinates make region borders wander instead of following straight lines.
  // Written to scratch variables rather than returned as arrays: this runs millions of times.
  let wx = 0, wz = 0, lastRegion = 'forest';
  // In layout units (the original 10 km design), so borders and ridges keep their shape at any size.
  const warpAt = (x, z) => { x /= LAYOUT; z /= LAYOUT; wx = x + warp.fbm(x * .0004, z * .0004, 3) * 700; wz = z + warp.fbm(x * .0004 + 50, z * .0004 + 50, 3) * 700; };
  const regionOfWarp = () => (wx < 0 ? (wz < 0 ? 'darkforest' : 'swamp') : (wz < 0 ? 'forest' : 'meadow'));

  function region(x, z) { warpAt(x, z); return regionOfWarp(); }

  // Also leaves the point's region in `lastRegion`, so callers that need both pay for the warp once.
  function height(x, z) {
    warpAt(x, z);
    lastRegion = regionOfWarp();
    const tx = smoothstep(-350, 350, wx), tz = smoothstep(-350, 350, wz);
    const R = REGIONS, mix = i => lerp(lerp(R.darkforest.terrain[i], R.forest.terrain[i], tx), lerp(R.swamp.terrain[i], R.meadow.terrain[i], tx), tz);
    const e = base.fbm(x * .0005, z * .0005, 5);
    let h = mix(0) + e * mix(1);
    // Swamp pools: shallow water dotted through the low fen.
    h -= tz * (1 - tx) * Math.max(0, pools.fbm(x * .004, z * .004, 2)) * 22;
    // Mountain ridges along the region borders, broken by passes, rising to the central Crown.
    const border = Math.min(Math.abs(wx), Math.abs(wz)), r = Math.hypot(x, z) / LAYOUT;
    const pass = smoothstep(-.05, .2, gaps.fbm(x * .0012, z * .0012, 2));
    const crest = 1 - Math.abs(ridge.fbm(x * .0015, z * .0015, 4));
    h += (1 - smoothstep(0, 420, border)) * pass * (60 + crest * crest * 160) * (1 - smoothstep(1800, 4200, r));
    h += (1 - smoothstep(150, 1300, r)) * 300 * (.7 + crest * .3);
    // Flat summit arena for the end boss.
    const summit = 1 - smoothstep(CROWN.radius, CROWN.radius + 60, r * LAYOUT);
    h = lerp(h, 330, summit);
    h += detail.fbm(x * .012, z * .012, 2) * 3 * (1 - summit);
    const coast = smoothstep(.78, .97, Math.max(Math.abs(x), Math.abs(z)) / HALF);
    return h * (1 - coast) - coast * 60;
  }

  function surface(x, z, h = height(x, z), reg = region(x, z)) {
    if (h < WATER - .4) return 'ocean';
    const coastal = Math.max(Math.abs(x), Math.abs(z)) > HALF * .74;
    if (h < 2.5) return coastal || reg !== 'swamp' ? 'beach' : 'mud';
    if (h > 260 && Math.hypot(x, z) > CROWN.radius + 40) return 'snow';
    if (h > 150) return 'peaks';
    return reg;
  }

  function color(x, z, h, reg) {
    const s = surface(x, z, h, reg), c = (REGIONS[s] ?? SURFACES[s]).ground ?? SURFACES[s].color, v = 1 + detail.noise(x * .05, z * .05) * .12;
    if (s === 'ocean') { const d = Math.min(1, -h / 30); return [c[0] * (1 - d * .5), c[1] * (1 - d * .4), c[2] * (1 - d * .3)]; }
    if (Math.hypot(x, z) < CROWN.radius + 10) return [.22, .18, .26];
    return [c[0] * v, c[1] * v, c[2] * v];
  }

  // Heights at terrain-mesh vertices, cached: ground() is called for every walker every tick.
  const grid = new Map(), GRID_LIMIT = 150000;
  function gridHeight(gx, gz) {
    const key = (gx + 4096) * 8192 + (gz + 4096);
    let h = grid.get(key);
    if (h === undefined) {
      if (grid.size >= GRID_LIMIT) grid.clear();
      h = height(gx * CELL, gz * CELL); grid.set(key, h);
    }
    return h;
  }

  // Height of the rendered triangle mesh at (x, z), so feet land on the visible surface.
  function ground(x, z) {
    const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL), fx = x / CELL - gx, fz = z / CELL - gz;
    const h00 = gridHeight(gx, gz), h11 = gridHeight(gx + 1, gz + 1);
    if (fx >= fz) { const h10 = gridHeight(gx + 1, gz); return h00 + (h10 - h00) * fx + (h11 - h10) * fz; }
    const h01 = gridHeight(gx, gz + 1); return h00 + (h11 - h01) * fx + (h01 - h00) * fz;
  }

  // Triangle mesh data for one chunk; split matches ground().
  // Triangle mesh data for one chunk; split matches ground(). `step` > 1 skips vertices for distant chunks
  // (level of detail); a skirt hanging below every edge hides cracks where detail levels meet.
  function chunkMesh(cx, cz, step = 1) {
    const cols = [];
    for (let i = 0; i < SEGMENTS; i += step) cols.push(i);
    cols.push(SEGMENTS);
    const n = cols.length, edge = [], SKIRT = 8;
    for (let i = 0; i < n; i++) edge.push(i);                       // north edge, west to east
    for (let j = 1; j < n; j++) edge.push(j * n + n - 1);           // east edge
    for (let i = n - 2; i >= 0; i--) edge.push((n - 1) * n + i);    // south edge
    for (let j = n - 2; j > 0; j--) edge.push(j * n);               // west edge
    const verts = n * n + edge.length, positions = new Float32Array(verts * 3), colors = new Float32Array(verts * 3);
    const indices = new Uint32Array((n - 1) * (n - 1) * 6 + edge.length * 12);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const gx = cx * SEGMENTS + cols[i], gz = cz * SEGMENTS + cols[j], x = gx * CELL, z = gz * CELL, h = height(x, z), k = (j * n + i) * 3, c = color(x, z, h, lastRegion);
      if (grid.size < GRID_LIMIT) grid.set((gx + 4096) * 8192 + (gz + 4096), h);
      positions[k] = x; positions[k + 1] = h; positions[k + 2] = z;
      colors[k] = c[0]; colors[k + 1] = c[1]; colors[k + 2] = c[2];
    }
    edge.forEach((v, e) => {
      const k = (n * n + e) * 3;
      positions.set([positions[v * 3], positions[v * 3 + 1] - SKIRT, positions[v * 3 + 2]], k);
      colors.set(colors.subarray(v * 3, v * 3 + 3), k);
    });
    let k = 0;
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      indices.set([a, d, b, a, c, d], k); k += 6;
    }
    // Skirt quads, wound both ways so they show from either side.
    edge.forEach((v, e) => {
      const w = edge[(e + 1) % edge.length], sv = n * n + e, sw = n * n + (e + 1) % edge.length;
      indices.set([v, w, sw, v, sw, sv, v, sw, w, v, sv, sw], k); k += 12;
    });
    return { positions, colors, indices };
  }

  // Search outward from (x, z) for a spot that satisfies `ok(h, x, z)`.
  function findLand(x, z, ok) {
    for (let r = 0; r < 1500 * LAYOUT; r += 15) for (let a = 0; a < Math.PI * 2; a += .4) {
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, h = height(px, pz);
      if (ok(h, px, pz)) return { x: px, z: pz };
    }
    return { x, z };
  }

  const pois = [];
  const addPoi = (poi) => { pois.push({ id: pois.length, ...poi, y: ground(poi.x, poi.z) }); };
  for (const [id, reg] of Object.entries(REGIONS)) {
    const [qx, qz] = reg.quadrant;
    const hearth = findLand(qx * 2500 * LAYOUT, qz * 2500 * LAYOUT, (h, x, z) => h > 4 && h < 60 && region(x, z) === id);
    addPoi({ name: HEARTHS[id], type: 'hearth', region: id, ...hearth });
    const lair = findLand(qx * 1250 * LAYOUT, qz * 1250 * LAYOUT, (h, x, z) => h > 4 && h < 150 && region(x, z) === id);
    addPoi({ name: LAIRS[id], type: 'lair', region: id, ...lair });
  }
  addPoi({ name: 'The Crown', type: 'crown', region: null, x: CROWN.x, z: CROWN.z });
  // Two human villages per region, along the region's outer edges, on fairly level ground.
  const level = (x, z) => { let lo = Infinity, hi = -Infinity; for (let a = 0; a < 6.28; a += .8) { const h = height(x + Math.cos(a) * 40, z + Math.sin(a) * 40); lo = Math.min(lo, h); hi = Math.max(hi, h); } return hi - lo < 14 && lo > 3; };
  for (const [id, reg] of Object.entries(REGIONS)) {
    const [qx, qz] = reg.quadrant;
    [[qx * 3300, qz * 1500], [qx * 1500, qz * 3300]].forEach(([sx, sz], k) => {
      sx *= LAYOUT; sz *= LAYOUT;
      const spot = findLand(sx, sz, (h, x, z) => h > 4 && h < 90 && region(x, z) === id && level(x, z) && pois.every(p => Math.hypot(p.x - x, p.z - z) > 500 * LAYOUT));
      addPoi({ name: VILLAGE_NAMES[id][k], type: 'village', region: id, ...spot, layout: villageLayout(spot.x, spot.z, rng(hash(seed, 900, k, sx)) ) });
    });
  }
  {
    const random = rng(hash(seed, 77));
    let named = 0;
    for (let tries = 0; tries < 5000 && named < POI_NAMES.length; tries++) {
      const x = (random() * 2 - 1) * HALF * .78, z = (random() * 2 - 1) * HALF * .78, h = height(x, z);
      if (h < 5 || h > 200 || pois.some(p => Math.hypot(p.x - x, p.z - z) < 1000 * LAYOUT)) continue;
      addPoi({ name: POI_NAMES[named], type: POI_TYPES[named % POI_TYPES.length], region: region(x, z), x, z });
      named++;
    }
  }

  function villageLayout(cx, cz, random) {
    const gate = random() * Math.PI, houses = [], R = HUMAN_VILLAGE.radius;
    for (let tries = 0; tries < 200 && houses.length < 7; tries++) {
      const a = random() * Math.PI * 2, r = 13 + random() * 18, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (houses.some(h => Math.hypot(h.x - x, h.z - z) < 10)) continue;
      const toGate = Math.min(...[gate, gate + Math.PI].map(g => Math.abs(((a - g + Math.PI * 3) % (Math.PI * 2)) - Math.PI)));
      if (toGate < .35) continue; // keep the roads clear
      houses.push({ x, z, y: ground(x, z), rot: -a + Math.PI / 2, w: 5 + random() * 2, d: 4 + random() * 1.5, chapel: houses.length === 0 });
    }
    const posts = [];
    for (let i = 0; i < 72; i++) {
      const a = i / 72 * Math.PI * 2;
      if (Math.min(...[gate, gate + Math.PI].map(g => Math.abs(((a - g + Math.PI * 3) % (Math.PI * 2)) - Math.PI))) < HUMAN_VILLAGE.gate) continue;
      const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
      posts.push({ x, z, y: ground(x, z), rot: -a });
    }
    const gates = [gate, gate + Math.PI].map(g => ({ x: cx + Math.cos(g) * R, z: cz + Math.sin(g) * R, angle: g }));
    return { gate, houses, posts, gates, stall: { x: cx + 4, z: cz, y: ground(cx + 4, cz) } };
  }

  function scatter(cx, cz) {
    const random = rng(hash(seed, cx, cz)), nodes = [];
    for (let i = 0; i < 300; i++) {
      const x = cx * CHUNK + random() * CHUNK, z = cz * CHUNK + random() * CHUNK, roll = random(), s = .75 + random() * .6, rot = random() * Math.PI * 2;
      const h = height(x, z), table = DENSITY[surface(x, z, h, lastRegion)];
      if (!table || pois.some(p => { const r = p.type === 'crown' ? 140 : p.type === 'village' ? 52 : 32; return Math.abs(p.x - x) < r && Math.abs(p.z - z) < r; })) continue;
      let acc = 0;
      for (const [type, p] of Object.entries(table)) {
        acc += p;
        if (roll < acc) { nodes.push({ id: `${cx},${cz},${i}`, type, x, z, y: ground(x, z), s: NODES[type].herb ? .8 + s * .3 : s, rot }); break; }
      }
    }
    // The start bounty: extra nodes near a Hearth, with ids of their own so the usual ones keep theirs.
    const hearth = pois.find(p => p.type === 'hearth' && Math.hypot(p.x - (cx + .5) * CHUNK, p.z - (cz + .5) * CHUNK) < START_RADIUS + CHUNK);
    if (hearth) for (let i = 0; i < 160; i++) {
      const x = cx * CHUNK + random() * CHUNK, z = cz * CHUNK + random() * CHUNK, roll = random(), s = .75 + random() * .6, rot = random() * Math.PI * 2;
      const d = Math.hypot(x - hearth.x, z - hearth.z);
      if (d > START_RADIUS || d < 30 || height(x, z) < 1.5 || pois.some(p => p.type === 'village' && Math.hypot(p.x - x, p.z - z) < 55)) continue;
      let acc = 0;
      for (const [type, p] of Object.entries(START_BOUNTY[hearth.region])) {
        acc += p;
        if (roll < acc) { nodes.push({ id: `${cx},${cz},s${i}`, type, x, z, y: ground(x, z), s: NODES[type].herb ? .8 + s * .3 : s, rot }); break; }
      }
    }
    return nodes;
  }

  const hearthOf = id => pois.find(p => p.type === 'hearth' && p.region === id);

  // Spawn a little way from the region's hearth so the elder stands in view.
  function spawnPoint(regionId = 'forest') {
    const h = hearthOf(regionId);
    return findLand(h.x + 14, h.z + 10, (y) => y > 3);
  }

  // Wilder and deadlier towards the Crown: 1 at the coast, 12 at the summit.
  function danger(x, z) {
    const r = Math.hypot(x, z);
    return Math.round(1 + 11 * (1 - smoothstep(500 * LAYOUT, 3600 * LAYOUT, r)));
  }

  // Named zones with level ranges: three rings in each land, rising towards the Crown.
  function zone(x, z) {
    const d = danger(x, z);
    if (d >= 12) return { name: 'The Crown', region: null, tier: 3, min: 12, max: 15 };
    const tier = d <= 3 ? 0 : d <= 7 ? 1 : 2, reg = region(x, z);
    return { name: ZONES[reg][tier], region: reg, tier, min: ZONE_LEVELS[tier][0], max: ZONE_LEVELS[tier][1] };
  }

  function placeName(x, z) {
    let best = null, d = Infinity;
    for (const p of pois) { const pd = Math.hypot(p.x - x, p.z - z); if (pd < d) { d = pd; best = p; } }
    if (best && d < (best.type === 'crown' ? 1300 * LAYOUT : 250)) return best.name;
    const s = surface(x, z);
    return REGIONS[s]?.name ?? (s === 'mud' || s === 'beach' ? `${SURFACES[s].name} · ${REGIONS[region(x, z)].name}` : SURFACES[s].name);
  }

  return { seed, height, ground, region, surface, color, chunkMesh, scatter, pois, spawnPoint, hearthOf, danger, zone, placeName };
}
