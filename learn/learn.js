// Learn page: a 2026-style car in 3D (from the uploaded FBX, converted to a
// meshopt-compressed GLB in real meters: front toward +Z, ground at y = 0).
// Numbered hotspots sit on the parts the 2026 rules change; picking one flies
// the camera there and shows the notes. Plus paint options and a quick check.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = (id) => document.getElementById(id);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- Topics ------------------------------------------------------------------------------
// `at` is the hotspot on the car, `view` where the camera goes (relative to it).

const TOPICS = [
  {
    id: 'size',
    title: 'Smaller and lighter',
    at: V(0, 0.62, 0.7),
    view: V(3.2, 2.2, 3.6),
    body: [
      'The 2026 cars are shorter, narrower and lighter than the 2022–2025 cars, so they are nimbler in slow corners and easier to race side by side.',
      'The maximum wheelbase drops by 200 mm and the car is 100 mm narrower. The minimum weight drops by about 30 kg.',
    ],
    facts: [
      ['3.4 m', 'max wheelbase (was 3.6 m)'],
      ['1.9 m', 'max width (was 2.0 m)'],
      ['768 kg', 'min weight (was 798 kg)'],
    ],
  },
  {
    id: 'frontwing',
    title: 'Active front wing',
    at: V(0, 0.12, 2.55),
    view: V(1.6, 0.9, 2.2),
    body: [
      'For the first time both wings move. On the straights the flaps flatten to cut drag; into the corners they close back up for downforce.',
      'This replaces DRS, which only opened the rear wing. The front wing is also narrower than before.',
    ],
    facts: [
      ['2 modes', 'straight mode and corner mode'],
      ['Both wings', 'move together'],
    ],
  },
  {
    id: 'rearwing',
    title: 'Active rear wing',
    at: V(0, 0.95, -2.55),
    view: V(-1.8, 1.3, -2.4),
    body: [
      'The rear wing opens on the straights and closes for the corners, working with the front wing so the car stays balanced.',
      'Every driver can use it on any straight the rules allow, not only when chasing another car like DRS.',
    ],
    facts: [
      ['Low drag', 'on the straights'],
      ['High grip', 'in the corners'],
    ],
  },
  {
    id: 'power',
    title: 'Half electric power',
    at: V(0.55, 0.55, -0.6),
    view: V(2.6, 1.2, -0.8),
    body: [
      'The power unit splits its power roughly half and half between the turbo engine and the electric motor. The motor (MGU-K) is almost three times as strong as before.',
      'The complicated MGU-H, which recovered energy from the turbo, is gone. The engine runs on 100% sustainable fuel.',
    ],
    facts: [
      ['~50 / 50', 'engine / electric'],
      ['350 kW', 'electric motor (was 120 kW)'],
      ['100%', 'sustainable fuel'],
    ],
  },
  {
    id: 'override',
    title: 'Overtaking boost',
    at: V(0, 0.98, -0.1),
    view: V(-1.4, 1.9, 1.8),
    body: [
      'Instead of DRS, a chasing driver gets a manual override: extra electric energy to deploy when close to the car ahead.',
      'It is the driver’s call when to use it, which makes battery management part of racing.',
    ],
    facts: [
      ['Extra energy', 'when close behind'],
      ['Driver’s choice', 'when to use it'],
    ],
  },
  {
    id: 'floor',
    title: 'Simpler floor',
    at: V(0.82, 0.06, 0.1),
    view: V(3.4, 0.35, 0.8),
    body: [
      'The floor is flatter, with less of the tunnel ground effect of the last era. Downforce is down by about a third and drag by about half.',
      'Less reliance on the floor means the cars can run a softer, less extreme ride height and follow each other more easily.',
    ],
    facts: [
      ['~30%', 'less downforce'],
      ['~55%', 'less drag'],
    ],
  },
  {
    id: 'tyres',
    title: 'Narrower tyres',
    at: V(0.82, 0.36, 1.55),
    view: V(2.3, 0.6, 2.4),
    body: [
      'The wheels stay 18 inches, but the tyres get narrower to save weight and drag: 25 mm at the front and 30 mm at the rear.',
      'Wheel covers and brake ducts are simplified too.',
    ],
    facts: [
      ['18 in', 'wheels (unchanged)'],
      ['−25 mm', 'front tyre width'],
      ['−30 mm', 'rear tyre width'],
    ],
  },
  {
    id: 'safety',
    title: 'Halo and safety',
    at: V(0, 0.93, 0.35),
    view: V(1.3, 1.6, 2.1),
    body: [
      'The titanium halo stays over the cockpit. The 2026 rules add tougher crash tests, including a stronger roll hoop and a two-stage front crash structure, so the car stays protected in a second impact.',
    ],
    facts: [
      ['Halo', 'over the cockpit'],
      ['2-stage', 'nose crash structure'],
    ],
  },
];

