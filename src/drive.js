// Drive mode: take a car out and drive it yourself.
// Cockpit view like an F1 onboard shot (halo, steering wheel with a live
// display, front wing), plus T-cam and chase views. Arcade physics with a grip
// limit, DRS on straights, walls at the track edge and bridge barriers, lap
// timing with a saved best.
//
// Keys: W/↑ throttle · S/↓ brake (and reverse) · A/D or ←/→ steer · Space DRS ·
// C change camera · Esc leave. Touch: on-screen pedals and steering.

import * as THREE from 'three';
import { CAR } from './car/car.js';
import { TRACK_WIDTH, PIT_Z, PIT_WIDTH } from './game/layout.js';
import { h } from './ui/ui.js';
import { deg } from './geo.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const BEST_KEY = 'skycircuit.bestLap';
const VMAX = 46; // m/s, toy scale (~165 km/h)
const GEARS = 8;
const CAMS = ['cockpit', 'tcam', 'chase'];

function loadBestLap() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) || 'null');
  } catch {
    return null;
  }
}
function saveBestLap(v) {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

// Steering wheel with grips, paddles, rev LEDs and a small screen.
function buildSteeringWheel(team) {
  const g = new THREE.Group();
  const carbon = new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.45, metalness: 0.3 });
  const grip = new THREE.MeshStandardMaterial({ color: '#2a2b2f', roughness: 0.9 });
  const accent = new THREE.MeshStandardMaterial({ color: team.primary, roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.13, 0.035), carbon);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.035, 24, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1, 0.45, 1), carbon);
  top.position.y = 0.06;
  const grips = [];
  for (const s of [1, -1]) {
    const gp = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.1, 4, 8), grip);
    gp.position.set(s * 0.15, -0.005, 0);
    grips.push(gp);
    const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.01), accent);
    paddle.position.set(s * 0.1, 0.01, 0.03);
    grips.push(paddle);
  }
  // Screen texture (updated by the drive loop).
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.06), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  // Screen, LEDs and buttons face the driver (-Z); paddles sit behind (+Z).
  screen.position.set(0, 0.012, -0.024); // clear of the wheel face so it never z-fights
  screen.rotation.y = Math.PI;
  // Rev LEDs across the top.
  const leds = [];
  for (let i = 0; i < 15; i++) {
    const m = new THREE.MeshBasicMaterial({ color: '#222', toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.0055, 8), m);
    led.position.set(0.084 - i * 0.012, 0.063, -0.024);
    led.rotation.y = Math.PI;
    leds.push(led);
    g.add(led);
  }
  const buttons = [];
  const colors = ['#E03A3A', '#F5C518', '#2D7FF9', '#35B04A', '#ffffff', '#F26B1D'];
  colors.forEach((c, i) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.008, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }));
    b.position.set((i % 2 ? 1 : -1) * (0.085 + Math.floor(i / 2) * 0.001), -0.035 + Math.floor(i / 2) * 0.022, -0.024);
    buttons.push(b);
  });
  g.add(body, top, screen, ...grips, ...buttons);
  g.userData = { canvas, tex, leds };
  return g;
}

