// The realistic look, scaled to the computer: quality levels; the shaders for the ground, foliage, grass and
// water (shadows, surface detail, wind, aerial perspective); the beacon over the Crown; the sky's light on the
// heroes; and the final image (anti-aliasing, grade and filmic tone).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Graphics levels. Radii are in chunks (250 m): terrain, trees and rocks, and small plants (herbs and bushes).
// `scale` is the render resolution (Auto starts at full and is lowered or raised by the game as frame times
// change); `shadows` the shadow map size (0: none) covering `shadowRange` metres round you; `post` the final
// image pass with `msaa`x anti-aliasing and grading; `grass` the density of grass about you; `ibl` lighting heroes by
// the sky itself; `detail` surface detail on the ground; `trees` the shape of trees and rocks.
export const QUALITY = {
  low: { terrain: 2, objects: 1, small: 1, fogNear: 100, fogFar: 400, scale: .6, shadows: 0, post: false, grass: 0, water: false, ibl: false, detail: false, trees: 'simple' },
  medium: { terrain: 3, objects: 2, small: 1, fogNear: 160, fogFar: 620, scale: .85, shadows: 1024, shadowRange: 45, shadowEvery: 2, post: false, grass: 0, water: true, ibl: false, detail: true, trees: 'full' },
  high: { terrain: 3, objects: 2, small: 1, fogNear: 180, fogFar: 650, scale: 1, shadows: 2048, shadowRange: 55, post: true, msaa: 2, grass: 1, water: true, ibl: true, detail: true, trees: 'full' },
  ultra: { terrain: 4, objects: 3, small: 2, fogNear: 240, fogFar: 900, scale: 1.5, shadows: 4096, shadowRange: 80, post: true, msaa: 4, grass: 2, water: true, ibl: true, detail: true, trees: 'full' },
};
QUALITY.auto = { ...QUALITY.high };
// The order Auto steps down through when even the lowest resolution is too slow.
export const STEP_DOWN = { auto: 'medium', high: 'medium', medium: 'low', ultra: 'high' };

// ---------- shared shader pieces ----------
// Uniforms every world shader shares, updated once a frame.
export const WORLD = {
  uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunGlow: { value: new THREE.Color('#ffd8a0') },
  uMist: { value: .25 }, uDetail: { value: 1 }, uWind: { value: 1 },
};
const NOISE = `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }`;
// Fog with aerial perspective, mixed in linear light before the tone: distance haze that warms towards the sun,
// and a mist that lies in the valleys.
const FOG = `
#if defined( USE_FOG ) && defined( SIMPLE )
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(fogNear, fogFar, vFogDepth));
#elif defined( USE_FOG )
  float fogF = smoothstep(fogNear, fogFar, vFogDepth);
  fogF = max(fogF, uMist * (1.0 - smoothstep(-5.0, 70.0, vWorld.y)) * smoothstep(30.0, 320.0, vFogDepth));
  vec3 viewDir = normalize(vWorld - cameraPosition);
  vec3 fogC = mix(fogColor, uSunGlow, pow(max(dot(viewDir, uSunDir), 0.0), 6.0) * .4);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogC, fogF);
#endif`;

