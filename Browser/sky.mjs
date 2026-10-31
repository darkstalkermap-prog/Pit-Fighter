// The magical sky: a shader dome blending day, twilight and night (stars that twinkle, aurora ribbons), a glowing
// sun with turning rays, a cratered moon with a halo and a slow ring of runes, shooting stars, and fireflies
// or drifting motes of light around the player. Everything follows the camera, so it never comes closer.
import * as THREE from 'three';

const PALETTE = {
  day: { zenith: '#3f7fd0', horizon: '#b4dcf0' },
  dusk: { zenith: '#3b2a6e', horizon: '#f2946a' },
  night: { zenith: '#05081a', horizon: '#1b2252' },
};
const C = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, { zenith: new THREE.Color(v.zenith), horizon: new THREE.Color(v.horizon) }]));

const VERT = `varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // on the far plane, behind everything
}`;
const FRAG = `uniform vec3 uZenith, uHorizon, uSunDir, uMoonDir, uSunColor;
uniform float uTime, uNight, uDusk;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.6, h));
  col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.3, h));
  // The sun's halo, wide and warm at dawn and dusk.
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 22.0) * 0.45 + pow(sd, 5.0) * (0.12 + 0.35 * uDusk));
  // The moon's cool glow.
  float md = max(dot(d, uMoonDir), 0.0);
  col += vec3(0.55, 0.6, 1.0) * (pow(md, 40.0) * 0.5 + pow(md, 7.0) * 0.12) * uNight;
  if (uNight > 0.01 && h > -0.05) {
    float up = smoothstep(-0.05, 0.25, h);
    // Stars: one in a few hundred cells of a fine grid, each with its own colour and twinkle.
    vec3 p = d * 160.0, cell = floor(p);
    float r = hash(cell);
    if (r > 0.982) {
      vec3 c = cell + 0.5 + (vec3(hash(cell + 1.3), hash(cell + 7.1), hash(cell + 3.7)) - 0.5) * 0.6;
      float tw = 0.55 + 0.45 * sin(uTime * (1.5 + r * 6.0) + r * 60.0);
      vec3 sc = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.82, 0.7), hash(cell + 9.0));
      col += sc * smoothstep(0.16, 0.0, length(p - c)) * tw * uNight * up * 1.6;
    }
    // Aurora: slow ribbons of teal and violet in the northern half of the sky.
    float n = noise(vec3(d.x * 2.5 + uTime * 0.015, d.y * 6.0, d.z * 2.5)) * 0.6 + noise(vec3(d.x * 7.0, d.y * 14.0 - uTime * 0.04, d.z * 7.0)) * 0.4;
    float band = smoothstep(0.12, 0.35, h) * (1.0 - smoothstep(0.45, 0.85, h)) * smoothstep(0.1, -0.6, d.z);
    float ribbon = smoothstep(0.45, 0.85, n);
    col += mix(vec3(0.15, 0.95, 0.7), vec3(0.65, 0.3, 1.0), smoothstep(0.2, 0.7, h)) * ribbon * band * 0.45 * uNight;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

// Canvas-painted textures for the sun, moon, rune ring and glows.
function canvasTexture(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glow = (color, inner = .0) => canvasTexture(128, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, s * inner, s / 2, s / 2, s / 2);
  r.addColorStop(0, color); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s);
});
const sunTexture = () => canvasTexture(256, (g, s) => {
  const c = s / 2;
  g.translate(c, c);
  for (let i = 0; i < 24; i++) { // rays
    g.rotate(Math.PI / 12);
    const len = i % 2 ? .3 : .46, ray = g.createLinearGradient(0, 0, 0, -s * len);
    ray.addColorStop(0, 'rgba(255,236,170,.9)'); ray.addColorStop(1, 'rgba(255,190,90,0)');
    g.fillStyle = ray; g.beginPath(); g.moveTo(-s * .018, 0); g.lineTo(0, -s * len); g.lineTo(s * .018, 0); g.fill();
  }
  const core = g.createRadialGradient(0, 0, 0, 0, 0, s * .16);
  core.addColorStop(0, '#fffef4'); core.addColorStop(.6, '#fff1b8'); core.addColorStop(1, 'rgba(255,200,100,0)');
  g.fillStyle = core; g.beginPath(); g.arc(0, 0, s * .16, 0, Math.PI * 2); g.fill();
});
const moonTexture = () => canvasTexture(256, (g, s) => {
  const c = s / 2, R = s * .42;
  const disc = g.createRadialGradient(c - R * .3, c - R * .3, R * .1, c, c, R);
  disc.addColorStop(0, '#fbfbff'); disc.addColorStop(.7, '#d9dcf0'); disc.addColorStop(1, '#a9aed0');
  g.fillStyle = disc; g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.fill();
  g.save(); g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.clip();
  let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 7; i++) { g.fillStyle = 'rgba(120,125,165,.28)'; g.beginPath(); g.ellipse(c + (rand() - .5) * R * 1.4, c + (rand() - .5) * R * 1.4, R * (.15 + rand() * .25), R * (.1 + rand() * .2), rand() * 3, 0, Math.PI * 2); g.fill(); }
  for (let i = 0; i < 26; i++) {
    const x = c + (rand() - .5) * R * 1.7, y = c + (rand() - .5) * R * 1.7, r = R * (.03 + rand() * .09);
    g.fillStyle = 'rgba(110,112,150,.45)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.2; g.beginPath(); g.arc(x - r * .15, y - r * .15, r, Math.PI * .9, Math.PI * 1.7); g.stroke();
  }
  // A soft terminator: a waxing gibbous moon.
  const shade = g.createLinearGradient(c - R, 0, c + R, 0);
  shade.addColorStop(0, 'rgba(20,24,60,.55)'); shade.addColorStop(.32, 'rgba(20,24,60,0)'); shade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = shade; g.fillRect(0, 0, s, s);
  g.restore();
});
const runeTexture = () => canvasTexture(512, (g, s) => {
  const c = s / 2;
  g.strokeStyle = 'rgba(200,170,255,.85)'; g.fillStyle = 'rgba(200,170,255,.85)'; g.lineWidth = 2; g.shadowColor = '#b48cff'; g.shadowBlur = 12;
  for (const r of [.44, .4]) { g.beginPath(); g.arc(c, c, s * r, 0, Math.PI * 2); g.stroke(); }
  g.font = `${s * .045}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  for (let i = 0; i < runes.length; i++) {
    const a = i / runes.length * Math.PI * 2;
    g.save(); g.translate(c + Math.cos(a) * s * .42, c + Math.sin(a) * s * .42); g.rotate(a + Math.PI / 2); g.fillText(runes[i], 0, 0); g.restore();
  }
  for (let i = 0; i < 5; i++) { // a faint pentacle inside
    const a = i * Math.PI * 4 / 5 - Math.PI / 2, b = (i + 1) * Math.PI * 4 / 5 - Math.PI / 2;
    g.globalAlpha = .35; g.beginPath(); g.moveTo(c + Math.cos(a) * s * .38, c + Math.sin(a) * s * .38); g.lineTo(c + Math.cos(b) * s * .38, c + Math.sin(b) * s * .38); g.stroke();
  }
});

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunColor: { value: new THREE.Color('#ffcf88') },
      uSunDir: { value: new THREE.Vector3() }, uMoonDir: { value: new THREE.Vector3() }, uTime: { value: 0 }, uNight: { value: 0 }, uDusk: { value: 0 },
    };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false }));
    // Drawn after everything solid: the depth test then skips every pixel already covered, so the sky shader
    // only runs where sky actually shows.
    this.dome.renderOrder = 1000; this.dome.frustumCulled = false;
    const sprite = (map, size, color = '#fff', opacity = 1) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      s.scale.set(size, size, 1); s.renderOrder = -9; scene.add(s); return s;
    };
    this.sunHalo = sprite(glow('rgba(255,200,120,.7)'), 260);
    this.sun = sprite(sunTexture(), 110);
    this.moonHalo = sprite(glow('rgba(170,160,255,.55)', .1), 210);
    this.runes = sprite(runeTexture(), 150, '#d8c4ff', .5);
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture(), transparent: true, depthWrite: false, fog: false }));
    this.moon.scale.set(80, 80, 1); this.moon.renderOrder = -8; scene.add(this.moon);
    scene.add(this.dome);

    // Shooting stars: a short bright streak now and then at night.
    this.streak = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: canvasTexture(128, (g, s) => { const l = g.createLinearGradient(0, 0, s, 0); l.addColorStop(0, 'rgba(255,255,255,0)'); l.addColorStop(1, 'rgba(230,230,255,1)'); g.fillStyle = l; g.fillRect(0, s * .45, s, s * .1); }), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    this.streak.visible = false; this.streak.renderOrder = -8; scene.add(this.streak);
    this.nextStreak = 6;

    // Fireflies by night, drifting golden motes by day.
    const n = 70, pos = new Float32Array(n * 3);
    this.motes = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
      new THREE.PointsMaterial({ map: glow('rgba(255,255,255,1)', .05), size: .55, color: '#d8ff7a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.motes.frustumCulled = false; scene.add(this.motes);
    this.moteSeeds = Array.from({ length: n }, (_, i) => ({ a: i * 2.39996, r: 3 + (i * 7.3 % 22), h: .5 + (i * 3.7 % 5), s: .3 + (i * .13 % .7) }));
    this.horizon = new THREE.Color();
  }

  // Returns the horizon colour, for the fog to match.
  update(camera, dayTime, now, dt, player) {
    const a = (dayTime - .25) * Math.PI * 2, sunH = Math.sin(a);
    // Lowish arcs so the sun and moon pass through the view: the moon rides across the northern sky at night.
    const sunDir = new THREE.Vector3(Math.cos(a), sunH * .8, .45).normalize(), moonDir = new THREE.Vector3(-Math.cos(a), -sunH * .55 + .08, -.75).normalize();
    const day = THREE.MathUtils.smoothstep(sunH, -.15, .2), dusk = Math.max(0, 1 - Math.abs(sunH) / .35), night = 1 - THREE.MathUtils.smoothstep(sunH, -.25, .05);
    const u = this.uniforms;
    u.uZenith.value.copy(C.night.zenith).lerp(C.day.zenith, day).lerp(C.dusk.zenith, dusk * .55);
    u.uHorizon.value.copy(C.night.horizon).lerp(C.day.horizon, day).lerp(C.dusk.horizon, dusk * .75);
    u.uSunColor.value.set(dusk > .3 ? '#ff9a5a' : '#ffd890');
    u.uSunDir.value.copy(sunDir); u.uMoonDir.value.copy(moonDir);
    u.uTime.value = now; u.uNight.value = night; u.uDusk.value = dusk;
    this.horizon.copy(u.uHorizon.value);

    // Sun and moon sit just inside the camera's far plane (which shrinks on Low graphics), sized to match.
    const k = camera.far * .68 / 450, at = (o, dir, dist, size) => { o.position.copy(camera.position).addScaledVector(dir, dist * k); o.scale.set(size * k, size * k, 1); };
    at(this.sun, sunDir, 450, 110); at(this.sunHalo, sunDir, 455, 260);
    this.sun.material.rotation = now * .05;
    this.sun.visible = this.sunHalo.visible = sunH > -.2;
    this.sunHalo.material.opacity = .5 + dusk * .5;
    at(this.moon, moonDir, 440, 80); at(this.moonHalo, moonDir, 445, 280); at(this.runes, moonDir, 442, 200);
    this.moon.visible = this.moonHalo.visible = this.runes.visible = moonDir.y > -.15;
    this.moon.material.opacity = .25 + night * .75;
    this.moonHalo.material.opacity = night * .9;
    this.runes.material.opacity = night * (.35 + Math.sin(now * .8) * .15);
    this.runes.material.rotation = -now * .03;
    this.dome.position.copy(camera.position);

    // Shooting stars.
    this.nextStreak -= dt;
    if (night > .6 && this.nextStreak <= 0) {
      this.nextStreak = 5 + Math.random() * 10; this.streakT = 0;
      const az = Math.random() * Math.PI * 2, el = .35 + Math.random() * .35;
      this.streakFrom = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
      this.streakDir = new THREE.Vector3(Math.cos(az + 1.4), -.35, Math.sin(az + 1.4)).normalize();
    }
    if (this.streakT !== undefined && this.streakT < .9) {
      this.streakT += dt;
      const head = this.streakFrom.clone().multiplyScalar(420 * k).addScaledVector(this.streakDir, this.streakT * 160 * k);
      this.streak.visible = true;
      this.streak.position.copy(camera.position).add(head).addScaledVector(this.streakDir, -20);
      this.streak.scale.set(40 * k, 1.2 * k, 1);
      this.streak.lookAt(camera.position);
      const sd = this.streakDir.clone().project(camera).sub(new THREE.Vector3().project(camera));
      this.streak.rotateZ(Math.atan2(sd.y, sd.x));
      this.streak.material.opacity = Math.sin(this.streakT / .9 * Math.PI);
    } else this.streak.visible = false;

    // Motes: fireflies at night (bright, green-gold), faint golden magic by day.
    const pos = this.motes.geometry.attributes.position;
    this.moteSeeds.forEach((m, i) => {
      const a2 = m.a + now * m.s * .4;
      pos.setXYZ(i, player.x + Math.cos(a2) * m.r + Math.sin(now * m.s + i) * 1.5, player.y + m.h + Math.sin(now * m.s * 2 + i) * .6, player.z + Math.sin(a2) * m.r);
    });
    pos.needsUpdate = true;
    this.motes.material.opacity = .25 + night * .75;
    this.motes.material.color.set(night > .4 ? '#d8ff7a' : '#ffe6a0');
    this.motes.material.size = night > .4 ? .55 : .3;
    return { day, dusk, night, sunDir, horizon: this.horizon };
  }
}