const QUIZ = [
  { q: 'What replaces DRS in 2026?', opts: ['Active front and rear wings', 'A bigger rear wing', 'Softer tyres'], a: 0, why: 'Both wings move: open for straights, closed for corners.' },
  { q: 'Roughly how is the power split?', opts: ['90% engine, 10% electric', 'About half and half', 'All electric'], a: 1, why: 'The electric motor jumps to 350 kW, about half the total.' },
  { q: 'Which part of the power unit is removed?', opts: ['The turbo', 'The MGU-K', 'The MGU-H'], a: 2, why: 'The MGU-H goes; the MGU-K gets much stronger.' },
  { q: 'How much lighter is the minimum weight?', opts: ['About 30 kg', 'About 100 kg', 'Unchanged'], a: 0, why: '768 kg, down from 798 kg.' },
];

// ---- Scene ------------------------------------------------------------------------------------

const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.9;
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
const HOME = { pos: V(6.6, 3.1, 7.2), target: V(0, 0.4, 0) };
camera.position.copy(HOME.pos);
const controls = new OrbitControls(camera, canvas);
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.minDistance = 1.2;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.autoRotate = !reduced;
controls.autoRotateSpeed = 0.8;

scene.add(new THREE.HemisphereLight('#ffffff', '#9fc9e6', 0.8));
const key = new THREE.DirectionalLight('#fff4e0', 2.2);
key.position.set(4, 7, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
key.shadow.bias = -0.0005;
scene.add(key);
// Turntable floor: a soft shadow catcher on a white disc with a team-colored ring.
const floor = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.04, 64), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }));
floor.position.y = -0.02;
floor.receiveShadow = true;
const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.03, 6, 96), new THREE.MeshStandardMaterial({ color: '#1fb5b0' }));
ring.rotation.x = Math.PI / 2;
scene.add(floor, ring);

// ---- Car ----------------------------------------------------------------------------------------

let paintMats = [];
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.load(
  '/models/car-2026.glb',
  (gltf) => {
    const car = gltf.scene;
    car.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
    });
    // The bodywork is the twill carbon material; that's what the paint changes.
    const mats = new Set();
    car.traverse((o) => o.isMesh && mats.add(o.material));
    paintMats = [...mats].filter((m) => /Twill/i.test(m.name));
    for (const m of paintMats) m.userData.carbon = m.color.clone();
    scene.add(car);
    $('loading').classList.add('done');
    buildHotspots();
  },
  (e) => {
    if (e.total) $('progress').style.width = `${Math.round((e.loaded / e.total) * 100)}%`;
  },
  () => {
    $('loading').firstElementChild.textContent = 'Could not load the car model.';
  }
);

// ---- Paint --------------------------------------------------------------------------------------

const PAINTS = [
  ['carbon', 'Carbon'],
  ['#1FB5B0', 'Teal'],
  ['#F26B1D', 'Papaya'],
  ['#D8312B', 'Red'],
  ['#1E4FD8', 'Blue'],
  ['#35B04A', 'Green'],
  ['#F4F5F7', 'White'],
];
let paint = 'carbon';
function renderPaints() {
  $('paints').replaceChildren(
    ...PAINTS.map(([c, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(paint === c));
      b.setAttribute('aria-label', label);
      b.title = label;
      b.style.background = c === 'carbon' ? 'repeating-linear-gradient(45deg,#1c1c1c 0 4px,#2c2c2c 4px 8px)' : c;
      b.addEventListener('click', () => {
        paint = c;
        for (const m of paintMats) {
          if (c === 'carbon') {
            m.color.copy(m.userData.carbon);
            m.roughness = 0.35;
            m.metalness = 0.1;
          } else {
            m.color.set(c);
            m.roughness = 0.28;
            m.metalness = 0.2;
          }
        }
        ring.material.color.set(c === 'carbon' ? '#1fb5b0' : c);
        renderPaints();
      });
      return b;
    })
  );
}
renderPaints();

// ---- Hotspots and topics -----------------------------------------------------------------------

