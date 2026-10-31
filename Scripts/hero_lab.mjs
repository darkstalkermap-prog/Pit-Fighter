// Hero lab: renders one witch path three ways (as she starts, in legendary gear, as a quest giver) side by side,
// for checking the models. Built and screenshotted by Scripts/hero_shots.mjs.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Hero, HeroKit } from '../Browser/hero.mjs';

const q = new URLSearchParams(location.search), cls = q.get('cls') ?? 'bloom', view = q.get('view') ?? 'front', time = Number(q.get('t') ?? 1.3);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
document.body.style.margin = 0; document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(q.get('bg') ?? '#2a2236');
const pmrem = new THREE.PMREMGenerator(renderer), kit = new HeroKit(pmrem.fromScene(new RoomEnvironment(), .04).texture);
const key = new THREE.DirectionalLight('#fff1dc', 1.9); key.position.set(2.5, 4, 3.5);
const fill = new THREE.DirectionalLight('#9ab8ff', .9); fill.position.set(-3, 2, 2);
const rim = new THREE.DirectionalLight('#c89aff', 2.2); rim.position.set(-1, 3, -4);
scene.add(new THREE.HemisphereLight('#d8d0ff', '#2a1e30', .8), key, fill, rim);
const LEGENDARY = { head: ['hat', 4], chest: ['robe', 4], hands: ['bracers', 4], feet: ['boots', 4], cloak: ['cloak', 4], amulet: ['amulet', 4], weapon: ['staff', 4] };
const heroes = [new Hero(kit, cls, { weapon: ['staff', 1] }), new Hero(kit, cls, LEGENDARY), new Hero(kit, cls, { head: ['hat', 3], amulet: ['amulet', 3], weapon: ['staff', 3] }, { revealing: true })];
heroes.forEach((h, i) => { h.root.position.x = (i - 1) * 1.6; h.root.rotation.y = view === 'back' ? Math.PI : view === 'side' ? Math.PI / 2 : 0; scene.add(h.root); h.update(.016, time, {}); });
const cam = new THREE.PerspectiveCamera(view === 'close' ? 22 : 34, innerWidth / innerHeight, .1, 100);
if (view === 'close') { const x = (Number(q.get('i') ?? 0) - 1) * 1.6; cam.position.set(x, 1.65, 1.6); cam.lookAt(x, 1.62, 0); }
else { cam.position.set(0, 1.5, 6.4); cam.lookAt(0, 1.3, 0); }
renderer.render(scene, cam);
window.__ready = true;