// Lambert lighting worked out per vertex for terrain, trees, rocks and buildings: every face is one flat colour,
// so on face normals this looks the same as per-pixel lighting at a fraction of the cost. Each pixel adds the
// shadow, a soft world-space mottling (so the ground is never one flat colour), and the fog. Steep ground shows
// bare rock, and tree crowns sway in the wind.
export function flatLambert({ terrain = false } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.lights, THREE.UniformsLib.fog, { uDetailOn: { value: 1 } }]),
    lights: true, fog: true, vertexColors: true,
    defines: terrain ? { TERRAIN: 1 } : {},
    vertexShader: `#include <common>
#include <fog_pars_vertex>
#include <lights_pars_begin>
#include <shadowmap_pars_vertex>
uniform float uTime, uWind;
varying vec3 vAmbient, vDirect, vWorld;
void main() {
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #ifdef USE_INSTANCING
  // Wind: crowns sway more the higher they are, each tree in its own time.
  vec2 rootXZ = instanceMatrix[3].xz;
  float sway = max(0.0, position.y - 1.8) * uWind * .035;
  transformed.xz += sway * vec2(sin(uTime * 1.3 + rootXZ.x * .21) + .4 * sin(uTime * 3.1 + rootXZ.y), cos(uTime * 1.1 + rootXZ.y * .23));
  #endif
  #include <project_vertex>
  #include <worldpos_vertex>
  #include <shadowmap_vertex>
  #include <fog_vertex>
  vec4 wp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  wp = instanceMatrix * wp;
  #endif
  vWorld = (modelMatrix * wp).xyz;
  vec3 n = normalize(transformedNormal), ambient = ambientLightColor, direct = vec3(0.0);
  #if NUM_HEMI_LIGHTS > 0
  #pragma unroll_loop_start
  for (int i = 0; i < NUM_HEMI_LIGHTS; i++) ambient += getHemisphereLightIrradiance(hemisphereLights[i], n);
  #pragma unroll_loop_end
  #endif
  #if NUM_DIR_LIGHTS > 0
  #pragma unroll_loop_start
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) direct += saturate(dot(n, directionalLights[i].direction)) * directionalLights[i].color;
  #pragma unroll_loop_end
  #endif
  vec3 albedo = color;
  #ifdef TERRAIN
  // Steep slopes: weathered rock instead of grass or moss.
  float steep = smoothstep(.62, .82, 1.0 - normal.y);
  albedo = mix(albedo, vec3(.24, .23, .21) * (.85 + .3 * fract(sin(dot(position.xz, vec2(12.9898, 78.233))) * 43758.5)), steep);
  #endif
  vAmbient = albedo * ambient * RECIPROCAL_PI;
  vDirect = albedo * direct * RECIPROCAL_PI;
}`,
    fragmentShader: `#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
uniform vec3 uSunDir, uSunGlow;
uniform float uMist, uDetail, uDetailOn;
varying vec3 vAmbient, vDirect, vWorld;
${NOISE}
void main() {
  vec3 col = vAmbient + vDirect * getShadowMask();
  float d = uDetail * uDetailOn;
  if (d > 0.0) {
    #ifdef TERRAIN
    float n = vnoise(vWorld.xz * .08) * .5 + vnoise(vWorld.xz * .5) * .3 + vnoise(vWorld.xz * 2.3) * .2;
    col *= 1.0 + (n - .5) * .32 * d;
    #else
    col *= 1.0 + (vnoise(vWorld.xz * 1.7 + vWorld.y * 1.3) - .5) * .18 * d;
    #endif
  }
  gl_FragColor = vec4(col, 1.0);
  ${FOG}
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
}
// The world uniforms are shared, not copied, by every material that uses them.
export function shareWorld(material) { for (const k of Object.keys(WORLD)) material.uniforms[k] = WORLD[k]; return material; }

// ---------- water ----------
// The sea and ponds: the sky reflected more at grazing angles, a sun glint on small moving waves, and depth
// colour beneath. One plane, so it costs only the pixels it covers.
export function waterMaterial() {
  return shareWorld(new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunColor: { value: new THREE.Color() }, uDeep: { value: new THREE.Color('#0f3542') } }]),
    fog: true,
    vertexShader: `#include <common>
#include <fog_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader: `#include <common>
#include <fog_pars_fragment>
uniform vec3 uZenith, uHorizon, uSunColor, uDeep, uSunDir, uSunGlow;
uniform float uTime, uMist;
varying vec3 vWorld;
${NOISE}
void main() {
  vec2 p = vWorld.xz;
  float t = uTime;
  // Small waves: two drifting noise fields give the surface normal.
  float e = .6;
  float h0 = vnoise(p * .35 + t * vec2(.05, .03)) + .5 * vnoise(p * 1.1 - t * vec2(.04, .07));
  float hx = vnoise((p + vec2(e, 0)) * .35 + t * vec2(.05, .03)) + .5 * vnoise((p + vec2(e, 0)) * 1.1 - t * vec2(.04, .07));
  float hz = vnoise((p + vec2(0, e)) * .35 + t * vec2(.05, .03)) + .5 * vnoise((p + vec2(0, e)) * 1.1 - t * vec2(.04, .07));
  vec3 n = normalize(vec3((h0 - hx) * .35, 1.0, (h0 - hz) * .35));
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = .02 + .98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, .5, r.y));
  float glint = pow(max(dot(r, uSunDir), 0.0), 220.0) * 6.0 + pow(max(dot(r, uSunDir), 0.0), 18.0) * .25;
  vec3 col = mix(uDeep * (.35 + .4 * max(uSunDir.y, 0.0)), sky, fres) + uSunColor * glint;
  gl_FragColor = vec4(col, 1.0);
  ${FOG}
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  }));
}

