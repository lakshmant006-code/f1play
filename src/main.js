import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPost } from './fx/post.js';
import { CameraRig } from './camera.js';
import { UI } from './ui/ui.js';
import { Game } from './game/game.js';
import { initLanding } from './landing.js';
import { initMenu } from './ui/menu.js';
import { initTopbar } from './ui/topbar.js';
import { SCENERY } from './data.js';
import { initAnalytics } from './analytics.js';

initAnalytics();

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setClearColor(SCENERY.fog);
const mobile = matchMedia('(pointer: coarse)').matches;
// Resolution: start sharp, then adapt (see the frame loop) up to the screen's
// full density on devices that keep up, down a notch on ones that don't.
const MAX_PR = Math.min(window.devicePixelRatio || 1, mobile ? 2.5 : 2);
let pixelRatio = Math.min(MAX_PR, mobile ? 1.5 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SCENERY.fog, 300, 780);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.5, 1400);
const post = createPost(renderer, scene, camera);
const rig = new CameraRig(camera, canvas, post);
const ui = new UI(document.getElementById('ui'));

// Wait for the rounded display font so liveries and helmets paint with it.
await Promise.race([document.fonts?.load('900 40px Nunito').catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);

const game = new Game({ renderer, scene, camera, post, rig, ui });
window.skyCircuit = game; // handy for debugging in the console
// Sharpest texture filtering the GPU offers, for roads and grass seen at a glance.
game.hdTextures = (root) => {
  const aniso = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  root.traverse((o) => {
    for (const m of [].concat(o.material || [])) {
      for (const k of ['map', 'emissiveMap', 'bumpMap', 'normalMap', 'roughnessMap']) {
        const t = m[k];
        if (t && t.anisotropy < aniso) {
          t.anisotropy = aniso;
          t.needsUpdate = true;
        }
      }
    }
  });
};
game.hdTextures(scene);
game.landing = initLanding(game);
// Links like /?play=mechanic (from the creator) jump straight into a job.
const playRole = new URLSearchParams(location.search).get('play');
if (playRole && game.roles && ['driver', 'mechanic', 'engineer'].includes(playRole)) {
  game.landing.hide?.();
  setTimeout(() => game.roles.play(playRole), 900);
}
// /?track=dawn drives Track 2 straight away.
const trackParam = new URLSearchParams(location.search).get('track');
if (trackParam === 'dawn' && !playRole) {
  game.landing.hide?.();
  game.trackChoice = 'dawn';
  setTimeout(() => game.driveCar(game.teams.find((t) => t.launch), 'dawn'), 700);
}
initTopbar(game);
initMenu();

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  post.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

// Every two seconds: below ~40 fps drop the resolution a step, above ~57 fps raise it.
let frames = 0;
let spent = 0;
function adaptResolution(raw) {
  if (raw <= 0 || raw > 0.5 || document.hidden) return;
  frames++;
  spent += raw;
  if (spent < 2) return;
  const avg = spent / frames;
  frames = 0;
  spent = 0;
  const next = avg > 1 / 40 ? Math.max(0.75, pixelRatio - 0.25) : avg < 1 / 57 ? Math.min(MAX_PR, pixelRatio + 0.25) : pixelRatio;
  if (next !== pixelRatio) {
    pixelRatio = next;
    renderer.setPixelRatio(pixelRatio);
    resize();
  }
}

const timer = new THREE.Timer();
timer.connect(document);
renderer.setAnimationLoop((now) => {
  timer.update(now);
  const raw = timer.getDelta();
  const dt = THREE.MathUtils.clamp(raw, 0, 1 / 20);
  adaptResolution(raw);
  game.update(dt);
  rig.update(dt);
  post.update(dt);
  post.render();
});

const loading = document.getElementById('loading');
loading.classList.add('done');
setTimeout(() => loading.remove(), 700);
