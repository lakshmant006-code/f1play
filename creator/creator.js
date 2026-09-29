// Character creator: pick one of the five preset characters, then change the
// suit, colours, gloves, skin, face, visor, prop, name and number. The 3D
// preview turns on a turntable (drag to spin). Saving stores the recipe and a
// snapshot, which become the player's card and their character in the paddock.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  buildCharacter, animateCharacter, setPose, saveRecipe, loadRecipe,
  PRESETS, SUITS, GLOVES, BROWS, MOUTHS, PROPS, VISORS, SKINS, SWATCHES, EMOTES, DEFAULT_RECIPE,
} from '../src/character/blocky.js';
import { DRIVERS } from '../src/data.js';

const $ = (id) => document.getElementById(id);
const TAKEN = new Set(DRIVERS.map((d) => d.number)); // roster numbers are reserved

// ---- Three.js preview ----------------------------------------------------------------

const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
camera.position.set(1.5, 1.3, 4.4);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.72, 0);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 2;
controls.maxDistance = 6;
controls.minPolarAngle = 0.6;
controls.maxPolarAngle = 1.75;
controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
controls.autoRotateSpeed = 1.2;
controls.addEventListener('start', () => (controls.autoRotate = false));

scene.add(new THREE.HemisphereLight('#ffffff', '#9fc9e6', 1.4));
const key = new THREE.DirectionalLight('#fff4e0', 2.4);
key.position.set(2, 4, 3);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = key.shadow.camera.bottom = -1.8;
key.shadow.camera.right = key.shadow.camera.top = 1.8;
scene.add(key);
// Green winner's podium the character stands on (also in the card snapshot).
const podium = new THREE.Group();
const green = new THREE.MeshStandardMaterial({ color: '#16863A', roughness: 0.45 });
const greenTop = new THREE.MeshStandardMaterial({ color: '#22A34A', roughness: 0.4 });
const block = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.4, 0.8, 4, 0.05), green);
block.position.y = -0.2;
const top = new THREE.Mesh(new RoundedBoxGeometry(1.04, 0.05, 0.84, 4, 0.02), greenTop);
top.position.y = -0.02;
block.receiveShadow = top.receiveShadow = true;
block.castShadow = true;
podium.add(block, top);
// A big "1" on the front, drawn on a canvas.
const numCanvas = document.createElement('canvas');
numCanvas.width = numCanvas.height = 256;
const nctx = numCanvas.getContext('2d');
nctx.fillStyle = '#ffffff';
nctx.font = '900 210px Nunito, system-ui, sans-serif';
nctx.textAlign = 'center';
nctx.textBaseline = 'middle';
nctx.fillText('1', 128, 140);
const numTex = new THREE.CanvasTexture(numCanvas);
numTex.colorSpace = THREE.SRGBColorSpace;
const numPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), new THREE.MeshStandardMaterial({ map: numTex, transparent: true, roughness: 0.5 }));
numPlate.position.set(0, -0.21, 0.402);
podium.add(numPlate);
scene.add(podium);

let recipe = { ...DEFAULT_RECIPE, ...(loadRecipe()?.recipe || {}) };
let model = null;

function rebuild() {
  if (model) {
    scene.remove(model);
    model.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
  }
  model = buildCharacter(recipe);
  scene.add(model);
}

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas.parentElement);

const clock = new THREE.Timer();
renderer.setAnimationLoop((now) => {
  clock.update(now);
  const dt = Math.min(0.05, Math.max(0, clock.getDelta()));
  if (model) animateCharacter(model, dt);
  controls.update(dt);
  renderer.render(scene, camera);
});

// ---- Controls ----------------------------------------------------------------------------

function radioGroup(el, options, current, onPick, { swatch = false } = {}) {
  el.replaceChildren(
    ...Object.entries(options).map(([value, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(String(value) === String(current)));
      if (swatch) {
        b.className = 'swatch';
        b.style.background = value;
        b.setAttribute('aria-label', label);
        b.title = label;
      } else {
        b.textContent = label;
      }
      b.addEventListener('click', () => onPick(value));
      return b;
    })
  );
}

const asMap = (arr) => Object.fromEntries(arr.map((c) => [c, c]));