// ---------- grass ----------
// Tufts of grass (or reeds in the swamp) about you, leaning in the wind and fading out at the edge of their
// circle. Placed on a fixed world grid with jitter, so they don't swim as you move.
export class Grass {
  constructor(scene, world, max = 9000) {
    this.world = world; this.max = max;
    const blades = [], colors = [];
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * Math.PI + .3, c = Math.cos(a) * .045, s = Math.sin(a) * .045, lean = .1;
      // A blade: two triangles, wide at the root, bent at the tip.
      blades.push(-c, 0, -s, c, 0, s, c * .4 + lean * s, .32, s * .4 - lean * c, -c, 0, -s, c * .4 + lean * s, .32, s * .4 - lean * c, -c * .4 + lean * s, .3, -s * .4 - lean * c);
      for (let v = 0; v < 6; v++) { const top = v === 2 || v === 4 || v === 5; colors.push(top ? 1.05 : .38, top ? 1.05 : .38, top ? 1.05 : .38); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(blades, 3));
    geo.setAttribute('shade', new THREE.Float32BufferAttribute(colors.filter((_, i) => i % 3 === 0), 1));
    geo.computeVertexNormals();
    this.material = shareWorld(new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.lights, THREE.UniformsLib.fog, { uCenter: { value: new THREE.Vector3() }, uRadius: { value: 40 } }]),
      lights: true, fog: true, side: THREE.DoubleSide,
      vertexShader: `#include <common>
#include <fog_pars_vertex>
#include <lights_pars_begin>
attribute float shade;
attribute vec3 tint;
uniform float uTime, uWind, uRadius;
uniform vec3 uCenter;
varying vec3 vCol, vWorld;
void main() {
  vec3 root = instanceMatrix[3].xyz;
  float fade = 1.0 - smoothstep(uRadius * .7, uRadius, distance(root.xz, uCenter.xz));
  vec3 transformed = position * fade;
  float bend = position.y * position.y * uWind * 2.2;
  transformed.x += bend * (sin(uTime * 1.9 + root.x * .37 + root.z * .11) * .5 + .3);
  transformed.z += bend * cos(uTime * 1.5 + root.z * .41) * .35;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  vec3 n = normalize(normalMatrix * vec3(0.0, 1.0, 0.0)), light = ambientLightColor;
  #if NUM_HEMI_LIGHTS > 0
  #pragma unroll_loop_start
  for (int i = 0; i < NUM_HEMI_LIGHTS; i++) light += getHemisphereLightIrradiance(hemisphereLights[i], n);
  #pragma unroll_loop_end
  #endif
  #if NUM_DIR_LIGHTS > 0
  #pragma unroll_loop_start
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) light += (.25 + .55 * saturate(dot(n, directionalLights[i].direction))) * directionalLights[i].color;
  #pragma unroll_loop_end
  #endif
  vCol = tint * shade * light * RECIPROCAL_PI;
  #include <fog_vertex>
}`,
      fragmentShader: `#include <common>
#include <fog_pars_fragment>
uniform vec3 uSunDir, uSunGlow;
uniform float uMist;
varying vec3 vCol, vWorld;
void main() {
  gl_FragColor = vec4(vCol, 1.0);
  ${FOG}
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    }));
    this.mesh = new THREE.InstancedMesh(geo, this.material, max);
    this.tint = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    geo.setAttribute('tint', this.tint);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.receiveShadow = false;
    scene.add(this.mesh);
    this.at = null;
  }
  // Re-lay the grass when you have moved far enough. `density` 0 hides it.
  update(x, z, density) {
    this.mesh.visible = density > 0;
    if (!density) return;
    const radius = density > 1 ? 52 : 40, spacing = density > 1 ? .78 : .95;
    this.material.uniforms.uCenter.value.set(x, 0, z); this.material.uniforms.uRadius.value = radius;
    if (this.at && Math.hypot(this.at.x - x, this.at.z - z) < 6 && this.at.density === density) return;
    this.at = { x, z, density };
    const w = this.world, m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(), p = new THREE.Vector3();
    const tint = this.tint.array, i0 = Math.floor((x - radius) / spacing), i1 = Math.ceil((x + radius) / spacing), j0 = Math.floor((z - radius) / spacing), j1 = Math.ceil((z + radius) / spacing);
    let n = 0;
    for (let j = j0; j <= j1 && n < this.max; j++) for (let i = i0; i <= i1 && n < this.max; i++) {
      const h1 = Math.sin(i * 127.1 + j * 311.7) * 43758.5453, r1 = h1 - Math.floor(h1), h2 = Math.sin(i * 269.5 + j * 183.3) * 43758.5453, r2 = h2 - Math.floor(h2);
      const gx = (i + r1) * spacing, gz = (j + r2) * spacing;
      if (Math.hypot(gx - x, gz - z) > radius) continue;
      const g = w.ground(gx, gz);
      if (g < .4) continue;
      const surf = w.surface(gx, gz, g);
      if (surf === 'peaks' || surf === 'snow' || surf === 'beach' || surf === 'ocean') continue;
      const reed = surf === 'swamp' || surf === 'mud', size = (reed ? 1.25 : 1) * (.55 + r1 * .6);
      if (reed && r2 > .55) continue; // reeds grow in clumps, not a carpet
      m.compose(p.set(gx, g - .02, gz), q.setFromAxisAngle(up, r2 * 6.28), s.set(size, size * (reed ? 1.5 : 1) * (.8 + r2 * .5), size));
      this.mesh.setMatrixAt(n, m);
      const c = w.color(gx, gz, g), v = .85 + r2 * .35;
      tint[n * 3] = c[0] * v * (reed ? 1.35 : .95); tint[n * 3 + 1] = c[1] * v * (reed ? 1.3 : 1.12); tint[n * 3 + 2] = c[2] * v * (reed ? 1 : .9);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true; this.tint.needsUpdate = true;
  }
}

// ---------- the beacon ----------
// A pillar of light rising from the Crown, seen from anywhere on the isle: crimson while the Unwitch lives, gold
// once she is unmade. Beyond the view distance it is drawn scaled in towards the camera, so it is never cut off
// by the far plane yet still hides behind nearer mountains.
export class Beacon {
  constructor(scene, x, y, z) {
    this.base = new THREE.Vector3(x, y, z);
    this.uniforms = { uTime: WORLD.uTime, uColor: { value: new THREE.Color('#ff3c6e') }, uCore: { value: new THREE.Color('#ffd0f0') } };
    const geo = new THREE.CylinderGeometry(5, 9, 900, 24, 24, true); geo.translate(0, 450, 0);
    this.beam = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec3 vN, vV; varying float vH;
void main() { vH = position.y / 900.0; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor, uCore; uniform float uTime; varying vec3 vN, vV; varying float vH;
void main() {
  float edge = abs(dot(normalize(vN), normalize(vV)));
  float core = pow(edge, 2.5), bands = .75 + .25 * sin(vH * 60.0 - uTime * 2.0) * sin(vH * 23.0 + uTime * .7);
  float fade = smoothstep(0.0, .03, vH) * (1.0 - smoothstep(.45, 1.0, vH));
  vec3 c = mix(uColor, uCore, core) * (core * 1.4 + .25) * bands * fade;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    }));
    this.beam.frustumCulled = false; this.beam.renderOrder = 5;
    const glow = document.createElement('canvas'); glow.width = glow.height = 128;
    const g = glow.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    this.flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glow), color: '#ff3c6e', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.flare.renderOrder = 5;
    scene.add(this.beam, this.flare);
  }
  update(camera, now, defeated) {
    this.uniforms.uColor.value.set(defeated ? '#ffc860' : '#ff3c6e'); this.uniforms.uCore.value.set(defeated ? '#fff4d0' : '#ffd0f0');
    this.flare.material.color.set(defeated ? '#ffd890' : '#ff5a8a');
    const d = camera.position.distanceTo(this.base), reach = camera.far * .8, k = d > reach ? reach / d : 1;
    // Scaled about the camera: the same on screen, but inside the far plane.
    this.beam.position.copy(camera.position).lerp(this.base, k);
    this.beam.scale.setScalar(k);
    const pulse = 1 + Math.sin(now * 1.7) * .08;
    this.flare.position.copy(camera.position).lerp(this.base.clone().add(new THREE.Vector3(0, 6, 0)), k);
    this.flare.scale.setScalar(70 * k * pulse);
  }
}

// ---------- the sky's light on the heroes ----------
// Image-based light from the current sky: a small scene with the sky's colours and the ground below, captured
// into a prefiltered environment map now and then. Heroes' skin, cloth and metal then take their soft light
// and reflections from the same sky as the world around them.
export class SkyLight {
  constructor(renderer) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.uniforms = { uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() }, uSun: { value: new THREE.Color() } };
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uZenith, uHorizon, uGround, uSunDir, uSun; varying vec3 vDir;
void main() { vec3 d = normalize(vDir); vec3 c = d.y > 0.0 ? mix(uHorizon, uZenith, smoothstep(0.0, .6, d.y)) : mix(uHorizon, uGround, smoothstep(0.0, .25, -d.y));
  c += uSun * pow(max(dot(d, uSunDir), 0.0), 64.0) * 6.0 + uSun * pow(max(dot(d, uSunDir), 0.0), 4.0) * .3;
  gl_FragColor = vec4(c, 1.0); }`,
    })));
    this.texture = null; this.timer = 0; this.last = null;
  }
  // Recapture when the light has changed enough or a while has passed. Returns the current map.
  update(dt, sky, ground, sunDir, sunColor) {
    this.timer -= dt;
    const key = sky.uZenith.value.getHex() + ':' + sky.uHorizon.value.getHex();
    if (this.texture && (this.timer > 0 || key === this.last)) return this.texture;
    this.timer = 6; this.last = key;
    const u = this.uniforms;
    u.uZenith.value.copy(sky.uZenith.value); u.uHorizon.value.copy(sky.uHorizon.value); u.uGround.value.copy(ground);
    u.uSunDir.value.copy(sunDir); u.uSun.value.copy(sunColor);
    const old = this.target;
    this.target = this.pmrem.fromScene(this.scene, 0, .1, 100, { size: 64 });
    this.texture = this.target.texture;
    old?.dispose();
    return this.texture;
  }
}

