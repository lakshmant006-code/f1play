// Character creator: pick one of the five preset characters, then change the
// suit, colours, gloves, skin, face, visor, prop, name and number. The 3D
// preview turns on a turntable (drag to spin). Saving stores the recipe and a
// snapshot, which become the player's card and their character in the paddock.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
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
camera.position.set(1.4, 1.35, 3.6);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.92, 0);
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
key.shadow.camera.left = key.shadow.camera.bottom = -1.5;
key.shadow.camera.right = key.shadow.camera.top = 1.5;
scene.add(key);
const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.12, 12), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, flatShading: true }));
plinth.position.y = -0.07;
plinth.receiveShadow = true;
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.02, 4, 48), new THREE.MeshStandardMaterial({ color: '#1fb5b0' }));
ring.rotation.x = Math.PI / 2;
scene.add(plinth, ring);

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
  ring.material.color.set(recipe.primary);
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
  // Snapshot from a fixed front three-quarter camera for the card.
  const saved = { pos: camera.position.clone(), target: controls.target.clone(), auto: controls.autoRotate };
  controls.autoRotate = false;
  camera.position.set(0.9, 1.25, 2.9);
  controls.target.set(0, 0.95, 0);
  controls.update();
  renderer.render(scene, camera);
  const snapshot = cropSnapshot(renderer.domElement);
  camera.position.copy(saved.pos);
  controls.target.copy(saved.target);
  controls.autoRotate = saved.auto;
  const ok = saveRecipe(recipe, snapshot);
  $('saved').innerHTML = ok
    ? `Saved <b>#${recipe.number} ${escapeHtml(recipe.name)}</b>. <a href="/card/">See your card</a> or <a href="/">find yourself in the paddock</a>.`
    : 'Could not save in this browser (storage is blocked).';
});

// A 610x512 crop around the character, like the card art.
function cropSnapshot(src) {
  const out = document.createElement('canvas');
  out.width = 610;
  out.height = 512;
  const ctx = out.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#d8eefc');
  g.addColorStop(1, '#a9d8f5');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 610, 512);
  const w = src.width;
  const h = src.height;
  const cw = Math.min(w, h * (610 / 512));
  const ch = cw * (512 / 610);
  ctx.drawImage(src, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, 610, 512);
  return out.toDataURL('image/jpeg', 0.85);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

rebuild();
renderPanel();
resize();
