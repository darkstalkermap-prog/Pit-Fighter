// The witch heroes: detailed, smooth-shaded models with faces, flowing hair, layered robes and every piece of
// equipped gear shown on the body, richer with rarity. Everything else in the world stays low-detail; these are
// the characters the camera lives with. Faces +z, feet at y = 0, about 2.7 m to the hat's tip.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const PALETTES = {
  bog: { robe: '#3f5a2e', under: '#26361b', trim: '#a8b85a', hat: '#232b1a', band: '#6b7a3a', hair: '#4a5a32', skin: '#dcc4a2', eyes: '#9fd860', lips: '#7a4a48', shawl: '#55663a' },
  hex: { robe: '#2b1d3d', under: '#150e20', trim: '#9a6bff', hat: '#120c1a', band: '#5a2a8a', hair: '#e6e2ee', skin: '#ecd6cc', eyes: '#c084ff', lips: '#5a2040', shawl: '#1e1330' },
  bloom: { robe: '#c26f9c', under: '#8e3f6c', trim: '#ffd86a', hat: '#5e3350', band: '#ffb0d8', hair: '#e09038', skin: '#f2d4ba', eyes: '#4fd0c0', lips: '#c0506a', shawl: '#f0c8dc' },
  wild: { robe: '#5a4426', under: '#382a16', trim: '#7ab04a', hat: '#2d4a22', band: '#8a6a3a', hair: '#7a341a', skin: '#c99a78', eyes: '#e0b030', lips: '#8a4a3a', shawl: '#6e5a3e' },
};
// Rarity accents: trim colour, metal colour, metalness/roughness, and glow strength.
const TIERS = [
  { trim: '#8a8a86', metal: '#6c6a66', metalness: .5, roughness: .7, glow: 0 },
  { trim: '#3fc75a', metal: '#9a7a4a', metalness: .7, roughness: .45, glow: 0 },
  { trim: '#4d94ff', metal: '#c8d2e0', metalness: .9, roughness: .3, glow: .4 },
  { trim: '#b45cff', metal: '#9c8cc0', metalness: .95, roughness: .25, glow: .9 },
  { trim: '#ffb43a', metal: '#e8b84a', metalness: 1, roughness: .22, glow: 1.4 },
];

const V2 = (r, y) => new THREE.Vector2(r, y), V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const lathe = (pts, segs = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => V2(r, y)), segs);
const curve = pts => new THREE.CatmullRomCurve3(pts.map(p => V3(...p)));
// A tube that narrows along its length: `taper(t)` scales the radius at t in 0..1.
function taperedTube(points, radius, taper, segs = 24, radial = 8) {
  const c = curve(points), geo = new THREE.TubeGeometry(c, segs, radius, radial, false), pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const center = c.getPointAt(i / segs), k = taper(i / segs);
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(center).multiplyScalar(k).add(center);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

// Materials are shared by colour and finish. The environment map gives metal and gems their shine.
export class HeroKit {
  constructor(envMap) { this.envMap = envMap; this.cache = new Map(); this.all = []; this.sparkle = null; }
  mat(color, { metal = 0, rough = .8, glow = 0, glowColor, opacity = 1, side = THREE.FrontSide } = {}) {
    const key = [color, metal, rough, glow, glowColor, opacity, side].join();
    if (!this.cache.has(key)) {
      const m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, envMap: this.envMap, envMapIntensity: .5, side, transparent: opacity < 1, opacity, ...(glow ? { emissive: glowColor ?? color, emissiveIntensity: glow } : {}) });
      this.cache.set(key, m); this.all.push(m);
    }
    return this.cache.get(key);
  }
  // Daylight dims the reflections, so heroes don't glow at night.
  setDaylight(day) { for (const m of this.all) m.envMapIntensity = .2 + .45 * day; }
}

// Merge the rigid pieces under each group that share a material into one mesh: a hero is drawn in a few
// dozen calls instead of over a hundred. Meshes marked `keep` (animated or toggled on their own) stay apart.
export function mergeStatic(node) {
  for (const child of [...node.children]) if (child.isGroup) mergeStatic(child);
  const byMaterial = new Map();
  for (const child of node.children) if (child.isMesh && !child.userData.keep) (byMaterial.get(child.material) ?? byMaterial.set(child.material, []).get(child.material)).push(child);
  for (const [material, meshes] of byMaterial) {
    if (meshes.length < 2) continue;
    const parts = meshes.map(m => { m.updateMatrix(); const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; });
    for (const m of meshes) { node.remove(m); m.geometry.dispose(); }
    node.add(new THREE.Mesh(mergeGeometries(parts), material));
    for (const g of parts) g.dispose();
  }
}

export class Hero {
  constructor(kit, classId, look = {}, { scale = 1 } = {}) {
    this.kit = kit; this.cls = classId; this.pal = PALETTES[classId] ?? PALETTES.wild;
    this.root = new THREE.Group(); this.root.scale.setScalar(scale);
    this.phase = 0; this.sway = 0; this.lookKey = null; this.gear = [];
    this.buildBody();
    mergeStatic(this.root);
    this.setLook(look);
  }

