// Low-cost rendering: flat-shaded blocks, no shadows, short view distance. Mechanics come first.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CHUNK, HALF, NODES } from './world.mjs';
import { CREATURE, BOSS } from './bestiary.mjs';
import { CLASSES } from './data.mjs';
import { ALLIES } from './creatures.mjs';

const TERRAIN_RADIUS = 3, OBJECT_RADIUS = 2, MAX_CHUNK = HALF / CHUNK;
const DAY = new THREE.Color('#9cc1d6'), DUSK = new THREE.Color('#d08b62'), NIGHT = new THREE.Color('#141b30');

function painted(geometry, color, x = 0, y = 0, z = 0) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.translate(x, y, z);
  const c = new THREE.Color(color), n = g.attributes.position.count, colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

function nodeGeometries() {
  const tree = (trunk, crown, crownGeo, h = 3) => mergeGeometries([painted(new THREE.CylinderGeometry(.25, .35, h, 5), trunk, 0, h / 2, 0), painted(crownGeo, crown, 0, h + 1.6, 0)]);
  const g = {
    pine: tree('#5a3f2a', '#24452c', new THREE.ConeGeometry(2, 5.5, 6)),
    oak: tree('#5c4430', '#3f6b2f', new THREE.IcosahedronGeometry(2.5, 0)),
    gloomtree: tree('#2a2026', '#2c2238', new THREE.ConeGeometry(2.2, 6.5, 5), 3.5),
    blossom: tree('#6a4a3a', '#e7a3c4', new THREE.IcosahedronGeometry(2.2, 0)),
    deadtree: mergeGeometries([painted(new THREE.CylinderGeometry(.12, .3, 4.5, 4), '#4a4238', 0, 2.25, 0), painted(new THREE.BoxGeometry(1.8, .16, .16), '#4a4238', .7, 3.2, 0)]),
    rock: painted(new THREE.DodecahedronGeometry(1.5, 0).scale(1, .65, 1.1), '#7a7a74', 0, .4, 0),
    moonstone: mergeGeometries([painted(new THREE.DodecahedronGeometry(1.1, 0).scale(1, .6, 1), '#6a6a72', 0, .3, 0), painted(new THREE.OctahedronGeometry(.5, 0).scale(1, 2, 1), '#9fe8ff', .2, 1.1, 0), painted(new THREE.OctahedronGeometry(.35, 0).scale(1, 2, 1), '#9fe8ff', -.4, .9, .3)]),
    bush: mergeGeometries([painted(new THREE.IcosahedronGeometry(.85, 0), '#3d5e2e', 0, .55, 0), painted(new THREE.IcosahedronGeometry(.18, 0), '#8a2f4a', .55, .8, .3)]),
  };
  for (const [id, n] of Object.entries(NODES)) if (n.herb) g[id] = mergeGeometries([painted(new THREE.BoxGeometry(.08, .6, .08), '#3f6a2e', 0, .3, 0), painted(new THREE.BoxGeometry(.5, .06, .12), '#4f7a3a', 0, .2, 0), painted(new THREE.IcosahedronGeometry(.22, 0), n.color, 0, .7, 0)]);
  return g;
}

export class WorldView {
  constructor(canvas, world) {
    this.world = world;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = DAY.clone();
    this.scene.fog = new THREE.Fog(DAY.clone(), 160, 620);
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, .3, 800);
    this.hemi = new THREE.HemisphereLight(0xcfe3f0, 0x4a4a32, 1.6);
    this.sun = new THREE.DirectionalLight(0xffe8c0, 2.2);
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.lambert = new Map();
    this.terrainMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.nodeMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.nodeGeometry = nodeGeometries();
    this.box = new THREE.BoxGeometry(1, 1, 1);
    this.ball = new THREE.IcosahedronGeometry(.5, 0);
    this.chunks = new Map();
    this.nodeIndex = new Map();
    this.hidden = new Set();
    this.entities = new Map();
    this.effects = [];