export class PlayerDrive {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.keys = new Set();
    this.touch = { throttle: 0, brake: 0, steer: 0 };
    this.cam = 'cockpit';
    this.bindKeys();
  }

  // ---- Start / stop ---------------------------------------------------------------

  start(team) {
    const g = this.game;
    if (this.active) return;
    if (g.explorer?.active) g.explorer.exitQuiet();
    const car = team.garageCar;
    if (!car?.driver) return;
    this.team = team;
    this.car = car;
    this.saved = car.drive;
    this.active = true;
    this.mode = 'track';
    // Place on the grid just behind the start line.
    const tr = g.track;
    const s0 = tr.length - 14;
    const p = tr.at(s0);
    this.pos = V(p.pos.x, 0, p.pos.z);
    this.heading = Math.atan2(p.tan.x, p.tan.z);
    this.v = 0;
    this.steer = 0;
    this.drs = false;
    this.flap = 0;
    this.pitch = 0;
    this.roll = 0;
    this.time = 0;
    this.lapStart = null;
    this.lapTime = 0;
    this.lastLap = null;
    this.bestLap = loadBestLap();
    this.s = s0;
    this.armed = false;
    this.offTrack = 0;
    this.shake = 0;
    this.accelPrev = 0;
    this.smp = { curv: 0 }; // read by the seated driver's head lean
    // The car becomes the player's.
    car.setGarage(false);
    car.root.visible = true;
    const d = car.driver;
    d.standing.root.visible = false;
    d.seated.root.visible = true;
    d.inCar = true;
    car.drive = this; // the game loop now updates us, and audio reads v
    // A real steering wheel in the cockpit.
    this.wheel = buildSteeringWheel(team.data);
    this.wheel.position.set(0, 0.63, 0.3); // low in the frame, like an onboard shot
    this.wheel.rotation.x = deg(22); // top leans toward the nose, face tilted up at the driver
    car.nodes.body.add(this.wheel);
    // Camera.
    g.rig.frozen = true;
    g.rig.controls.enabled = false;
    g.rig.stopAutoRotate?.();
    g.post.setTilt(0);
    g.camera.near = 0.03;
    g.ui.hideCard();
    g.ui.back.hidden = true;
    document.body.classList.add('walking', 'driving');
    this.setCam('cockpit');
    this.buildHud();
    g.audio?.start();
    g.ui.toast(`<b>${d.data.name}'s car #${car.number}.</b> W or ↑ to go, A/D to steer, Space for DRS, C for camera.`, { icon: '🏎', duration: 5000, accent: team.data.primary });
    this.place();
  }

  stop() {
    if (!this.active) return;
    const g = this.game;
    const car = this.car;
    this.active = false;
    g.interactions.enabled = true;
    document.body.classList.remove('walking', 'driving');
    this.hud?.remove();
    this.pads?.remove();
    car.nodes.body.remove(this.wheel);
    // Back to the garage on stands.
    car.drive = this.saved;
    car.drive.park(car.home.pos, 0);
    car.setGarage(true);
    car.nodes.sprung.rotation.set(0, 0, 0);
    car.nodes.flapR.rotation.x = 0;
    for (const s of Object.values(car.steers)) s.rotation.y = 0;
    const d = car.driver;
    d.seated.root.visible = false;
    d.seated.root.traverse((o) => (o.visible = true));
    d.standing.root.visible = true;
    d.inCar = false;
    g.post.setTilt(1);
    g.camera.fov = 32;
    g.camera.near = 0.5;
    g.camera.updateProjectionMatrix();
    const fwd = V(Math.sin(this.heading), 0, Math.cos(this.heading));
    g.rig.controls.target.copy(this.pos).addScaledVector(fwd, 10);
    g.rig.controls.enabled = true;
    g.rig.frozen = false;
    g.goHome();
    const best = this.bestLap ? ` Best lap ${this.bestLap.time.toFixed(2)} s.` : '';
    g.ui.toast(`Back in the garage.${best}`, { icon: '🏁', accent: this.team.data.primary });
  }

  setCam(c) {
    this.cam = c;
    const g = this.game;
    g.camera.fov = c === 'cockpit' ? 78 : c === 'tcam' ? 70 : 62;
    g.camera.updateProjectionMatrix();
    // Hide the driver in the cockpit view; the camera is their eyes.
    const d = this.car.driver;
    d.seated.root.visible = c !== 'cockpit';
    // In the cockpit the wheel's own display is the dash, so the HUD moves aside.
    this.hud?.classList.toggle('compact', c === 'cockpit');
    if (this.camBtn) this.camBtn.textContent = `Camera: ${c === 'tcam' ? 'T-cam' : c[0].toUpperCase() + c.slice(1)}`;
  }

  // ---- HUD ---------------------------------------------------------------------------------

  buildHud() {
    const g = this.game;
    this.hud?.remove();
    this.speedEl = h('div', { class: 'd-speed' }, '0');
    this.gearEl = h('div', { class: 'd-gear' }, 'N');
    this.lapEl = h('div', { class: 'd-lap' }, '--.--');
    this.lastEl = h('div', { class: 'd-small' }, 'Last --.--');
    this.bestEl = h('div', { class: 'd-small' }, `Best ${this.bestLap ? this.bestLap.time.toFixed(2) : '--.--'}`);
    this.drsEl = h('div', { class: 'd-drs' }, 'DRS');
    this.revEl = h('div', { class: 'd-rev' }, Array.from({ length: 15 }, () => h('i')));
    this.camBtn = h('button', { onclick: () => this.setCam(CAMS[(CAMS.indexOf(this.cam) + 1) % CAMS.length]) }, 'Camera: Cockpit');
    this.hud = h(
      'div',
      { class: 'drive-hud', role: 'region', 'aria-label': 'Driving' },
      this.revEl,
      h('div', { class: 'd-row' }, h('div', { class: 'd-col' }, this.gearEl, h('div', { class: 'd-label' }, 'GEAR')), h('div', { class: 'd-col' }, this.speedEl, h('div', { class: 'd-label' }, 'KM/H')), h('div', { class: 'd-col' }, this.lapEl, this.lastEl, this.bestEl), this.drsEl),
      h('div', { class: 'd-help' }, matchMedia('(pointer: coarse)').matches ? 'Pedals right · steer left · DRS on straights' : 'W/↑ go · S/↓ brake · A/D steer · Space DRS · C camera · Esc leave'),
      h('div', { class: 'd-actions' }, this.camBtn, h('button', { class: 'primary', onclick: () => this.stop() }, 'Leave car'))
    );
    g.ui.root.append(this.hud);
    this.hud.classList.toggle('compact', this.cam === 'cockpit');
    if (matchMedia('(pointer: coarse)').matches) this.buildPads();
  }

  buildPads() {
    this.pads?.remove();
    const hold = (label, cls, on, off) => {
      const b = h('button', { class: `pad ${cls}`, 'aria-label': label }, label);
      const down = (e) => {
        e.preventDefault();
        b.setPointerCapture?.(e.pointerId);
        on();
      };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      return b;
    };
    this.pads = h(
      'div',
      { class: 'drive-pads' },
      h('div', { class: 'pads-left' }, hold('◀', 'steer', () => (this.touch.steer = 1), () => (this.touch.steer = 0)), hold('▶', 'steer', () => (this.touch.steer = -1), () => (this.touch.steer = 0))),
      h('div', { class: 'pads-right' }, hold('DRS', 'drs', () => this.toggleDrs(), () => {}), hold('Brake', 'brake', () => (this.touch.brake = 1), () => (this.touch.brake = 0)), hold('Go', 'go', () => (this.touch.throttle = 1), () => (this.touch.throttle = 0)))
    );
    this.game.ui.root.append(this.pads);
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (k === ' ' && !e.repeat) this.toggleDrs();
      else if (k === 'c' && !e.repeat) this.setCam(CAMS[(CAMS.indexOf(this.cam) + 1) % CAMS.length]);
      else if (k === 'escape') this.stop();
      else this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  toggleDrs() {
    // DRS only opens on straights at speed, and closes on braking or in corners.
    const smp = this.game.track.at(this.s);
    if (!this.drs && (Math.abs(smp.curv) > 0.02 || this.v < 18)) {
      this.game.ui.toast('DRS is only available on the straights.', { icon: '🚫', duration: 1200 });
      return;
    }
    this.drs = !this.drs;
  }

  // ---- Physics -----------------------------------------------------------------------

  update(dt) {
    if (!this.active) return;
    const g = this.game;
    const k = this.keys;
    this.time += dt;
    const throttle = Math.max(k.has('w') || k.has('arrowup') ? 1 : 0, this.touch.throttle);
    const brake = Math.max(k.has('s') || k.has('arrowdown') ? 1 : 0, this.touch.brake);
    const steerIn = (k.has('a') || k.has('arrowleft') ? 1 : 0) - (k.has('d') || k.has('arrowright') ? 1 : 0) + this.touch.steer;

    // Where are we relative to the track?
    const tr = g.track;
    this.s = tr.nearest(this.pos);
    const smp = tr.at(this.s);
    const n = V(smp.tan.z, 0, -smp.tan.x); // left normal
    const rel = this.pos.clone().sub(smp.pos);
    const lat = rel.dot(n);
    const offTrack = Math.abs(lat) > TRACK_WIDTH / 2 + 0.5;
    const vmax = VMAX * (this.drs ? 1.12 : 1) * (offTrack ? 0.45 : 1);

    // Longitudinal.
    let a = 0;
    if (throttle) a += this.v < 0 ? 16 : 15 * Math.max(0, 1 - Math.pow(this.v / vmax, 2));
    if (brake) a -= this.v > 0.5 ? 30 : 7; // brake, then reverse
    a -= 0.002 * this.v * Math.abs(this.v) + (offTrack ? 3 * Math.sign(this.v) : 0.3 * Math.sign(this.v));
    if (!throttle && !brake && Math.abs(this.v) < 0.4) this.v = 0;
    this.v = THREE.MathUtils.clamp(this.v + a * dt, -8, vmax);
    if (brake && this.drs) this.drs = false;
    if (this.drs && Math.abs(smp.curv) > 0.03) this.drs = false;

    // Steering: less lock at speed, and yaw limited by grip.
    const maxSteer = deg(25) * (1 - Math.min(0.75, Math.abs(this.v) / VMAX * 0.8));
    this.steer += (steerIn * maxSteer - this.steer) * Math.min(1, dt * 8);
    let yawRate = (this.v * Math.tan(this.steer)) / CAR.wheelbase;
    const grip = offTrack ? 9 : 24;
    const maxYaw = grip / Math.max(3, Math.abs(this.v));
    yawRate = THREE.MathUtils.clamp(yawRate, -maxYaw, maxYaw);
    this.heading += yawRate * dt;
    const fwd = V(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.pos.addScaledVector(fwd, this.v * dt);

    // Walls: track-edge limit (tighter on bridges), and the pit wall.
    const onIsland = g.onIsland(smp.pos.x + n.x * lat, smp.pos.z + n.z * lat);
    const limit = onIsland ? TRACK_WIDTH / 2 + 4.8 : TRACK_WIDTH / 2 + 1.5;
    const lat2 = this.pos.clone().sub(smp.pos).dot(n);
    const pitWallZ = PIT_Z + PIT_WIDTH / 2 + 1.7;
    let hit = false;
    if (Math.abs(lat2) > limit) {
      this.pos.addScaledVector(n, (Math.sign(lat2) * limit - lat2));
      hit = true;
    }
    if (Math.abs(this.pos.x) < 50 && this.pos.z < pitWallZ && smp.pos.z > -40) {
      this.pos.z = pitWallZ;
      hit = true;
    }
    if (hit) {
      const along = Math.atan2(smp.tan.x, smp.tan.z);
      let dh = along - this.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      if (Math.abs(dh) > Math.PI / 2) dh = Math.atan2(Math.sin(dh + Math.PI), Math.cos(dh + Math.PI));
      this.heading += dh * 0.35;
      if (Math.abs(this.v) > 6) {
        this.shake = 0.35;
        g.audio?.thud?.();
      }
      this.v *= 0.55;
      this.drs = false;
    }
    // Soft bumps with the other cars.
    for (const t of g.teams) {
      for (const c of t.cars) {
        if (c === this.car) continue;
        const d = c.root.position.distanceTo(this.pos);
        if (d < 2.6 && d > 0.01) {
          const push = this.pos.clone().sub(c.root.position).setY(0).normalize().multiplyScalar(2.6 - d);
          this.pos.add(push);
          this.v *= 0.8;
          this.shake = 0.25;
        }
      }
    }

    // Lap timing: arm past half distance, complete on crossing the line.
    const sNow = this.s;
    if (sNow > tr.length * 0.45 && sNow < tr.length * 0.6) this.armed = true;
    if (this.prevS !== undefined && this.prevS > tr.length - 40 && sNow < 40) {
      if (this.armed && this.lapStart !== null) this.finishLap();
      this.lapStart = this.time;
      this.armed = false;
    }
    this.prevS = sNow;
    this.lapTime = this.lapStart === null ? 0 : this.time - this.lapStart;

    // Body motion and animated nodes.
    const accel = (this.v - (this.vPrev ?? this.v)) / Math.max(dt, 1e-4);
    this.vPrev = this.v;
    const kk = Math.min(1, dt * 6);
    this.pitch += (THREE.MathUtils.clamp(-accel / 30, -0.6, 1) * deg(2) - this.pitch) * kk;
    this.roll += (THREE.MathUtils.clamp((this.v * yawRate) / 20, -1, 1) * deg(2) - this.roll) * kk;
    this.flap += ((this.drs ? deg(60) : 0) - this.flap) * Math.min(1, dt * 10);
    this.smp.curv = Math.tan(this.steer) / CAR.wheelbase;
    this.shake = Math.max(0, this.shake - dt);
    this.place();
    this.animate(dt, offTrack);
    this.updateHud();
  }

  finishLap() {
    const t = this.lapTime;
    this.lastLap = t;
    const g = this.game;
    const isBest = !this.bestLap || t < this.bestLap.time;
    if (isBest) {
      this.bestLap = { time: t, number: this.car.number, date: new Date().toISOString() };
      saveBestLap(this.bestLap);
    }
    g.ui.toast(`Lap ${t.toFixed(2)} s${isBest ? ' · new best!' : ''}`, { icon: '⏱', accent: this.team.data.primary, duration: 2500 });
  }

  // Compatibility with the AI drivers' fields the rest of the game reads.
  get mode() {
    return this._mode || 'track';
  }
  set mode(m) {
    this._mode = m;
  }
  park(pos, heading) {
    this.saved?.park(pos, heading);
  }

  place() {
    const car = this.car;
    car.root.position.copy(this.pos);
    car.root.rotation.set(0, this.heading, 0);
  }

  animate(dt, offTrack) {
    const car = this.car;
    const n = car.nodes;
    const spin = (this.v / CAR.wheelR) * dt;
    for (const w of Object.values(car.wheels)) w.rotation.x += spin;
    for (const s of Object.values(car.steers)) s.rotation.y = this.steer;
    n.sprung.rotation.x = this.pitch;
    n.sprung.rotation.z = this.roll;
    n.sprung.position.y = offTrack ? Math.sin(this.time * 40) * 0.01 * Math.min(1, Math.abs(this.v) / 10) : 0;
    n.flapR.rotation.x = this.flap;
    car.setRainLight(this.game.rain && Math.floor(this.time * 8) % 2 === 0);
    // Steering wheel turns with the front wheels (about 4x).
    if (this.wheel) this.wheel.rotation.z = this.steer * 4;
    this.updateCamera(dt);
  }

  updateCamera(dt) {
    const cam = this.game.camera;
    const car = this.car;
    car.root.updateMatrixWorld(true);
    const shake = this.shake > 0 ? (Math.random() - 0.5) * 0.02 * (this.shake / 0.35) : 0;
    const buzz = Math.abs(this.v) > 1 ? (Math.random() - 0.5) * 0.0015 * Math.min(1, Math.abs(this.v) / VMAX) : 0;
    if (this.cam === 'cockpit') {
      // Eye just under the halo hoop, looking down the nose.
      const eye = V(0, 0.765 + shake + buzz, -0.1).applyMatrix4(car.nodes.body.matrixWorld);
      const look = V(0, 0.62, 6).applyMatrix4(car.nodes.body.matrixWorld);
      cam.position.copy(eye);
      cam.up.set(0, 1, 0);
      cam.lookAt(look);
    } else if (this.cam === 'tcam') {
      const eye = V(0, 1.12 + shake, -0.25).applyMatrix4(car.nodes.body.matrixWorld);
      const look = V(0, 0.7, 8).applyMatrix4(car.nodes.body.matrixWorld);
      cam.position.copy(eye);
      cam.lookAt(look);
    } else {
      // Chase: trails behind and above, smoothed.
      const want = V(0, 2.6, -8.5).applyMatrix4(car.root.matrixWorld);
      this.chase = this.chase ? this.chase.lerp(want, Math.min(1, dt * 6)) : want;
      cam.position.copy(this.chase);
      cam.position.y += shake;
      cam.lookAt(V(0, 0.8, 3).applyMatrix4(car.root.matrixWorld));
    }
  }

  updateHud() {
    const kmh = Math.round(Math.abs(this.v) * 3.6);
    const f = Math.min(0.999, Math.abs(this.v) / (VMAX * 1.12));
    const gear = this.v < -0.3 ? 'R' : Math.abs(this.v) < 0.3 ? 'N' : String(Math.min(GEARS, 1 + Math.floor(f * GEARS)));
    const rpm = Math.abs(this.v) < 0.3 ? 0.08 : (f * GEARS) % 1;
    const lit = Math.round(rpm * 15);
    this.speedEl.textContent = kmh;
    this.gearEl.textContent = gear;
    this.lapEl.textContent = this.lapStart === null ? 'Out lap' : this.lapTime.toFixed(2);
    this.lastEl.textContent = `Last ${this.lastLap ? this.lastLap.toFixed(2) : '--.--'}`;
    this.bestEl.textContent = `Best ${this.bestLap ? this.bestLap.time.toFixed(2) : '--.--'}`;
    this.drsEl.classList.toggle('on', this.drs);
    const smp = this.game.track.at(this.s);
    this.drsEl.classList.toggle('avail', !this.drs && Math.abs(smp.curv) < 0.02 && this.v > 18);
    [...this.revEl.children].forEach((el, i) => (el.className = i < lit ? (i < 5 ? 'g' : i < 10 ? 'r' : 'b') : ''));
    // Wheel screen and LEDs, ~10 Hz.
    if (this.wheel && this.time - (this.screenAt ?? -1) > 0.1) {
      this.screenAt = this.time;
      const { canvas, tex, leds } = this.wheel.userData;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#05070a';
      ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = '#F4F5F7';
      ctx.textAlign = 'center';
      ctx.font = '900 76px Nunito, Arial, sans-serif';
      ctx.fillText(gear, 128, 88);
      ctx.font = '800 26px Nunito, Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(String(kmh), 12, 36);
      ctx.textAlign = 'right';
      ctx.fillText(this.lapStart === null ? 'OUT' : this.lapTime.toFixed(1), 244, 36);
      ctx.fillStyle = this.drs ? '#35d45a' : '#555';
      ctx.fillRect(12, 96, 60, 22);
      ctx.fillStyle = '#05070a';
      ctx.font = '900 18px Nunito, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DRS', 42, 113);
      tex.needsUpdate = true;
      leds.forEach((l, i) => l.material.color.set(i < lit ? (i < 5 ? '#35d45a' : i < 10 ? '#ff3b30' : '#4a7dff') : '#222'));
    }
  }
}