  keep(mesh) { mesh.userData.keep = true; return mesh; }
  add(parent, geo, material, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); parent.add(m); return m; }
  m(color, opts) { return this.kit.mat(color, opts); }

  buildBody() {
    const P = this.pal, root = this.root, skin = this.m(P.skin, { rough: .55 });
    // A soft shadow keeps her on the ground.
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(.55, 24), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: .32, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = .03; shadow.userData.keep = true; root.add(shadow);

    const body = this.body = new THREE.Group(); root.add(body);
    // Legs: hip → thigh → knee → shin → boot, under the skirt.
    this.legs = [-1, 1].map(side => {
      const hip = new THREE.Group(); hip.position.set(side * .085, .95, 0); body.add(hip);
      this.add(hip, new THREE.CapsuleGeometry(.065, .32, 4, 10), this.m(P.under), 0, -.22, 0);
      const knee = new THREE.Group(); knee.position.y = -.46; hip.add(knee);
      this.add(knee, new THREE.CapsuleGeometry(.055, .3, 4, 10), this.m(P.under), 0, -.2, 0);
      const boot = new THREE.Group(); boot.position.y = -.42; knee.add(boot);
      return { hip, knee, boot };
    });

    // Skirt: a flared lathe with a tattered hem, over a darker underskirt.
    const skirt = (pts, color, ragged) => {
      const geo = lathe(pts, 36), pos = geo.attributes.position, n = pts.length;
      for (let i = 0; i <= 36; i++) { const idx = i * n + n - 1; pos.setY(idx, pos.getY(idx) + (i % 3 === 0 ? -ragged : i % 3 === 1 ? ragged * .4 : 0)); }
      geo.computeVertexNormals();
      return geo;
    };
    this.skirt = new THREE.Group(); this.skirt.position.y = 1.06; body.add(this.skirt);
    this.add(this.skirt, skirt([[.17, 0], [.2, -.12], [.3, -.4], [.43, -.66], [.5, -.78]], P.under, .07), this.m(P.under, { side: THREE.DoubleSide }));
    this.robeSkirt = this.keep(this.add(this.skirt, skirt([[.175, .01], [.21, -.12], [.29, -.36], [.4, -.58], [.46, -.69]], P.robe, .05), this.m(P.robe, { side: THREE.DoubleSide })));

    // Torso: a fitted bodice with lacing, a belt with buckle, a pouch and a potion.
    const torso = this.torso = new THREE.Group(); torso.position.y = 1.04; body.add(torso);
    this.bodice = this.keep(this.add(torso, lathe([[.16, 0], [.165, .1], [.19, .26], [.2, .33], [.17, .41], [.09, .47], [.001, .48]]), this.m(P.robe)));
    this.bodice.scale.z = .82;
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
      const lace = this.add(torso, new THREE.CylinderGeometry(.005, .005, .085, 4), this.m(P.trim, { rough: .5 }), 0, .07 + i * .065, .15 + i * .006);
      lace.rotation.z = s * 1.0;
    }
    this.add(torso, new THREE.TorusGeometry(.172, .022, 6, 32), this.m('#3a2618', { rough: .6 }), 0, .02, 0).rotation.x = Math.PI / 2;
    this.buckle = this.add(torso, new THREE.TorusGeometry(.028, .008, 4, 4), this.m('#b8963a', { metal: 1, rough: .3 }), 0, .02, .145);
    const pouch = this.add(torso, new THREE.CapsuleGeometry(.045, .05, 4, 8), this.m('#5a3a22', { rough: .7 }), .15, -.06, .07); pouch.scale.z = .6;
    this.add(torso, new THREE.CylinderGeometry(.022, .026, .08, 10), this.m('#bfe8ff', { rough: .1, opacity: .45 }), -.16, -.07, .06);
    this.add(torso, new THREE.CylinderGeometry(.018, .022, .055, 10), this.m(P.trim, { glow: .9, rough: .3 }), -.16, -.08, .06);
    this.add(torso, new THREE.CylinderGeometry(.011, .011, .02, 6), this.m('#8a6a3a'), -.16, -.025, .06);

    // Shawl across the shoulders, in each path's style.
    this.shawl = this.keep(this.add(torso, lathe([[.19, .3], [.25, .36], [.24, .42], [.17, .46], [.1, .48]], 28), this.m(P.shawl, { side: THREE.DoubleSide })));
    this.shawl.scale.z = .85;
    if (this.cls === 'wild') for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, f = this.add(torso, new THREE.IcosahedronGeometry(.045, 1), this.m('#8a7458', { rough: 1 }), Math.cos(a) * .21, .43, Math.sin(a) * .17); f.scale.y = .7; }
    if (this.cls === 'hex') { const collar = this.add(torso, lathe([[.07, .45], [.1, .5], [.15, .6]], 24), this.m('#1a1024', { side: THREE.DoubleSide, opacity: .9 })); collar.scale.z = .7; collar.position.z = -.03; }

    // Arms: shoulder → elbow → hand, with bell sleeves. Right is -x (she faces +z).
    this.arms = [1, -1].map(side => {
      const shoulder = new THREE.Group(); shoulder.position.set(side * .22, .42, 0); torso.add(shoulder);
      this.add(shoulder, new THREE.SphereGeometry(.065, 12, 10), this.m(P.robe));
      this.add(shoulder, new THREE.CapsuleGeometry(.048, .2, 4, 10), this.m(P.robe), 0, -.14, 0);
      const elbow = new THREE.Group(); elbow.position.y = -.28; shoulder.add(elbow);
      this.add(elbow, new THREE.CapsuleGeometry(.04, .18, 4, 10), skin, 0, -.12, 0);
      const sleeve = this.add(elbow, lathe([[.055, .03], [.07, -.08], [.11, -.2], [.13, -.24]], 20), this.m(P.robe, { side: THREE.DoubleSide }));
      this.add(elbow, new THREE.TorusGeometry(.128, .012, 6, 24), this.m(P.trim, { rough: .5 }), 0, -.24, 0).rotation.x = Math.PI / 2;
      sleeve.userData.sleeve = true;
      const hand = new THREE.Group(); hand.position.y = -.27; elbow.add(hand);
      const palm = this.add(hand, new THREE.SphereGeometry(.042, 12, 10), skin); palm.scale.set(.8, 1, .55);
      for (let f = 0; f < 4; f++) { const finger = this.add(hand, new THREE.CapsuleGeometry(.009, .045, 3, 6), skin, (f - 1.5) * .017 * side, -.055, .006); finger.rotation.x = .25; }
      this.add(hand, new THREE.CapsuleGeometry(.01, .035, 3, 6), skin, .028 * side, -.02, .02).rotation.z = -side * .7;
      return { shoulder, elbow, hand, side };
    });

    // Neck and head: a face with eyes, brows, nose and lips.
    const head = this.head = new THREE.Group(); head.position.y = .62; torso.add(head);
    this.add(torso, new THREE.CylinderGeometry(.045, .055, .12, 12), skin, 0, .52, 0);
    this.add(torso, new THREE.TorusGeometry(.05, .009, 6, 20), this.m(P.band, { rough: .5 }), 0, .53, 0).rotation.x = Math.PI / 2;
    // One smooth head: rounded above, narrowing below into cheeks and a soft chin.
    const skull = new THREE.SphereGeometry(.125, 36, 28), hp = skull.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i), low = Math.max(0, -y / .125);
      hp.setXYZ(i, x * (1 - low * .3), y * 1.12, z * 1.05 + (z > 0 ? low * low * .025 : 0));
    }
    skull.computeVertexNormals();
    this.add(head, skull, skin);
    for (const s of [-1, 1]) {
      const ear = this.add(head, new THREE.ConeGeometry(.022, .07, 8), skin, s * .122, .0, -.02); ear.rotation.set(-1.0, 0, -s * .5);
      this.add(head, new THREE.SphereGeometry(.024, 14, 12), this.m('#f8f6f0', { rough: .3 }), s * .045, .01, .108).scale.set(1.15, .8, .6);
      this.add(head, new THREE.SphereGeometry(.0135, 12, 10), this.m(P.eyes, { glow: .45, rough: .2 }), s * .045, .009, .121);
      this.add(head, new THREE.SphereGeometry(.006, 8, 6), this.m('#111', { rough: .1 }), s * .045, .009, .1305);
      const lid = this.add(head, new THREE.TorusGeometry(.024, .0045, 4, 14, Math.PI), this.m('#1a1210'), s * .045, .012, .118); lid.scale.set(1.15, .9, .5);
      this.add(head, taperedTube([[s * .022, .045, .121], [s * .048, .053, .12], [s * .072, .046, .112]], .0055, t => 1 - t * .5, 8, 5), this.m(P.hair));
    }
    this.add(head, new THREE.SphereGeometry(.014, 12, 10), skin, 0, -.022, .137).scale.set(.9, 1.5, 1);
    this.add(head, new THREE.SphereGeometry(.016, 12, 8), this.m(P.lips, { rough: .4 }), 0, -.062, .126).scale.set(1.3, .38, .5);
    this.add(head, new THREE.SphereGeometry(.015, 12, 8), this.m(P.lips, { rough: .4 }), 0, -.071, .123).scale.set(1.15, .42, .5);
    for (const s of [-1, 1]) this.add(head, new THREE.SphereGeometry(.02, 10, 8), this.m('#e89a9a', { rough: .7, opacity: .3 }), s * .066, -.03, .108).scale.set(1, .7, .4);

    // Hair: a cap, side locks and long strands down the back that sway as she moves.
    const hairMat = this.m(P.hair, { rough: .45 });
    this.hair = new THREE.Group(); head.add(this.hair);
    // The crown of the head stops above the brows; the back hair wraps only the back and sides.
    const cap = this.add(this.hair, new THREE.SphereGeometry(.135, 28, 16, 0, Math.PI * 2, 0, Math.PI * .36), hairMat, 0, .012, -.006); cap.scale.set(1.04, 1.1, 1.08);
    const back = this.add(this.hair, new THREE.SphereGeometry(.14, 24, 14, Math.PI * .82, Math.PI * 1.36, Math.PI * .2, Math.PI * .62), hairMat, 0, .005, -.01); back.scale.set(1.03, 1.1, 1.08);
    // A parted fringe sweeping to each side.
    for (const s of [-1, 1]) this.add(this.hair, taperedTube([[s * .01, .14, .1], [s * .07, .12, .125], [s * .115, .07, .11], [s * .13, .0, .08]], .026, t => 1 - t * .55, 14, 7), hairMat);
    this.strands = new THREE.Group(); this.strands.position.set(0, .02, -.07); this.hair.add(this.strands);
    for (let i = 0; i < 11; i++) {
      const a = (i / 10 - .5) * 2.4, x = Math.sin(a) * .12, z = -Math.cos(a) * .09 + .06, len = .5 + (i % 3) * .08;
      this.add(this.strands, taperedTube([[x, 0, z], [x * 1.3, -.15, z - .05], [x * 1.2, -.3 - len * .2, z - .07], [x * 1.05, -.3 - len * .6, z - .04]], .028, t => 1 - t * .7, 18, 7), hairMat);
    }
    for (const s of [-1, 1]) this.add(this.hair, taperedTube([[s * .11, .03, .06], [s * .135, -.08, .08], [s * .13, -.2, .07], [s * .11, -.3, .05]], .022, t => 1 - t * .6, 14, 6), hairMat);

    // Disguise for Glamour: a plain traveller's hood and cloak over everything.
    const plain = this.m('#6a5238', { rough: .9, side: THREE.DoubleSide });
    this.disguise = new THREE.Group(); this.disguise.visible = false; body.add(this.disguise);
    this.add(this.disguise, lathe([[.07, 1.6], [.24, 1.48], [.28, 1.2], [.36, .7], [.46, .2], [.48, .14]], 28), plain);
    this.add(this.disguise, new THREE.SphereGeometry(.17, 20, 14, 0, Math.PI * 2, 0, Math.PI * .62), plain, 0, 1.67, -.015).scale.set(1, 1.15, 1.12);

    // The broom, shown when riding: a gnarled handle, bindings and a fan of straw.
    this.broom = new THREE.Group(); this.broom.visible = false; this.broom.position.y = .62; root.add(this.broom);
    this.add(this.broom, taperedTube([[0, 0, 1.3], [.02, .03, .6], [-.02, -.01, -.1], [0, 0, -.75]], .032, t => .8 + t * .3, 24, 7), this.m('#5c3e24', { rough: .7 }));
    const straw = lathe([[.04, 0], [.09, -.12], [.17, -.45], [.2, -.62], [.0, -.6]], 20), sp = straw.attributes.position;
    for (let i = 0; i < sp.count; i++) { const y = sp.getY(i); if (y < -.5) { sp.setX(i, sp.getX(i) * (1 + Math.sin(i * 7.1) * .18)); sp.setZ(i, sp.getZ(i) * (1 + Math.cos(i * 5.3) * .18)); sp.setY(i, y - Math.abs(Math.sin(i * 3.7)) * .08); } }
    straw.computeVertexNormals();
    const bristles = this.add(this.broom, straw, this.m('#c9a65a', { rough: .9, side: THREE.DoubleSide }), 0, 0, -.72); bristles.rotation.x = -Math.PI / 2;
    for (const z of [-.76, -.86]) this.add(this.broom, new THREE.TorusGeometry(.06, .012, 6, 18), this.m('#7a2a2a', { rough: .6 }), 0, 0, z);
  }

  // Remove a gear group and its geometry.
  clearGear() {
    for (const g of this.gear) { g.parent?.remove(g); g.traverse(o => o.geometry?.dispose()); }
    this.gear = [];
  }
  wear(parent, group) { parent.add(group); this.gear.push(group); return group; }

  // `look`: slot → [kind, rarity]. Rebuilds only what's worn; the body stays.
  setLook(look = {}) {
    const key = JSON.stringify(look);
    if (key === this.lookKey) return;
    this.lookKey = key; this.clearGear(); this.orb = null;
    const [headKind, headR] = look.head ?? ['hat', -1];
    this.hoodUp = headKind === 'hood';
    // Head: the witch's hat (the default), a hood, or a circlet.
    if (headKind === 'hood') this.hood(headR); else if (headKind === 'circlet') this.circlet(headR); else this.hat(headR);
    // Chest: robe trims, a leather jerkin, or plate mail with pauldrons.
    const [chestKind, chestR] = look.chest ?? ['robe', -1];
    this.robeTrim(chestKind === 'robe' ? chestR : -1);
    if (chestKind === 'jerkin') this.jerkin(chestR);
    if (chestKind === 'mail') this.mail(chestR);
    if (look.hands) this.handwear(...look.hands);
    this.legs.forEach(l => this.boot(l.boot, look.feet?.[1] ?? -1));
    if (look.cloak) this.cape(look.cloak[1]);
    if (look.amulet) this.amulet(look.amulet[1]);
    if (look.weapon) this.weapon(...look.weapon);
    for (const g of this.gear) mergeStatic(g);
    this.capeMesh = this.gear.find(g => g.userData.cape)?.userData.cape ?? null;
  }

  // The classic hat: wide curled brim, bent cone, band and buckle; decorated by path; richer with rarity.
  hat(r) {
    const P = this.pal, T = TIERS[Math.max(0, r)], g = this.wear(this.head, new THREE.Group());
    g.position.set(0, .085, -.01); g.rotation.set(-.12, 0, .08);
    const brim = lathe([[.1, .01], [.2, 0], [.33, .005], [.42, .03], [.445, .06]], 40);
    this.add(g, brim, this.m(P.hat, { rough: .75, side: THREE.DoubleSide }));
    const crown = lathe([[.16, 0], [.15, .1], [.12, .25], [.085, .4], [.05, .56], [.022, .7], [.002, .8]], 30), cp = crown.attributes.position;
    for (let i = 0; i < cp.count; i++) { const t = cp.getY(i) / .8; cp.setZ(i, cp.getZ(i) - .2 * t ** 2.4); cp.setX(i, cp.getX(i) + .05 * t ** 3); cp.setY(i, cp.getY(i) - .08 * t ** 3); }
    crown.computeVertexNormals();
    this.add(g, crown, this.m(P.hat, { rough: .75 }));
    const bandColor = r >= 0 ? T.trim : P.band;
    this.add(g, new THREE.CylinderGeometry(.152, .158, .055, 30, 1, true), this.m(bandColor, { rough: .5, side: THREE.DoubleSide, glow: r >= 3 ? .25 : 0 }), 0, .035, 0);
    const buckle = this.add(g, new THREE.TorusGeometry(.03, .008, 4, 4), this.m(r >= 0 ? T.metal : '#b8963a', { metal: 1, rough: .3 }), 0, .035, .158); buckle.rotation.z = Math.PI / 4;
    if (r >= 2) this.add(g, new THREE.OctahedronGeometry(.018, 0), this.m(T.trim, { glow: 1.2, rough: .1, metal: .3 }), 0, .035, .162);
    // A charm dangling from the tip.
    const tip = new THREE.Group(); tip.position.set(.05, .72, -.2); g.add(tip); this.hatTip = tip;
    if (this.cls === 'hex') { this.add(tip, new THREE.TorusGeometry(.035, .009, 6, 16, Math.PI * 1.3), this.m('#d8d4ff', { glow: .6, metal: .8, rough: .2 }), 0, -.06, 0); this.add(g, taperedTube([[-.12, .05, .08], [-.18, .2, .05], [-.2, .33, .02]], .018, t => 1 - t * .9, 12, 5), this.m('#111018', { rough: .4 })); }
    if (this.cls === 'bog') for (let i = 0; i < 3; i++) { const x = .23 + i * .05, z = .18 - i * .1; this.add(g, new THREE.CylinderGeometry(.012, .015, .05, 8), this.m('#e8dcc0'), x, .04, z); this.add(g, new THREE.SphereGeometry(.035 - i * .006, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.m(i ? '#c96a3a' : '#b03a2a', { rough: .6 }), x, .06, z); }
    if (this.cls === 'bog') for (let i = 0; i < 6; i++) this.add(g, new THREE.IcosahedronGeometry(.03, 0), this.m('#5f7a34', { rough: 1 }), Math.cos(i) * .3, .02, Math.sin(i * 1.7) * .3);
    if (this.cls === 'bloom') for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, f = new THREE.Group(); f.position.set(Math.cos(a) * .158, .04, Math.sin(a) * .158); g.add(f); for (let k = 0; k < 5; k++) { const pa = k / 5 * Math.PI * 2; this.add(f, new THREE.SphereGeometry(.018, 8, 6), this.m(i % 2 ? '#ffd0e8' : '#ffffff', { rough: .6 }), Math.cos(pa) * .02, Math.sin(pa) * .02, 0).scale.z = .4; } this.add(f, new THREE.SphereGeometry(.012, 8, 6), this.m('#ffd84a', { glow: .3 })); f.lookAt(f.position.x * 3, .04, f.position.z * 3); }
    if (this.cls === 'wild') { for (const s of [-1, 1]) this.add(g, taperedTube([[s * .1, .05, -.02], [s * .2, .2, -.05], [s * .24, .32, -.02], [s * .3, .38, .04]], .016, t => 1 - t * .6, 14, 5), this.m('#cbb790', { rough: .6 })); for (let i = 0; i < 5; i++) { const leaf = this.add(g, new THREE.SphereGeometry(.05, 10, 6), this.m(i % 2 ? '#5f8a34' : '#8aa83a', { rough: .7 }), .12 + i * .02, .05, .1 - i * .05); leaf.scale.set(1, .15, .45); leaf.rotation.y = i; } }
    if (r >= 3) this.sparkles(g, T.trim, .2, .35);
  }

  hood(r) {
    const T = TIERS[Math.max(0, r)], cloth = r >= 1 ? this.tint(this.pal.shawl, T.trim) : '#6a5238', g = this.wear(this.head, new THREE.Group());
    this.add(g, new THREE.SphereGeometry(.17, 24, 16, 0, Math.PI * 2, 0, Math.PI * .62), this.m(cloth, { rough: .85, side: THREE.DoubleSide }), 0, .02, -.02).scale.set(1, 1.12, 1.12);
    const point = this.add(g, new THREE.ConeGeometry(.07, .22, 16), this.m(cloth, { rough: .85 }), 0, .12, -.17); point.rotation.x = -1.1;
    this.add(g, new THREE.TorusGeometry(.15, .012, 6, 28, Math.PI * 1.2), this.m(T.trim, { rough: .5, glow: T.glow * .2 }), 0, .02, .02).rotation.set(0, 0, -Math.PI * .1 + Math.PI);
    this.add(g, lathe([[.16, -.1], [.25, -.2], [.27, -.25]], 24), this.m(cloth, { rough: .85, side: THREE.DoubleSide }), 0, -.08, 0);
  }

  circlet(r) {
    const T = TIERS[Math.max(0, r)], metal = this.m(T.metal, { metal: T.metalness, rough: T.roughness }), g = this.wear(this.head, new THREE.Group());
    g.position.y = .07; g.rotation.x = -.15;
    this.add(g, new THREE.TorusGeometry(.135, .012, 8, 36), metal).rotation.x = Math.PI / 2;
    for (let i = 0; i < 7; i++) { const a = (i / 6 - .5) * 1.6 + Math.PI / 2, spike = this.add(g, new THREE.ConeGeometry(.012, .06 + (i === 3 ? .05 : 0), 6), metal, Math.cos(a) * .135, .03 + (i === 3 ? .025 : 0), Math.sin(a) * .135); spike.rotation.z = 0; }
    this.add(g, new THREE.OctahedronGeometry(.025, 0), this.m(T.trim, { glow: .6 + T.glow, rough: .1 }), 0, .03, .14);
    if (r >= 3) this.sparkles(g, T.trim, .12, .2);
  }

  robeTrim(r) {
    if (r < 0) return;
    const T = TIERS[r], g = this.wear(this.body, new THREE.Group()), trim = this.m(T.trim, { rough: .45, metal: r >= 2 ? .6 : 0, glow: T.glow * .25 });
    this.add(g, new THREE.TorusGeometry(.455, .014, 6, 48), trim, 0, .39, 0).rotation.x = Math.PI / 2;
    this.add(g, new THREE.TorusGeometry(.2, .012, 6, 32), trim, 0, 1.38, 0).rotation.x = Math.PI / 2;
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, s = this.add(g, new THREE.BoxGeometry(.012, .62, .012), trim, Math.cos(a) * .33, .72, Math.sin(a) * .33); s.rotation.set(Math.sin(a) * .33, 0, -Math.cos(a) * .33); }
    if (r >= 3) for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; this.add(g, new THREE.OctahedronGeometry(.016, 0), this.m(T.trim, { glow: 1.1 }), Math.cos(a) * .44, .45, Math.sin(a) * .44); }
  }

  jerkin(r) {
    const T = TIERS[Math.max(0, r)], g = this.wear(this.torso, new THREE.Group());
    const vest = this.add(g, lathe([[.185, -.02], [.19, .1], [.21, .26], [.215, .34], [.18, .4]], 28), this.m('#5a3a22', { rough: .65, side: THREE.DoubleSide })); vest.scale.z = .84;
    for (let i = 0; i < 5; i++) this.add(g, new THREE.SphereGeometry(.012, 8, 6), this.m(T.metal, { metal: T.metalness, rough: T.roughness }), 0, .04 + i * .07, .178);
    for (const y of [.0, .38]) this.add(g, new THREE.TorusGeometry(.2, .01, 6, 32), this.m(T.trim, { rough: .5 }), 0, y, 0).rotation.x = Math.PI / 2;
  }

  mail(r) {
    const T = TIERS[Math.max(0, r)], metal = this.m(T.metal, { metal: T.metalness, rough: T.roughness }), g = this.wear(this.torso, new THREE.Group());
    // A fitted cuirass over the bodice: shaped plates with a ridge down the front and a trimmed edge.
    const plate = this.add(g, lathe([[.172, .02], [.177, .1], [.2, .25], [.208, .32], [.18, .4], [.12, .45]], 32), metal); plate.scale.z = .84;
    this.add(g, new THREE.BoxGeometry(.012, .3, .02), metal, 0, .2, .17).rotation.x = -.12;
    for (const y of [.02, .4]) this.add(g, new THREE.TorusGeometry(y ? .185 : .175, .009, 6, 32), this.m(T.trim, { metal: .8, rough: .3, glow: T.glow * .3 }), 0, y, 0).scale.z = .84;
    for (let i = 0; i < 3; i++) this.add(g, new THREE.TorusGeometry(.18, .005, 4, 32), this.m(T.trim, { metal: .8, rough: .35 }), 0, -.05 - i * .06, 0).scale.z = .9;
    for (const s of [-1, 1]) {
      const pauldron = this.add(g, new THREE.SphereGeometry(.085, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), metal, s * .225, .44, 0); pauldron.scale.set(1, .65, 1); pauldron.rotation.z = -s * .45;
      this.add(g, new THREE.TorusGeometry(.083, .008, 6, 24), this.m(T.trim, { metal: .8, rough: .3 }), s * .225, .44, 0).rotation.set(Math.PI / 2, s * .45, 0);
      if (r >= 3) for (let k = 0; k < 3; k++) this.add(g, new THREE.ConeGeometry(.014, .07, 6), metal, s * (.2 + k * .03), .5, -.02 + k * .02);
    }
    if (r >= 2) this.add(g, new THREE.OctahedronGeometry(.03, 0), this.m(T.trim, { glow: .8 + T.glow, rough: .1 }), 0, .3, .2);
    if (r >= 4) this.sparkles(g, T.trim, .3, .3, .25);
  }

  handwear(kind, r) {
    const T = TIERS[Math.max(0, r)];
    for (const arm of this.arms) {
      const g = this.wear(arm.hand, new THREE.Group());
      const glove = this.add(g, new THREE.SphereGeometry(.047, 12, 10), this.m(kind === 'bracers' ? this.pal.skin : '#4a3020', { rough: .6 })); glove.scale.set(.85, 1.05, .6);
      const cuff = this.wear(arm.elbow, new THREE.Group());
      this.add(cuff, new THREE.CylinderGeometry(.05, .045, .1, 14), kind === 'bracers' ? this.m(T.metal, { metal: T.metalness, rough: T.roughness }) : this.m('#4a3020', { rough: .6 }), 0, -.2, 0);
      this.add(cuff, new THREE.TorusGeometry(.05, .007, 5, 18), this.m(T.trim, { rough: .4, glow: T.glow * .3 }), 0, -.16, 0).rotation.x = Math.PI / 2;
      if (r >= 3) this.add(cuff, new THREE.OctahedronGeometry(.014, 0), this.m(T.trim, { glow: 1.2 }), 0, -.2, .05);
    }
  }

  boot(parent, r) {
    const T = TIERS[Math.max(0, r)], leather = this.m(r >= 0 ? '#3e2616' : '#2a1c12', { rough: .55 }), g = this.wear(parent, new THREE.Group());
    this.add(g, lathe([[.07, .14], [.068, .06], [.065, .0], [.06, -.03]], 16), leather);
    const toe = this.add(g, new THREE.SphereGeometry(.06, 14, 10), leather, 0, -.025, .05); toe.scale.set(.85, .55, 1.6);
    const tip = this.add(g, new THREE.ConeGeometry(.025, .08, 10), leather, 0, -.01, .15); tip.rotation.x = Math.PI / 2 - .6;
    this.add(g, new THREE.TorusGeometry(.068, .008, 5, 18), this.m(r >= 0 ? T.trim : '#5a3a22', { rough: .5 }), 0, .12, 0).rotation.x = Math.PI / 2;
    if (r >= 2) this.add(g, new THREE.SphereGeometry(.045, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.m(T.metal, { metal: T.metalness, rough: T.roughness }), 0, -.02, .1).scale.set(1, .5, 1.3);
  }

  // A cape from the shoulders, its cloth animated each frame.
  cape(r) {
    const T = TIERS[Math.max(0, r)], g = this.wear(this.torso, new THREE.Group());
    g.position.set(0, .44, -.13);
    const geo = new THREE.PlaneGeometry(.7, 1.25, 12, 18); geo.translate(0, -.625, 0);
    const cloth = r >= 2 ? this.tint(this.pal.under, T.trim) : this.pal.shawl;
    const mesh = this.add(g, geo, this.m(cloth, { rough: .8, side: THREE.DoubleSide }));
    mesh.userData.base = Float32Array.from(geo.attributes.position.array); mesh.userData.keep = true;
    // A collar of the rarity's colour where the cape is gathered at the shoulders.
    this.add(g, new THREE.TorusGeometry(.17, .016, 6, 24, Math.PI), this.m(T.trim, { rough: .45, glow: T.glow * .25 }), 0, .01, .1).rotation.set(Math.PI / 2, 0, Math.PI);
    for (const s of [-1, 1]) this.add(g, new THREE.SphereGeometry(.03, 12, 8), this.m(T.metal, { metal: T.metalness, rough: T.roughness }), s * .2, 0, .04);
    g.userData.cape = mesh;
  }

  amulet(r) {
    const T = TIERS[Math.max(0, r)], g = this.wear(this.torso, new THREE.Group());
    const chain = this.add(g, new THREE.TorusGeometry(.12, .005, 4, 32), this.m(T.metal, { metal: 1, rough: .3 }), 0, .44, .07); chain.rotation.x = Math.PI / 2 - .55; chain.scale.y = 1.1;
    this.add(g, new THREE.TorusGeometry(.032, .008, 6, 16), this.m(T.metal, { metal: 1, rough: .25 }), 0, .34, .175);
    this.add(g, new THREE.OctahedronGeometry(.026, 1), this.m(T.trim, { glow: .8 + T.glow, rough: .05, metal: .2 }), 0, .34, .18);
    if (r >= 3) this.sparkles(g, T.trim, .06, .1, .34);
  }

  // The weapon in her right hand (or the tool she's holding).
  weapon(kind, r) {
    const T = TIERS[Math.max(0, r)], hand = this.arms[1].hand, g = this.wear(hand, new THREE.Group());
    g.position.set(0, -.04, .02);
    const wood = this.m(r >= 3 ? '#2a1e2e' : '#5c3e24', { rough: .7 }), metal = this.m(T.metal, { metal: T.metalness, rough: T.roughness }), gem = this.m(T.trim, { glow: 1 + T.glow, rough: .05, metal: .2 });
    if (kind === 'staff') {
      this.add(g, taperedTube([[0, -.55, 0], [.02, 0, .01], [-.02, .5, 0], [.01, .95, .02], [0, 1.15, 0]], .022, t => 1.1 - t * .35, 30, 7), wood);
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; this.add(g, taperedTube([[0, 1.1, 0], [Math.cos(a) * .07, 1.2, Math.sin(a) * .07], [Math.cos(a) * .05, 1.32, Math.sin(a) * .05]], .012, t => 1 - t * .8, 10, 5), wood); }
      this.orb = this.keep(this.add(g, new THREE.IcosahedronGeometry(.065, 2), gem, 0, 1.24, 0));
      for (const y of [.3, .75]) this.add(g, new THREE.TorusGeometry(.026, .006, 5, 14), metal, 0, y, 0).rotation.x = Math.PI / 2;
      if (r >= 3) this.sparkles(g, T.trim, .14, .25, 1.24);
    } else if (kind === 'wand') {
      this.add(g, taperedTube([[0, -.1, 0], [0, .15, .01], [0, .38, 0]], .014, t => 1 - t * .6, 12, 6), wood);
      this.add(g, new THREE.TorusGeometry(.016, .005, 5, 12), metal, 0, -.02, 0).rotation.x = Math.PI / 2;
      this.orb = this.keep(this.add(g, new THREE.OctahedronGeometry(.03, 0), gem, 0, .41, 0));
      if (r >= 3) this.sparkles(g, T.trim, .06, .12, .41);
    } else if (kind === 'sickle') {
      this.add(g, new THREE.CylinderGeometry(.018, .02, .32, 8), wood, 0, .08, 0);
      const blade = this.add(g, new THREE.TorusGeometry(.17, .016, 4, 24, Math.PI * 1.1), metal, -.12, .3, 0); blade.scale.z = .25; blade.rotation.z = -.3;
      if (r >= 2) this.add(g, new THREE.OctahedronGeometry(.02, 0), gem, 0, .25, .02);
    } else if (kind === 'spear') {
      this.add(g, new THREE.CylinderGeometry(.018, .02, 2, 8), wood, 0, .4, 0);
      const head = this.add(g, new THREE.OctahedronGeometry(.07, 0), metal, 0, 1.47, 0); head.scale.set(.6, 2.2, .25);
      this.add(g, new THREE.TorusGeometry(.024, .007, 5, 12), this.m(T.trim, { rough: .4 }), 0, 1.36, 0).rotation.x = Math.PI / 2;
    } else if (kind === 'hatchet' || kind === 'pick') {
      this.add(g, new THREE.CylinderGeometry(.016, .02, .55, 8), wood, 0, .15, 0);
      const head = this.add(g, kind === 'pick' ? new THREE.ConeGeometry(.03, .34, 6) : new THREE.BoxGeometry(.14, .1, .025), metal, kind === 'pick' ? 0 : .06, .4, 0);
      if (kind === 'pick') head.rotation.z = Math.PI / 2;
    }
  }

  // Motes of light circling rare gear.
  sparkles(parent, color, radius, spread, y = 0) {
    const n = 14, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pos.set([Math.cos(a) * radius, (Math.sin(i * 2.7) * .5) * spread, Math.sin(a) * radius], i * 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: .035, transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.position.y = y; pts.userData.spin = true; parent.add(pts);
  }

  tint(a, b) { return '#' + new THREE.Color(a).lerp(new THREE.Color(b), .35).getHexString(); }

  // Animate. `s`: { moving, sprinting, swing (1→0 during a strike or cast), mounted, flying, glamour }.
  update(dt, now, s = {}) {
    const move = s.moving ? 1 : 0;
    this.sway += ((s.flying ? 1.4 : move * (s.sprinting ? 1 : .6)) - this.sway) * Math.min(1, dt * 4);
    this.phase += dt * (s.moving && !s.mounted ? (s.sprinting ? 11 : 8) : 0);
    const ph = this.phase, walk = s.mounted ? 0 : move, breath = Math.sin(now * 2.1);
    this.broom.visible = !!s.mounted;
    this.disguise.visible = !!s.glamour;
    for (const g of this.gear) if (g.parent === this.head || g.parent === this.torso || g.parent === this.body) g.visible = !s.glamour;
    this.shawl.visible = this.bodice.visible = this.robeSkirt.visible = !s.glamour;
    this.hair.visible = !s.glamour && !this.hoodUp;

    this.body.position.y = s.mounted ? -.12 : Math.abs(Math.sin(ph)) * .035 * walk;
    this.body.rotation.x = s.flying ? .18 * Math.min(1, this.sway) : walk * .06;
    this.torso.scale.set(1 + breath * .006, 1 + breath * .012, 1 + breath * .006);
    this.legs.forEach((l, i) => {
      if (s.mounted) { l.hip.rotation.x = -1.25; l.knee.rotation.x = 1.35; l.hip.rotation.z = (i ? 1 : -1) * .12; return; }
      const a = Math.sin(ph + i * Math.PI) * .55 * walk;
      l.hip.rotation.set(a, 0, 0); l.knee.rotation.x = Math.max(0, -Math.sin(ph + i * Math.PI + .6)) * .8 * walk;
    });
    this.skirt.rotation.x = -.05 * walk - .1 * (s.flying ? 1 : 0);
    this.skirt.rotation.z = Math.sin(ph) * .04 * walk + Math.sin(now * 1.3) * .01;
    this.arms.forEach((a, i) => {
      const counter = Math.sin(ph + (i ? 0 : Math.PI)) * .45 * walk;
      a.shoulder.rotation.set(counter + (s.mounted ? -.6 : 0), 0, a.side * (.12 + breath * .01 + (s.flying ? .25 : 0)));
      a.elbow.rotation.x = -.25 - (s.mounted ? .7 : 0) - Math.max(0, counter) * .4;
    });
    if (s.swing > 0) { const k = Math.sin((1 - s.swing) * Math.PI); this.arms[1].shoulder.rotation.x = -2.3 * k; this.arms[1].shoulder.rotation.z = -.3 * k; this.arms[1].elbow.rotation.x = -.2; }
    this.head.rotation.set(Math.sin(now * .7) * .03 - walk * .05, Math.sin(now * .45) * .08, 0);
    this.strands.rotation.x = .1 + this.sway * .5 + Math.sin(now * 1.7) * .03;
    if (this.hatTip) this.hatTip.rotation.z = Math.sin(now * 2 + ph) * .3;
    if (this.orb) this.orb.rotation.y = now * 1.5;
    for (const g of this.gear) g.traverse(o => { if (o.userData.spin) { o.rotation.y = now * .9; o.material.opacity = .6 + Math.sin(now * 3) * .3; } });

    // Cape cloth: hangs, trails behind with speed, and ripples.
    const cape = this.capeMesh;
    if (cape && !s.glamour) {
      // Gathered narrow at the shoulders, flaring toward the hem and wrapping round the back; trails with speed.
      const pos = cape.geometry.attributes.position, base = cape.userData.base, trail = .1 + this.sway * .55;
      for (let i = 0; i < pos.count; i++) {
        const x0 = base[i * 3], y = base[i * 3 + 1], v = -y / 1.25, x = x0 * (.55 + .45 * v);
        const wrap = x * x * 1.6, ripple = Math.sin(now * 3.2 + v * 5 + x0 * 7) * .03 * v * (1 + this.sway);
        pos.setXYZ(i, x, y * (1 - trail * .3 * v), wrap - (v ** 1.4) * trail - .02 * v - ripple);
      }
      pos.needsUpdate = true; cape.geometry.computeVertexNormals();
    }
  }
}