    const water = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), new THREE.MeshLambertMaterial({ color: '#2d6578', transparent: true, opacity: .82 }));
    water.rotation.x = -Math.PI / 2; water.position.y = .05;
    this.scene.add(water);
    this.lights = [0, 1].map(() => { const l = new THREE.PointLight(0xff9a4a, 0, 28, 1.6); this.scene.add(l); return l; });
    this.buildPois();
    this.resize();
  }

  resize() { this.renderer.setSize(innerWidth, innerHeight, false); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }

  mat(color, glow = false) {
    const key = color + glow;
    if (!this.lambert.has(key)) this.lambert.set(key, glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color, flatShading: true }));
    return this.lambert.get(key);
  }
  // A box (or other geometry) of size sx*sy*sz at (x, y, z) inside `parent`.
  block(parent, color, x, y, z, sx, sy, sz, geometry = this.box, glow = false) {
    const m = new THREE.Mesh(geometry, this.mat(color, glow));
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m;
  }

  // ---------- characters ----------
  witch(classId, scale = 1) {
    const k = CLASSES[classId], g = new THREE.Group(), body = new THREE.Group();
    g.add(body); g.scale.setScalar(scale);
    this.block(body, k.robe, 0, .75, 0, 1, 1.3, 1, new THREE.ConeGeometry(.55, 1, 6));
    this.block(body, k.robe, 0, 1.38, 0, .5, .5, .5);
    this.block(body, '#e2bfa0', 0, 1.78, 0, .4, .4, .4);
    this.block(body, k.hat, 0, 1.97, 0, 1.1, .05, 1.1);
    this.block(body, k.hat, 0, 2.38, 0, 1, .85, 1, new THREE.ConeGeometry(.3, 1, 5)).rotation.z = -.18;
    const arm = new THREE.Group(); arm.position.set(.32, 1.45, 0); body.add(arm);
    this.block(arm, k.robe, 0, -.3, 0, .16, .6, .16);
    const tool = new THREE.Group(); tool.position.set(0, -.6, .05); arm.add(tool);
    this.block(tool, '#6b4a2e', 0, 0, .4, .07, .07, 1.1);
    const head = this.block(tool, '#8a8a85', 0, 0, .85, .12, .22, .24);
    const legs = [-.15, .15].map(x => this.block(g, '#221a2a', x, .22, 0, .14, .45, .14));
    Object.assign(g.userData, { body, arm, tool, head, legs, faces: 'z' });
    return g;
  }

  creature(plan, size, color, accent, b = {}) {
    const g = new THREE.Group(), legs = [], wings = [], segs = [];
    const add = (...a) => this.block(g, ...a);
    if (plan === 'quad') {
      const y = size * .95, L = size * 1.3, W = size * .5, H = size * .55;
      add(color, 0, y, 0, L, H, W);
      const head = add(color, L / 2 + size * .15, y + H * .4, 0, size * .45, size * .38, size * .34);
      if (b.antlers) for (const z of [-1, 1]) this.block(head, accent, -.1, 1.2, z * .25, .12, 1.6, .12).rotation.x = z * .5;
      if (b.horns) for (const z of [-1, 1]) this.block(head, accent, -.2, .6, z * .55, .3, .3, .5);
      if (b.tusks) for (const z of [-1, 1]) this.block(head, accent, .6, -.3, z * .3, .5, .1, .1);
      if (b.ears) for (const z of [-1, 1]) this.block(head, color, -.2, .65, z * .3, .2, .5, .2);
      if (b.tail) add(color, -L / 2 - size * .25, y + H * .2, 0, size * .55, size * .12, size * .12).rotation.z = .5;
      for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const pivot = new THREE.Group(); pivot.position.set(x * L * .38, y - H / 2, z * W * .4); g.add(pivot);
        this.block(pivot, color, 0, -(y - H / 2) / 2, 0, size * .14, y - H / 2, size * .14); legs.push(pivot);
      }
    } else if (plan === 'biped') {
      add(color, 0, size * 1.2, 0, size * .7, size * .9, size * .45);
      add(accent, 0, size * 1.85, 0, size * .45, size * .42, size * .42);
      for (const z of [-1, 1]) { const arm = new THREE.Group(); arm.position.set(0, size * 1.55, z * size * .45); g.add(arm); this.block(arm, color, 0, -size * .4, 0, size * .18, size * .8, size * .18); wings.push(arm); }
      for (const z of [-1, 1]) { const leg = new THREE.Group(); leg.position.set(0, size * .75, z * size * .18); g.add(leg); this.block(leg, color, 0, -size * .375, 0, size * .2, size * .75, size * .2); legs.push(leg); }
    } else if (plan === 'bird' || plan === 'insect') {
      add(color, 0, size * .6, 0, size * .9, size * .45, size * .4);
      add(plan === 'insect' ? accent : color, size * .55, size * .75, 0, size * .32, size * .3, size * .3);
      if (plan === 'insect') add(accent, -size * .6, size * .55, 0, size * .5, size * .3, size * .32);
      else add(accent, size * .78, size * .72, 0, size * .25, size * .07, size * .07);
      for (const z of [-1, 1]) { const w = new THREE.Group(); w.position.set(0, size * .75, z * size * .2); g.add(w); this.block(w, plan === 'insect' ? '#e8f0ff' : color, 0, 0, z * size * .45, size * .5, size * .05, size * .9); wings.push(w); }
    } else if (plan === 'serpent') {
      for (let i = 0; i < 6; i++) segs.push(add(i ? color : accent, -i * size * .55, size * .3, 0, size * .6, size * .45 * (1 - i * .08), size * .45 * (1 - i * .08)));
    } else if (plan === 'spider') {
      add(color, 0, size * .55, 0, size * .55, size * .4, size * .5);
      add(color, -size * .55, size * .65, 0, size * .7, size * .55, size * .65);
      add(accent, size * .32, size * .6, 0, size * .1, size * .1, size * .3);
      for (let i = 0; i < 8; i++) { const z = i % 2 ? 1 : -1, x = (Math.floor(i / 2) - 1.5) * size * .2; const leg = new THREE.Group(); leg.position.set(x, size * .55, z * size * .2); g.add(leg); this.block(leg, color, 0, 0, z * size * .45, size * .08, size * .08, size * .9).rotation.x = z * .5; legs.push(leg); }
    } else if (plan === 'wisp') {
      const core = add(color, 0, size * .5, 0, size, size, size, this.ball, true);
      add(accent, 0, size * .5, 0, size * .45, size * .45, size * .45, this.ball, true);
      segs.push(core);
    } else { // blob
      segs.push(add(color, 0, size * .4, 0, size * 1.1, size * .8, size, this.ball));
      for (const z of [-1, 1]) add(accent, size * .45, size * .65, z * size * .22, size * .18, size * .18, size * .18, this.ball);
    }
    Object.assign(g.userData, { legs, wings, segs, plan, faces: 'x' });
    return g;
  }

  familiar(species) {
    return {
      toad: () => this.creature('blob', .35, '#5c7a3a', '#e8d84a'),
      raven: () => this.creature('bird', .4, '#1a1a22', '#c8c040'),
      hare: () => this.creature('quad', .35, '#c8b090', '#ffffff', { ears: true }),
      fox: () => this.creature('quad', .45, '#d0602a', '#ffffff', { ears: true, tail: true }),
    }[species]();
  }

  boss() {
    const g = this.creature('biped', BOSS.size, BOSS.color, BOSS.accent);
    this.block(g, BOSS.accent, 0, BOSS.size * 2.4, 0, BOSS.size * .4, BOSS.size * .9, BOSS.size * .4, new THREE.ConeGeometry(.5, 1, 4), true);
    const ward = new THREE.Mesh(new THREE.IcosahedronGeometry(BOSS.size * 1.6, 1), new THREE.MeshBasicMaterial({ color: '#ff3c6e', transparent: true, opacity: .18, wireframe: true }));
    ward.position.y = BOSS.size * 1.2; g.add(ward); g.userData.ward = ward;
    return g;
  }

  // ---------- places & buildings ----------
  building(type) {
    const g = new THREE.Group(), b = (...a) => this.block(g, ...a);
    if (type === 'heart') { b('#6f6c66', 0, .3, 0, 2.6, .6, 2.6, new THREE.CylinderGeometry(.5, .5, 1, 8)); b('#b98cff', 0, 1.4, 0, .8, 1.6, .8, new THREE.OctahedronGeometry(.5, 0), true); }
    if (type === 'campfire') { b('#4d3420', 0, .12, 0, 1, .15, .2); b('#4d3420', 0, .12, 0, .2, .15, 1); b('#ffb347', 0, .5, 0, .6, .8, .6, new THREE.ConeGeometry(.5, 1, 5), true); }
    if (type === 'cauldron') { b('#2a2a2e', 0, .55, 0, 1.6, 1.1, 1.6, new THREE.CylinderGeometry(.5, .35, 1, 8)); b('#6ad84a', 0, 1.08, 0, 1.3, .05, 1.3, new THREE.CylinderGeometry(.5, .5, 1, 8), true); }
    if (type === 'palisade') for (let i = -2; i <= 2; i++) b('#6b4a2e', i * .8, 1.3, 0, .35, 2.6 + (i % 2) * .3, .35);
    if (type === 'lantern') { b('#4d3420', 0, 1.2, 0, .15, 2.4, .15); b('#b8ff9a', 0, 2.5, 0, .35, .35, .35, this.box, true); }
    if (type === 'hut') { b('#7a5a3a', 0, 1.2, 0, 4, 2.4, 3.4); b('#a8904a', 0, 3.1, 0, 5.4, 1.8, 4.4, new THREE.ConeGeometry(.5, 1, 4)).rotation.y = Math.PI / 4; b('#2a1a10', 2.01, .9, 0, .05, 1.8, 1); }
    if (type === 'well') { b('#77736a', 0, .5, 0, 2, 1, 2, new THREE.CylinderGeometry(.5, .5, 1, 8)); b('#2d6578', 0, 1.01, 0, 1.6, .02, 1.6, new THREE.CylinderGeometry(.5, .5, 1, 8)); b('#6b4a2e', 0, 2, 0, 2.2, .15, .15); }
    if (type === 'garden') { b('#4a3420', 0, .15, 0, 3.6, .3, 2.4); for (let i = 0; i < 6; i++) b('#4f8a3a', -1.2 + (i % 3) * 1.2, .55, i < 3 ? -.6 : .6, .3, .5, .3); }
    if (type === 'totem') { b('#6b4a2e', 0, 1.6, 0, .6, 3.2, .6); b('#d8d0c0', 0, 3.4, 0, .7, .5, .5); b('#ff9a4a', .31, 2.6, 0, .05, .2, .3, this.box, true); }
    if (type === 'altar') { b('#5a5650', 0, .5, 0, 3, 1, 1.6); b('#8a8780', 0, 1.05, 0, 3.2, .1, 1.8); b('#9fe8ff', 0, 1.5, 0, .5, .8, .5, new THREE.OctahedronGeometry(.5, 0), true); }
    return g;
  }

  buildPois() {
    this.poiMeshes = [];
    for (const poi of this.world.pois) {
      const g = new THREE.Group(), b = (...a) => this.block(g, ...a);
      g.position.set(poi.x, poi.y, poi.z);
      if (poi.type === 'circle') { for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; b('#8a8780', Math.cos(a) * 9, 1.6, Math.sin(a) * 9, 1.1, 3.2 + (i % 3) * .5, .7).rotation.y = -a; } b('#9a6bff', 0, 1.4, 0, .8, .8, .8, this.ball, true); }
      if (poi.type === 'ruin') { for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; b('#77736a', Math.cos(a) * 3.4, 2 + (i % 3), Math.sin(a) * 3.4, 1.4, 4 + (i % 3) * 2, 1.4); } b('#6b4a2e', 0, .45, 0, 1.4, .9, 1); }
      if (poi.type === 'shrine') { b('#7d7a73', 0, 1.2, 0, 1.6, 2.4, 1.6, new THREE.CylinderGeometry(.4, .55, 1, 6)); b('#3cffb0', 0, 3, 0, .8, .8, .8, new THREE.OctahedronGeometry(.6, 0), true); }
      if (poi.type === 'hearth') {
        const hut = this.building('hut'); hut.position.set(-6, 0, -5); g.add(hut);
        const fire = this.building('campfire'); g.add(fire);
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; b('#6b4a2e', Math.cos(a) * 14, .6, Math.sin(a) * 14, .25, 1.2, .25); }
      }
      if (poi.type === 'lair') { for (let i = 0; i < 10; i++) { const a = i * 2.4; b(i % 2 ? '#d8d0c0' : '#3a3036', Math.cos(a) * (4 + i), .4, Math.sin(a) * (4 + i), 1.2, .6 + (i % 3) * .4, .8); } }
      if (poi.type === 'crown') { for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; b('#1a1420', Math.cos(a) * 55, 7, Math.sin(a) * 55, 3, 14 + (i % 3) * 5, 3, new THREE.ConeGeometry(.5, 1, 4)); } b('#ff3c6e', 0, .1, 0, 30, .1, 30, new THREE.CylinderGeometry(.5, .5, 1, 24), true).material = new THREE.MeshBasicMaterial({ color: '#3a1020' }); }
      this.scene.add(g); this.poiMeshes.push(g);
    }
  }

  // ---------- terrain & resource streaming ----------
  hideNode(id) {
    this.hidden.add(id);
    const ref = this.nodeIndex.get(id);
    if (ref) { ref.mesh.setMatrixAt(ref.index, new THREE.Matrix4().makeScale(0, 0, 0)); ref.mesh.instanceMatrix.needsUpdate = true; }
  }
  showNode(id) {
    this.hidden.delete(id);
    const ref = this.nodeIndex.get(id);
    if (ref) { ref.mesh.setMatrixAt(ref.index, ref.matrix); ref.mesh.instanceMatrix.needsUpdate = true; }
  }

  buildChunk(cx, cz) {
    const key = `${cx},${cz}`, data = this.world.chunkMesh(cx, cz), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.terrainMaterial);
    this.scene.add(mesh);
    const chunk = { key, cx, cz, mesh, nodes: [], instanced: [], hasObjects: false };
    this.chunks.set(key, chunk);
    return chunk;
  }

  buildObjects(chunk) {
    chunk.nodes = this.world.scatter(chunk.cx, chunk.cz); chunk.hasObjects = true;
    const byType = {};
    for (const n of chunk.nodes) (byType[n.type] ??= []).push(n);
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const [type, nodes] of Object.entries(byType)) {
      const mesh = new THREE.InstancedMesh(this.nodeGeometry[type], this.nodeMaterial, nodes.length);
      nodes.forEach((n, i) => {
        const matrix = new THREE.Matrix4().compose(new THREE.Vector3(n.x, n.y - .1, n.z), q.setFromAxisAngle(up, n.rot), new THREE.Vector3(n.s, n.s, n.s));
        mesh.setMatrixAt(i, this.hidden.has(n.id) ? zero : matrix);
        this.nodeIndex.set(n.id, { mesh, index: i, matrix });
      });
      mesh.computeBoundingSphere();
      this.scene.add(mesh); chunk.instanced.push(mesh);
    }
  }

  dropObjects(chunk) {
    for (const mesh of chunk.instanced) { this.scene.remove(mesh); mesh.dispose(); }
    for (const n of chunk.nodes) this.nodeIndex.delete(n.id);
    chunk.instanced = []; chunk.nodes = []; chunk.hasObjects = false;
  }

  // Stream chunks around (x, z). `budget` caps how many are built this call.
  stream(x, z, budget = 2) {
    const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK), wanted = [];
    for (let dz = -TERRAIN_RADIUS; dz <= TERRAIN_RADIUS; dz++) for (let dx = -TERRAIN_RADIUS; dx <= TERRAIN_RADIUS; dx++) {
      const cx = pcx + dx, cz = pcz + dz;
      if (cx < -MAX_CHUNK - 1 || cz < -MAX_CHUNK - 1 || cx > MAX_CHUNK || cz > MAX_CHUNK) continue;
      wanted.push({ cx, cz, d: Math.max(Math.abs(dx), Math.abs(dz)) });
    }
    wanted.sort((a, b) => a.d - b.d);
    for (const w of wanted) {
      let chunk = this.chunks.get(`${w.cx},${w.cz}`);
      if (!chunk) { if (budget-- <= 0) break; chunk = this.buildChunk(w.cx, w.cz); }
      if (w.d <= OBJECT_RADIUS && !chunk.hasObjects) { if (budget-- <= 0) break; this.buildObjects(chunk); }
    }
    for (const chunk of this.chunks.values()) {
      const d = Math.max(Math.abs(chunk.cx - pcx), Math.abs(chunk.cz - pcz));
      if (d > TERRAIN_RADIUS + 1) { this.dropObjects(chunk); this.scene.remove(chunk.mesh); chunk.mesh.geometry.dispose(); this.chunks.delete(chunk.key); }
      else if (d > OBJECT_RADIUS + 1 && chunk.hasObjects) this.dropObjects(chunk);
    }
  }

  // Resource nodes near (x, z) in loaded chunks.
  nodesNear(x, z, r) {
    const out = [], pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const chunk = this.chunks.get(`${pcx + dx},${pcz + dz}`);
      if (chunk) for (const n of chunk.nodes) if (!this.hidden.has(n.id) && Math.abs(n.x - x) < r && Math.abs(n.z - z) < r) out.push(n);
    }
    return out;
  }

  // ---------- entities ----------
  // Keep one mesh per item of `list` under the named group; `make(item)` builds a new one.
  sync(group, list, make, place) {
    const map = this.entities.get(group) ?? new Map(), live = new Set();
    this.entities.set(group, map);
    for (const item of list) {
      live.add(item.id);
      let mesh = map.get(item.id);
      if (!mesh) { mesh = make(item); map.set(item.id, mesh); this.scene.add(mesh); }
      place(mesh, item);
    }
    for (const [id, mesh] of map) if (!live.has(id)) { this.scene.remove(mesh); map.delete(id); }
  }

  // Pose a body: position, facing, legs and wings.
  pose(mesh, e, walk, now) {
    const u = mesh.userData;
    mesh.position.set(e.x, e.y, e.z);
    mesh.rotation.y = u.faces === 'z' ? -e.yaw + Math.PI / 2 : -e.yaw;
    u.legs?.forEach((leg, i) => { const s = Math.sin(walk * 2.2 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * .5; if (u.faces === 'z') leg.rotation.x = s; else leg.rotation.z = s; });
    u.wings?.forEach((w, i) => { if (u.plan === 'biped') w.rotation.z = Math.sin(walk * 2.2 + i * Math.PI) * .5; else w.rotation.x = Math.sin(now * 14 + i * Math.PI) * .7 * (i ? 1 : -1); });
    u.segs?.forEach((s, i) => { if (u.plan === 'serpent') s.position.z = Math.sin(walk * 1.5 - i * .9) * .25 * (i + 1) * .4; else s.scale.y = s.scale.x * (.85 + Math.sin(now * 5) * .1); });
  }

  syncWorld(state) {
    const { creatures, allies, boss, buildings, projectiles, elders, now } = state;
    this.sync('creatures', creatures, c => { const b = CREATURE[c.kind]; return this.creature(b.plan, b.size, b.color, b.accent, b); }, (m, c) => {
      this.pose(m, c, c.walk, now);
      m.visible = true;
      m.scale.setScalar(c.hurt > 2.8 ? 1.12 : 1);
    });
    this.sync('allies', allies, a => a.ally === 'witch' ? this.witch(a.cls) : a.ally === 'fox' ? this.familiar('fox') : (() => { const s = ALLIES[a.ally]; return this.creature(a.ally === 'guardian' ? 'biped' : 'quad', s.size, s.color, '#9a6bff', { horns: true }); })(), (m, a) => this.pose(m, a, a.walk, now));
    this.sync('elders', elders, e => this.witch(e.cls, 1.05), (m, e) => this.pose(m, e, 0, now));
    this.sync('boss', boss ? [boss] : [], () => this.boss(), (m, b) => { this.pose(m, b, b.walk, now); m.userData.ward.visible = b.warded; m.userData.ward.rotation.y = now; });
    this.sync('buildings', buildings, b => this.building(b.type), (m, b) => { m.position.set(b.x, b.y, b.z); m.rotation.y = b.rot ?? 0; });
    this.sync('projectiles', projectiles, p => new THREE.Mesh(this.ball, this.mat(p.color, true)), (m, p) => m.position.set(p.x, p.y, p.z));
  }

  // A floating label. Drawn with canvas text, so names are never parsed as HTML.
  nameTag(text) {
    const c = document.createElement('canvas'), g = c.getContext('2d');
    c.width = 512; c.height = 96;
    g.font = 'bold 40px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = '#000000b0'; g.strokeText(text, 256, 48);
    g.fillStyle = '#f2ecf8'; g.fillText(text, 256, 48);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    tag.scale.set(4, .75, 1); tag.position.y = 3.1;
    return tag;
  }

  // Other players: a witch of their class with their name (and coven) overhead.
  syncRemotes(list, now) {
    this.sync('remotes', list, r => {
      const g = this.witch(r.cls);
      g.add(this.nameTag(r.coven ? `${r.name} ‹${r.coven}›` : r.name));
      g.userData.cls = r.cls;
      return g;
    }, (m, r) => {
      this.pose(m, r, 0, now);
      const u = m.userData;
      u.legs.forEach((leg, i) => { leg.rotation.x = r.moving ? Math.sin(r.walk * 1.7 + i * Math.PI) * .6 : 0; });
      u.arm.rotation.x = r.swing > 0 ? -2.2 * Math.sin((1 - r.swing) * Math.PI) : 0;
      m.visible = r.hp > 0;
    });
  }

  // A ring that expands and fades: spell areas and impacts.
  ring(x, y, z, radius, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(.85, 1, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y + .3, z); m.scale.setScalar(radius * .3);
    this.scene.add(m); this.effects.push({ m, t: 0, radius });
  }

  ensurePlayer(classId, familiar) {
    if (this.playerClass === classId) return;
    if (this.player) this.scene.remove(this.player, this.pet);
    this.playerClass = classId;
    this.player = this.witch(classId); this.scene.add(this.player);
    this.pet = familiar === 'fox' ? null : this.familiar(familiar);
    if (this.pet) this.scene.add(this.pet);
  }

  render(state) {
    const { player, yaw, pitch, dayTime, now, swing, toolName, lights, moving, sight, dt } = state;
    const w = this.player, u = w.userData;
    w.position.set(player.x, player.y, player.z); w.rotation.y = -player.yaw + Math.PI / 2;
    u.legs.forEach((leg, i) => { leg.rotation.x = moving ? Math.sin(now * 10 + i * Math.PI) * .6 : 0; });
    u.arm.rotation.x = swing > 0 ? -2.2 * Math.sin((1 - swing) * Math.PI) : moving ? Math.sin(now * 10) * .3 : 0;
    u.tool.visible = toolName !== 'fists';
    if (this.pet) {
      const t = this.pet, raven = t.userData.plan === 'bird', tx = player.x - Math.cos(player.yaw + .9) * 1.4, tz = player.z - Math.sin(player.yaw + .9) * 1.4;
      t.position.x += (tx - t.position.x) * Math.min(1, dt * 5); t.position.z += (tz - t.position.z) * Math.min(1, dt * 5);
      t.position.y = raven ? player.y + 2.6 + Math.sin(now * 2) * .2 : this.world.ground(t.position.x, t.position.z);
      t.rotation.y = -player.yaw;
      this.pose(t, { x: t.position.x, y: t.position.y, z: t.position.z, yaw: player.yaw }, moving ? now * 6 : 0, now);
    }

    const dist = 6.5, cx = player.x - Math.cos(yaw) * Math.cos(pitch) * dist, cz = player.z - Math.sin(yaw) * Math.cos(pitch) * dist;
    const cy = Math.max(player.y + 1.8 + Math.sin(pitch) * dist, this.world.ground(cx, cz) + .6, .8);
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(player.x, player.y + 1.6, player.z);

    // Day/night: dayTime 0..1, 0.25 sunrise, 0.5 noon, 0.75 sunset.
    const a = (dayTime - .25) * Math.PI * 2, sunH = Math.sin(a);
    const day = THREE.MathUtils.smoothstep(sunH, -.12, .25), dusk = Math.max(0, 1 - Math.abs(sunH) / .3) * .8, see = sight ? .5 : 0;
    const sky = NIGHT.clone().lerp(DAY, Math.max(day, see * .4)).lerp(DUSK, dusk * .5);
    this.scene.background.copy(sky); this.scene.fog.color.copy(sky);
    this.sun.intensity = .3 + 2 * day; this.hemi.intensity = .55 + 1.1 * Math.max(day, see);
    this.sun.position.set(player.x + Math.cos(a) * 100, player.y + Math.abs(sunH) * 100 + 20, player.z + 35);
    this.sun.target.position.set(player.x, player.y, player.z);

    const near = [...lights].sort((f, g) => Math.hypot(f.x - player.x, f.z - player.z) - Math.hypot(g.x - player.x, g.z - player.z));
    this.lights.forEach((l, i) => { const f = near[i]; l.intensity = f && day < .6 ? 16 + Math.sin(now * 13 + i) * 3 : 0; if (f) l.position.set(f.x, f.y + 1.5, f.z); });
    this.effects = this.effects.filter(e => {
      e.t += dt; e.m.scale.setScalar(e.radius * (.3 + e.t * 1.6)); e.m.material.opacity = Math.max(0, .8 - e.t * 1.4);
      if (e.t > .6) { this.scene.remove(e.m); e.m.geometry.dispose(); e.m.material.dispose(); return false; }
      return true;
    });
    this.renderer.render(this.scene, this.camera);
  }
}