function renderPanel() {
  const set = (k) => (v) => update({ [k]: v });
  $('presets').replaceChildren(
    ...Object.entries(PRESETS).map(([id, p]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(recipe.preset === id));
      b.innerHTML = `<b>${p.label}</b><small>${p.role}</small>`;
      b.addEventListener('click', () => update({ ...p.recipe, preset: id, pose: p.pose, name: recipe.nameEdited ? recipe.name : p.recipe.name }));
      return b;
    })
  );
  radioGroup($('suit'), SUITS, recipe.suit, set('suit'));
  radioGroup($('primary'), asMap(SWATCHES.filter((c) => c !== '#FFFFFF')), recipe.primary, (v) => update({ primary: v, accent: v }), { swatch: true });
  radioGroup($('secondary'), asMap(['#FFFFFF', '#EFE6D2', '#C9CED6', '#25272B', '#16171a']), recipe.secondary, set('secondary'), { swatch: true });
  radioGroup($('gloves'), GLOVES, recipe.gloves, set('gloves'));
  radioGroup($('skin'), asMap(SKINS), recipe.skin, set('skin'), { swatch: true });
  radioGroup($('brows'), BROWS, recipe.brows, set('brows'));
  radioGroup($('mouth'), MOUTHS, recipe.mouth, set('mouth'));
  radioGroup($('visorDown'), { false: 'Up', true: 'Down' }, recipe.visorDown, (v) => update({ visorDown: v === 'true' }));
  radioGroup($('visor'), VISORS, recipe.visor, set('visor'), { swatch: true });
  radioGroup($('prop'), PROPS, recipe.prop, (v) => update({ prop: v, pose: v === 'tablet' ? 'tablet' : v === 'wheelgun' ? 'action' : recipe.pose === 'tablet' || recipe.pose === 'action' ? 'akimbo' : recipe.pose }));
  $('emotes').replaceChildren(
    ...Object.entries(EMOTES).map(([id, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.setAttribute('aria-pressed', String(recipe.pose === id));
      b.addEventListener('click', () => {
        recipe.pose = id;
        setPose(model, id);
        renderPanel();
      });
      return b;
    })
  );
  $('name').value = recipe.name;
  $('number').value = recipe.number;
}

function update(patch) {
  recipe = { ...recipe, ...patch };
  $('saved').textContent = '';
  rebuild();
  renderPanel();
}

// Name: 3-16 letters, digits, spaces, dots or dashes. Number: 2-99, not a roster number.
function validate() {
  const name = $('name').value.trim();
  const num = Number($('number').value);
  if (!/^[\p{L}\p{N} .'-]{3,16}$/u.test(name)) return 'Name must be 3 to 16 letters or numbers.';
  if (!Number.isInteger(num) || num < 2 || num > 99) return 'Number must be between 2 and 99.';
  if (TAKEN.has(num)) return `#${num} belongs to a team driver. Pick another number.`;
  return '';
}

$('name').addEventListener('input', () => {
  recipe.name = $('name').value.trim();
  recipe.nameEdited = true;
  $('hint').textContent = validate();
});
$('number').addEventListener('input', () => {
  const n = Number($('number').value);
  $('hint').textContent = validate();
  if (!validate()) update({ number: n });
});

$('random').addEventListener('click', () => {
  const pick = (o) => {
    const k = Object.keys(o);
    return k[Math.floor(Math.random() * k.length)];
  };
  const presetId = pick(PRESETS);
  const p = PRESETS[presetId];
  let n;
  do n = 2 + Math.floor(Math.random() * 98);
  while (TAKEN.has(n));
  const primary = SWATCHES[Math.floor(Math.random() * 12)];
  update({
    ...p.recipe, preset: presetId, pose: p.pose, primary, accent: primary,
    suit: pick(SUITS), gloves: pick(GLOVES), brows: pick(BROWS), mouth: pick(MOUTHS),
    skin: SKINS[Math.floor(Math.random() * SKINS.length)], visor: pick(VISORS), number: n,
    name: recipe.nameEdited ? recipe.name : p.recipe.name,
  });
});

$('save').addEventListener('click', () => {
  const err = validate();
  $('hint').textContent = err;
  if (err) return;
  recipe.name = $('name').value.trim();
  recipe.number = Number($('number').value);
  const snapshot = cardSnapshot();
  const ok = saveRecipe(recipe, snapshot);
  $('saved').innerHTML = ok
    ? `Saved <b>#${recipe.number} ${escapeHtml(recipe.name)}</b>. Play as <a href="/?play=driver">driver</a>, <a href="/?play=mechanic">mechanic</a> or <a href="/?play=engineer">race engineer</a>, or <a href="/card/">see your card</a>.`
    : 'Could not save in this browser (storage is blocked).';
});

// Card art: the whole character on the podium, rendered at the card's
// 610x512 size from a fixed front three-quarter camera, over a sky gradient.
function cardSnapshot() {
  const W = 610;
  const H = 512;
  const size = renderer.getSize(new THREE.Vector2());
  const ratio = renderer.getPixelRatio();
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
  cam.position.set(1.25, 1.0, 4.85); // margin for the card's parallax crop
  cam.lookAt(0, 0.74, 0);
  renderer.setPixelRatio(2);
  renderer.setSize(W, H, false);
  renderer.render(scene, cam);
  const out = document.createElement('canvas');
  out.width = W * 2;
  out.height = H * 2;
  const ctx = out.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, out.height);
  g.addColorStop(0, '#8fd0f7');
  g.addColorStop(0.7, '#d8eefc');
  g.addColorStop(1, '#eef8ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, out.width, out.height);
  // Soft sun glow behind the head.
  const glow = ctx.createRadialGradient(out.width * 0.52, out.height * 0.3, 10, out.width * 0.52, out.height * 0.3, out.width * 0.45);
  glow.addColorStop(0, 'rgba(255,255,255,0.85)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(renderer.domElement, 0, 0, out.width, out.height);
  renderer.setPixelRatio(ratio);
  renderer.setSize(size.x, size.y, false);
  return out.toDataURL('image/jpeg', 0.88);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

rebuild();
renderPanel();
resize();
window.skyCreator = { camera, controls }; // handy for debugging in the console