// ---------- the final image ----------
// Rendered into a 4x multisampled, high-precision target, then in one pass: graded in linear light (a touch of
// contrast and saturation, warm highlights over cool shadows, a faint vignette), tone-mapped with the ACES filmic
// curve at the current exposure, and encoded for the screen.
const FinalShader = {
  uniforms: { tDiffuse: { value: null }, uExposure: { value: 1 }, uSat: { value: 1.14 }, uContrast: { value: 1.1 }, uShadowTint: { value: new THREE.Color(.97, .99, 1.04) }, uHighTint: { value: new THREE.Color(1.03, 1.0, .96) }, uVignette: { value: .22 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uExposure, uSat, uContrast, uVignette; uniform vec3 uShadowTint, uHighTint; varying vec2 vUv;
vec3 fit(vec3 v) { vec3 a = v * (v + .0245786) - .000090537, b = v * (.983729 * v + .4329510) + .238081; return a / b; }
vec3 aces(vec3 c) {
  const mat3 inM = mat3(vec3(.59719, .07600, .02840), vec3(.35458, .90834, .13383), vec3(.04823, .01566, .83777));
  const mat3 outM = mat3(vec3(1.60475, -.10208, -.00327), vec3(-.53108, 1.10813, -.07276), vec3(-.07367, -.00605, 1.07602));
  return clamp(outM * fit(inM * (c * uExposure / .6)), 0.0, 1.0);
}
vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - .055, step(.0031308, c)); }
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = dot(c, vec3(.2126, .7152, .0722));
  c = max(mix(vec3(l), c, uSat), 0.0);
  c = .18 * pow(c / .18 + 1e-5, vec3(uContrast));
  c *= mix(uShadowTint, uHighTint, smoothstep(.02, .5, l));
  vec2 d = vUv - .5;
  c *= 1.0 - uVignette * dot(d, d) * 2.0;
  gl_FragColor = vec4(srgb(aces(c)), 1.0);
}`,
};
export class Post {
  constructor(renderer, scene, camera, samples = 4) {
    this.renderer = renderer;
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.final = new ShaderPass(FinalShader);
    this.final.material.toneMapped = false;
    this.composer.addPass(this.final);
  }
  setSize(w, h, ratio) { this.composer.setPixelRatio(ratio); this.composer.setSize(w, h); }
  render(night) {
    const u = this.final.uniforms;
    u.uSat.value = 1.14 - night * .2; u.uExposure.value = this.renderer.toneMappingExposure;
    this.composer.render();
  }
}
