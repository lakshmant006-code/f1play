import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPost } from './fx/post.js';
import { CameraRig } from './camera.js';
import { UI } from './ui/ui.js';
import { Game } from './game/game.js';
import { initLanding } from './landing.js';
import { initMenu } from './ui/menu.js';
import { SCENERY } from './data.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setClearColor(SCENERY.fog);
const mobile = matchMedia('(pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
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
game.landing = initLanding(game);
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

const timer = new THREE.Timer();
timer.connect(document);
renderer.setAnimationLoop((now) => {
  timer.update(now);
  const dt = THREE.MathUtils.clamp(timer.getDelta(), 0, 1 / 20);
  game.update(dt);
  rig.update(dt);
  post.update(dt);
  post.render();
});

const loading = document.getElementById('loading');
loading.classList.add('done');
setTimeout(() => loading.remove(), 700);