let current = null;
const markers = [];
function buildHotspots() {
  $('hotspots').replaceChildren(
    ...TOPICS.map((t, i) => {
      const b = document.createElement('button');
      b.className = 'hotspot';
      b.textContent = i + 1;
      b.setAttribute('aria-label', `${i + 1}. ${t.title}`);
      b.addEventListener('click', () => select(t));
      markers.push({ el: b, t });
      return b;
    })
  );
  renderTopics();
}

function renderTopics() {
  $('topics').replaceChildren(
    ...TOPICS.map((t, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.innerHTML = `<b>${i + 1}</b>${t.title}`;
      b.setAttribute('aria-pressed', String(current === t));
      b.addEventListener('click', () => select(t));
      li.append(b);
      return li;
    })
  );
  for (const m of markers) m.el.setAttribute('aria-pressed', String(current === m.t));
  const t = current;
  const box = $('topic');
  if (!t) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = `<h2>${t.title}</h2>${t.body.map((p) => `<p>${p}</p>`).join('')}<div class="facts">${t.facts.map(([v, l]) => `<div class="fact"><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;
}

// Camera glide to a topic, or back to the whole car.
let glide = null;
function flyTo(pos, target) {
  glide = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, t: 0, dur: reduced ? 0.01 : 1.1 };
}
function select(t) {
  current = t;
  controls.autoRotate = false;
  $('spin').setAttribute('aria-pressed', 'false');
  flyTo(t.at.clone().add(t.view), t.at.clone());
  renderTopics();
}
$('reset').addEventListener('click', () => {
  current = null;
  flyTo(HOME.pos.clone(), HOME.target.clone());
  renderTopics();
});
$('spin').addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  $('spin').setAttribute('aria-pressed', String(controls.autoRotate));
});
controls.addEventListener('start', () => {
  glide = null;
  controls.autoRotate = false;
  $('spin').setAttribute('aria-pressed', 'false');
});

// ---- Quiz ---------------------------------------------------------------------------------------

const answers = new Map();
function renderQuiz() {
  const right = [...answers.entries()].filter(([i, a]) => QUIZ[i].a === a).length;
  $('quiz').replaceChildren(
    ...QUIZ.map((q, i) => {
      const box = document.createElement('div');
      box.className = 'q';
      const p = document.createElement('p');
      p.textContent = `${i + 1}. ${q.q}`;
      const opts = document.createElement('div');
      opts.className = 'opts';
      const picked = answers.get(i);
      q.opts.forEach((o, k) => {
        const b = document.createElement('button');
        b.textContent = o;
        if (picked !== undefined) {
          if (k === q.a) b.className = 'right';
          else if (k === picked) b.className = 'wrong';
          b.disabled = true;
        }
        b.addEventListener('click', () => {
          answers.set(i, k);
          renderQuiz();
        });
        opts.append(b);
      });
      box.append(p, opts);
      if (picked !== undefined) {
        const why = document.createElement('p');
        why.className = 'why';
        why.textContent = (picked === q.a ? 'Right. ' : 'Not quite. ') + q.why;
        box.append(why);
      }
      return box;
    }),
    ...(answers.size === QUIZ.length ? [Object.assign(document.createElement('p'), { className: 'score', textContent: `You got ${right} of ${QUIZ.length}.` })] : [])
  );
}
renderQuiz();

// ---- Loop -------------------------------------------------------------------------------------

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas.parentElement);
resize();

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clock = new THREE.Timer();
const tmp = new THREE.Vector3();
const toCam = new THREE.Vector3();
renderer.setAnimationLoop((now) => {
  clock.update(now);
  const dt = Math.min(0.05, clock.getDelta());
  if (glide) {
    glide.t = Math.min(1, glide.t + dt / glide.dur);
    const k = ease(glide.t);
    camera.position.lerpVectors(glide.p0, glide.p1, k);
    controls.target.lerpVectors(glide.t0, glide.t1, k);
    if (glide.t >= 1) glide = null;
  }
  controls.update(dt);
  renderer.render(scene, camera);
  // Hotspot markers follow their points; ones on the far side fade.
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  for (const m of markers) {
    tmp.copy(m.t.at).project(camera);
    m.el.style.left = `${(tmp.x * 0.5 + 0.5) * w}px`;
    m.el.style.top = `${(-tmp.y * 0.5 + 0.5) * h}px`;
    m.el.hidden = tmp.z > 1;
    toCam.subVectors(camera.position, m.t.at);
    const facing = m.t.at.x === 0 ? 1 : Math.sign(m.t.at.x) * toCam.x;
    m.el.classList.toggle('behind', facing < 0);
  }
});
window.skyLearn = { camera, controls }; // handy for debugging in the console
