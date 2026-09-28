// Sky Circuit driver cards: fills the Figma card with each team's lead driver
// and adds a parallax tilt driven by the pointer (or device tilt on phones).
// Layers sit at different depths (glow, face, art, name, details, shine), the
// art slides inside its panel and the page background drifts the other way.

import { TEAMS, DRIVERS } from '../../src/data.js';
import car4 from '../images/car-4.png';
import car8 from '../images/car-8.png';
import car11 from '../images/car-11.png';
import car6 from '../images/car-6.png';
import car3 from '../images/car-3.png';

const ART = { 4: car4, 8: car8, 11: car11, 6: car6, 3: car3 };

// One card per team: the driver of the car in that team's garage.
const CARDS = TEAMS.map((team, i) => {
  const d = DRIVERS.find((x) => x.number === team.numbers[0]);
  return { team, driver: d, no: i + 1 };
});

// Stats are fixed per driver (never random), from their personality line.
const STATS = {
  4: { Pace: 88, Nerve: 81, Teamwork: 84 },
  8: { Pace: 82, Nerve: 86, Teamwork: 90 },
  11: { Pace: 90, Nerve: 94, Teamwork: 72 },
  6: { Pace: 80, Nerve: 78, Teamwork: 91 },
  3: { Pace: 95, Nerve: 88, Teamwork: 70 },
};

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const card = $('card');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let index = 0;

// Glow uses the team's accent unless it is too dark to glow.
function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function glowFor(team) {
  for (const c of [team.accent, team.primary, team.secondary]) {
    const [r, g, b] = rgbOf(c);
    if (0.2126 * r + 0.7152 * g + 0.0722 * b > 90) return `${r}, ${g}, ${b}`;
  }
  return '0, 212, 255';
}

function show(i) {
  index = (i + CARDS.length) % CARDS.length;
  const { team, driver, no } = CARDS[index];
  stage.style.setProperty('--team', team.primary);
  stage.style.setProperty('--team-2', team.secondary);
  stage.style.setProperty('--glow', glowFor(team));
  $('art').style.backgroundImage = `url(${ART[driver.number]})`;
  $('badge').textContent = `#${driver.number}`;
  $('cardNo').textContent = `No. ${String(no).padStart(4, '0')}`;
  $('name').textContent = driver.name;
  $('from').textContent = driver.from;
  $('team').textContent = team.name;
  const stats = STATS[driver.number];
  $('stats').replaceChildren(
    ...Object.entries(stats).map(([k, v]) => {
      const row = document.createElement('div');
      row.className = 'stat';
      row.innerHTML = `<span>${k}</span><span class="bar"><i style="width:${v}%"></i></span><b>${v}</b>`;
      return row;
    })
  );
  $('count').textContent = `${index + 1} / ${CARDS.length}`;
  card.setAttribute('aria-label', `${driver.name}, car ${driver.number}, ${team.name}. ${Object.entries(stats).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
}

// ---- Parallax ------------------------------------------------------------------

// Each layer's depth comes from its data-depth attribute.
for (const el of document.querySelectorAll('.layer')) el.style.setProperty('--depth', el.dataset.depth);

function setTilt(x, y) {
  // x, y in -1..1, eased toward the edges.
  stage.style.setProperty('--px', x.toFixed(3));
  stage.style.setProperty('--py', y.toFixed(3));
}

function onPointer(e) {
  if (reduced) return;
  const r = card.getBoundingClientRect();
  const x = ((e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)) * 1.4;
  const y = ((e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)) * 1.4;
  card.classList.add('tracking');
  setTilt(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
}
stage.addEventListener('pointermove', onPointer);
stage.addEventListener('pointerleave', () => {
  card.classList.remove('tracking');
  setTilt(0, 0);
});

// Phones: tilt the device. iOS asks for permission on the first tap.
let gyro = false;
function onOrient(e) {
  if (reduced || e.gamma === null) return;
  gyro = true;
  card.classList.add('tracking');
  setTilt(Math.max(-1, Math.min(1, e.gamma / 25)), Math.max(-1, Math.min(1, (e.beta - 45) / 25)));
}
window.addEventListener('deviceorientation', onOrient);
stage.addEventListener(
  'click',
  () => {
    if (!gyro && typeof DeviceOrientationEvent?.requestPermission === 'function') DeviceOrientationEvent.requestPermission().catch(() => {});
  },
  { once: true }
);

// ---- Controls and sizing ----------------------------------------------------------

$('prev').addEventListener('click', () => show(index - 1));
$('next').addEventListener('click', () => show(index + 1));
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') show(index - 1);
  if (e.key === 'ArrowRight') show(index + 1);
});

function fit() {
  const s = Math.min(1, (window.innerHeight - 130) / 494, (window.innerWidth - 32) / 354);
  document.querySelector('.card-scene').style.setProperty('--fit', Math.max(0.5, s).toFixed(3));
}
window.addEventListener('resize', fit);
fit();
show(0);
