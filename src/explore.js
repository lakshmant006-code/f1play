// Walk mode: step into an area at eye level and explore it on foot.
// WASD / arrows to walk (Shift runs), drag to look, on-screen joystick on touch.
// You can climb the grandstand rows and the podium stairs, ride the tower lift
// to the observation deck, and walk the track and bridges, but not off an island.

import * as THREE from 'three';
import { GRID } from './data.js';
import { LANDMARKS, STAND, TOWER_H } from './world/circuit.js';
import { PODIUM_HEIGHT } from './world/podium.js';
import { GARAGE_X, GARAGE_FRONT_Z, GARAGE_DEPTH, PIT_WALL_Z, DECK_X, DECK_Z, DECK_W, DECK_D, DECK_H, TRACK_WIDTH } from './game/layout.js';
import { h } from './ui/ui.js';
import { reducedMotion } from './camera.js';

const EYE = 1.65;
const STEP = 0.7; // highest step you can walk up (drops over 1.5 m are blocked)
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Convert a point in a landmark's local frame (rotated about Y) to world space.
const toWorld = (lm, lx, lz) => {
  const c = Math.cos(lm.rot || 0);
  const s = Math.sin(lm.rot || 0);
  return { x: lm.x + lx * c + lz * s, z: lm.z - lx * s + lz * c };
};
const toLocal = (lm, x, z) => {
  const dx = x - lm.x;
  const dz = z - lm.z;
  const c = Math.cos(lm.rot || 0);
  const s = Math.sin(lm.rot || 0);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
};
// Yaw that looks from a toward b.
const yawTo = (ax, az, bx, bz) => Math.atan2(-(bx - ax), -(bz - az));

export const PLACES = {
  grandstand: {
    name: 'Grandstand island',
    blurb: 'Stand trackside, then take a seat in the stand as the cars sweep past.',
    spawn: () => {
      const p = toWorld(LANDMARKS.grandstand, -10, 3.2);
      const q = toWorld(LANDMARKS.grandstand, 2, -5);
      return { x: p.x, y: 0, z: p.z, yaw: yawTo(p.x, p.z, q.x, q.z), pitch: 0.12 };
    },
    views: [
      {
        label: 'Take a seat',
        go: () => {
          const r = 6;
          const p = toWorld(LANDMARKS.grandstand, 2, -r * STAND.rowD - 0.3);
          return { x: p.x, y: STAND.base + r * STAND.rowH, z: p.z, yaw: yawTo(p.x, p.z, p.x, p.z + 10) };
        },
      },
      {
        label: 'Top row',
        go: () => {
          const r = STAND.rows - 1;
          const p = toWorld(LANDMARKS.grandstand, -8, -r * STAND.rowD - 0.3);
          return { x: p.x, y: STAND.base + r * STAND.rowH, z: p.z, yaw: yawTo(p.x, p.z, p.x + 4, p.z + 10) };
        },
      },
    ],
  },
  pit: {
    name: 'Pit island',
    blurb: 'Walk the pit lane past all five garages. Mind the cars.',
    spawn: () => ({ x: GARAGE_X[0] + 4, y: 0, z: GARAGE_FRONT_Z + 1.3, yaw: yawTo(0, 0, 1, 0.35) }),
    views: [
      ...GRID.map((t, i) => ({ label: `${t.name.split(' ')[0]} garage`, go: () => ({ x: GARAGE_X[i] + 2.8, y: 0, z: GARAGE_FRONT_Z - 1, yaw: yawTo(0, 0, -0.5, -1) }) })),
      { label: 'Pit wall', go: () => ({ x: DECK_X[1] + 0.9, y: DECK_H, z: DECK_Z - 0.9, yaw: yawTo(0, 0, 0, 1) }) },
      { label: 'Start line', go: () => ({ x: -16, y: 0, z: -35 + TRACK_WIDTH / 2 + 1.5, yaw: yawTo(0, 0, 1, -0.1) }) },
    ],
  },
  tower: {
    name: 'Watch tower island',
    blurb: 'Walk round race control, then take the lift to the observation deck.',
    spawn: () => {
      const t = LANDMARKS.tower;
      return { x: t.x + 7, y: 0, z: t.z + 13, yaw: yawTo(t.x + 7, t.z + 13, t.x, t.z), pitch: 0.42 };
    },
    views: [
      {
        label: 'Lift to the deck',
        go: () => {
          // Stand on the side of the deck facing the main straight, looking down at it.
          const t = LANDMARKS.tower;
          const d = new THREE.Vector2(4 - t.x, -20 - t.z).normalize();
          return { x: t.x + d.x * 6.95, y: TOWER_H + 2.42, z: t.z + d.y * 6.95, yaw: yawTo(0, 0, d.x, d.y), pitch: -0.32 };
        },
      },
      { label: 'Back to the plaza', go: () => PLACES.tower.spawn() },
    ],
  },
  podium: {
    name: 'Podium island',
    blurb: 'Stand in the crowd under the balcony, or climb up and look down on the fans.',
    spawn: () => {
      const p = toWorld(LANDMARKS.podium, 3, 19.5);
      const q = toWorld(LANDMARKS.podium, 0, 0);
      return { x: p.x, y: 0, z: p.z, yaw: yawTo(p.x, p.z, q.x, q.z), pitch: 0.22 };
    },
    views: [
      {
        label: 'Onto the balcony',
        go: () => {
          const p = toWorld(LANDMARKS.podium, 4, 2.2);
          const q = toWorld(LANDMARKS.podium, 0, 14);
          return { x: p.x, y: PODIUM_HEIGHT + 0.45, z: p.z, yaw: yawTo(p.x, p.z, q.x, q.z) };
        },
      },
      {
        label: 'Into the crowd',
        go: () => {
          const p = toWorld(LANDMARKS.podium, 2, 15.6);
          const q = toWorld(LANDMARKS.podium, 0, 0);
          return { x: p.x, y: 0, z: p.z, yaw: yawTo(p.x, p.z, q.x, q.z), pitch: 0.4 };
        },
      },
      { label: 'Trackside', go: () => PLACES.podium.spawn() },
    ],
  },
};

export class Explorer {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.pos = V(0, 0, 0);
    this.feet = 0;
    this.yaw = 0;
    this.pitch = -0.05;
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.bob = 0;
    this.bindInput();
  }

  // ---- Walkable world ------------------------------------------------------------

  // Surfaces you can stand on at (x, z): [{ y }] plus solid blocks you can't enter.
  surfaces(x, z) {
    const out = [];
    const g = this.game;
    // Ground: islands, plus the track and bridges.
    const smp = g.track.at(g.track.nearest(V(x, 0, z)));
    const onTrack = Math.hypot(smp.pos.x - x, smp.pos.z - z) < TRACK_WIDTH / 2 + 2;
    if (g.onIsland(x, z) || onTrack) out.push(0);

    // Pit wall decks.
    for (const dx of DECK_X) if (Math.abs(x - dx) < DECK_W / 2 && Math.abs(z - DECK_Z) < DECK_D / 2) out.push(DECK_H);

    // Grandstand terraces.
    const gs = LANDMARKS.grandstand;
    let l = toLocal(gs, x, z);
    if (Math.abs(l.x) < gs.len / 2 && l.z <= 0.3 && l.z > -STAND.rows * STAND.rowD) {
      const r = Math.min(STAND.rows - 1, Math.max(0, Math.floor(-l.z / STAND.rowD)));
      out.push(STAND.base + r * STAND.rowH);
    }
    // Podium: stairs, landing, roof and balcony.
    const pd = LANDMARKS.podium;
    l = toLocal(pd, x, z);
    const W = 16;
    const H = PODIUM_HEIGHT;
    for (const sx of [-1, 1]) {
      if (Math.abs(l.x - sx * (W / 2 + 1.1)) < 0.9) {
        if (l.z >= -9.5 && l.z <= -0.7) out.push(((l.z + 9.5) / (16 * 0.55)) * H);
        if (l.z > -1.2 && l.z < 0.6) out.push(H + 0.45);
      }
    }
    if (Math.abs(l.x) < W / 2 + 0.2 && l.z > -10 && l.z < 3.6 + Math.cos(Math.asin(Math.min(1, Math.abs(l.x) / 26))) * 0.7) out.push(H + 0.45);
    // Tower deck ring and lobby roof.
    const tw = LANDMARKS.tower;
    const dr = Math.hypot(x - tw.x, z - tw.z);
    if (dr > 6.5 && dr < 7.4) out.push(TOWER_H + 2.42);
    return out;
  }

  // Solid things that block you when your feet are below their top.
  blocked(x, z, feet) {
    const tw = LANDMARKS.tower;
    const dr = Math.hypot(x - tw.x, z - tw.z);
    if (feet < 4.3 && dr < 5.1) return true; // lobby
    if (feet < TOWER_H + 6 && feet > TOWER_H && dr < 6.5) return true; // pod glass
    if (feet > TOWER_H && dr > 7.45) return true; // deck railing
    const pd = LANDMARKS.podium;
    const l = toLocal(pd, x, z);
    if (feet < PODIUM_HEIGHT - 0.5 && Math.abs(l.x) < 8 && l.z > -10 && l.z < -3) return true; // base building
    if (feet > PODIUM_HEIGHT - 0.5 && Math.abs(l.x) < 8.2 && l.z > 4.1 && l.z < 6) return true; // balustrade
    if (Math.abs(l.z - 17.4) < 0.25 && Math.abs(l.x) < 14) return true; // crowd fence
    // Pit building: back wall, dividers, pit wall.
    if (x > -34 && x < 34) {
      const zb = GARAGE_FRONT_Z - GARAGE_DEPTH;
      if (z < zb + 0.6 && z > zb - 3) return true;
      if (z < GARAGE_FRONT_Z && z > zb) {
        const dividers = [-34, ...GARAGE_X.slice(0, -1).map((gx, i) => (gx + GARAGE_X[i + 1]) / 2), 34];
        if (dividers.some((d) => Math.abs(x - d) < 0.45)) return true;
      }
    }
    if (Math.abs(z - PIT_WALL_Z) < 0.4 && Math.abs(x) < 50) return true;
    // Pit wall decks: the desk along the front, glass ends and roof posts.
    for (const dx of DECK_X) {
      const lx = x - dx;
      const lz = z - DECK_Z;
      if (Math.abs(lx) < DECK_W / 2 && lz > 0.55 && lz < DECK_D / 2 + 0.1) return true;
      if (Math.abs(Math.abs(lx) - DECK_W / 2) < 0.15 && Math.abs(lz) < DECK_D / 2) return true;
    }
    // Parked garage cars.
    for (const t of this.game.teams) {
      const c = t.garageCar;
      if (c && c.drive?.mode !== 'track' && c.root.position.distanceTo(V(x, c.root.position.y, z)) < 2.2 && feet < 1) return true;
    }
    return false;
  }

  // Height you'd stand at by moving to (x, z), or null if you can't go there.
  standAt(x, z) {
    if (this.blocked(x, z, this.feet)) return null;
    const cands = this.surfaces(x, z).filter((y) => y <= this.feet + STEP);
    if (!cands.length) return null;
    const y = Math.max(...cands);
    // Ledges are walls: no stepping off balconies, decks or terraces.
    return this.feet - y > 1.5 ? null : y;
  }

  // ---- Enter / leave ----------------------------------------------------------------

  enter(placeId) {
    const place = PLACES[placeId];
    if (!place) return;
    const g = this.game;
    this.place = placeId;
    const spot = place.spawn();
    const start = () => {
      this.active = true;
      g.rig.frozen = true;
      g.rig.controls.enabled = false;
      g.rig.stopAutoRotate?.();
      g.post.setTilt(0);
      g.camera.fov = 62;
      g.camera.near = 0.1;
      g.camera.updateProjectionMatrix();
      this.teleport(spot);
      this.showHud();
      document.body.classList.add('walking');
      g.ui.hideCard();
      g.ui.back.hidden = true;
      g.audio?.start();
      g.ui.toast(`<b>${place.name}</b>`, { icon: '🚶', duration: 2000 });
    };
    // Swoop down toward the spot, then hand over to walking.
    g.focusView(V(spot.x, spot.y + 1, spot.z), { distance: 14, elevation: 18, azimuth: spot.yaw, minEl: 5 });
    g.after(reducedMotion() ? 0.5 : 0.85, start);
  }

  teleport(spot) {
    this.pos.set(spot.x, 0, spot.z);
    this.feet = spot.y ?? 0;
    this.targetFeet = this.feet;
    this.yaw = spot.yaw ?? this.yaw;
    this.pitch = spot.pitch ?? -0.05;
    this.applyCamera();
  }

  goView(i) {
    const v = PLACES[this.place].views[i];
    if (!v) return;
    const g = this.game;
    const spot = v.go();
    if (reducedMotion()) {
      this.teleport(spot);
      return;
    }
    // Quick fade-cut between viewpoints within the area.
    g.post.grade.uniforms.fade.value = 1;
    this.teleport(spot);
    this.fadeIn = 0.35;
  }

  exit() {
    if (!this.active) return;
    const g = this.game;
    this.active = false;
    document.body.classList.remove('walking');
    this.hud?.remove();
    this.joyEl?.remove();
    g.post.setTilt(1);
    g.camera.fov = 32;
    g.camera.near = 0.5;
    g.camera.updateProjectionMatrix();
    // Hand the camera back to the orbit rig, looking where we were looking.
    const fwd = V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    g.rig.controls.target.copy(g.camera.position).addScaledVector(fwd, 20).setY(0);
    g.rig.controls.enabled = true;
    g.rig.frozen = false;
    g.goHome();
  }

  // ---- HUD -------------------------------------------------------------------------------

  showHud() {
    const g = this.game;
    this.hud?.remove();
    const place = PLACES[this.place];
    const others = Object.entries(PLACES).filter(([id]) => id !== this.place);
    this.hud = h(
      'div',
      { class: 'walk-hud panel', role: 'region', 'aria-label': `Walking in ${place.name}` },
      h('div', { class: 'kicker' }, 'Walking'),
      h('h2', {}, place.name),
      h('p', { class: 'walk-help' }, matchMedia('(pointer: coarse)').matches ? 'Joystick to walk · drag to look' : 'WASD / arrows to walk · Shift to run · drag to look'),
      h('div', { class: 'actions' }, place.views.map((v, i) => h('button', { onclick: () => this.goView(i) }, v.label))),
      (() => {
        const extra = g.placeActions?.(this.place) || [];
        return extra.length ? h('div', { class: 'actions' }, extra.map((a) => h('button', { class: 'accent', onclick: a.onClick }, a.label))) : null;
      })(),
      h('div', { class: 'actions' }, others.map(([id, p]) => h('button', { class: 'ghost', onclick: () => { this.exitQuiet(); this.enter(id); } }, `→ ${p.name.replace(' island', '')}`))),
      h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => this.exit() }, 'Leave · back to overview'), h('button', { 'aria-pressed': String(!!g.audio?.muted), onclick: (e) => { g.audio?.toggle(); e.currentTarget.setAttribute('aria-pressed', String(g.audio?.muted)); e.currentTarget.textContent = g.audio?.muted ? 'Sound off' : 'Sound on'; } }, g.audio?.muted ? 'Sound off' : 'Sound on'))
    );
    g.ui.root.append(this.hud);
    if (matchMedia('(pointer: coarse)').matches) this.buildJoystick();
  }

  exitQuiet() {
    this.active = false;
    this.hud?.remove();
    this.joyEl?.remove();
  }

  buildJoystick() {
    this.joyEl?.remove();
    const knob = h('div', { class: 'joy-knob' });
    const pad = h('div', { class: 'joy', 'aria-hidden': 'true' }, knob);
    this.game.ui.root.append(pad);
    this.joyEl = pad;
    let id = null;
    const move = (e) => {
      const r = pad.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let dx = (e.clientX - cx) / (r.width / 2);
      let dy = (e.clientY - cy) / (r.height / 2);
      const m = Math.hypot(dx, dy);
      if (m > 1) {
        dx /= m;
        dy /= m;
      }
      this.joy = { x: dx, y: dy };
      knob.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
    };
    pad.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      pad.setPointerCapture(id);
      move(e);
    });
    pad.addEventListener('pointermove', (e) => e.pointerId === id && move(e));
    const end = () => {
      id = null;
      this.joy = { x: 0, y: 0 };
      knob.style.transform = '';
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
  }

  // ---- Input -----------------------------------------------------------------------------

  bindInput() {
    const dom = this.game.renderer.domElement;
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.target instanceof HTMLElement && e.target.closest('input, select, textarea')) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'q', 'e'].includes(k)) {
        this.keys.add(k);
        if (k.startsWith('arrow')) e.preventDefault();
      }
      if (k === 'escape') this.exit();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    let drag = null;
    dom.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.active || !drag || e.pointerId !== drag.id) return;
      const s = e.pointerType === 'touch' ? 0.006 : 0.004;
      this.yaw -= (e.clientX - drag.x) * s;
      this.pitch = THREE.MathUtils.clamp(this.pitch - (e.clientY - drag.y) * s, -1.3, 1.2);
      drag.x = e.clientX;
      drag.y = e.clientY;
    });
    window.addEventListener('pointerup', () => (drag = null));
  }

  // ---- Frame -----------------------------------------------------------------------------

  update(dt) {
    if (!this.active) return;
    const k = this.keys;
    let f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) - this.joy.y;
    let r = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0) + this.joy.x;
    // Arrow left/right and Q/E turn; A/D strafe.
    const turn = (k.has('arrowleft') || k.has('q') ? 1 : 0) - (k.has('arrowright') || k.has('e') ? 1 : 0);
    this.yaw += turn * dt * 1.8;
    const mag = Math.hypot(f, r);
    if (mag > 1) {
      f /= mag;
      r /= mag;
    }
    const speed = k.has('shift') ? 8 : 4;
    const fwd = V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = V(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const step = fwd.multiplyScalar(f * speed * dt).add(right.multiplyScalar(r * speed * dt));
    if (step.lengthSq() > 0) {
      // Try the full move, then slide along each axis.
      const tries = [[step.x, step.z], [step.x, 0], [0, step.z]];
      for (const [dx, dz] of tries) {
        if (!dx && !dz) continue;
        const y = this.standAt(this.pos.x + dx, this.pos.z + dz);
        if (y !== null) {
          this.pos.x += dx;
          this.pos.z += dz;
          this.targetFeet = y;
          break;
        }
      }
      this.bob += dt * (k.has('shift') ? 13 : 9);
    }
    // Settle onto the surface under you (falls gently, steps up quickly).
    const here = this.standAt(this.pos.x, this.pos.z);
    if (here !== null) this.targetFeet = here;
    if (this.targetFeet !== undefined) this.feet += (this.targetFeet - this.feet) * Math.min(1, dt * (this.targetFeet > this.feet ? 14 : 8));
    if (this.fadeIn > 0) {
      this.fadeIn -= dt;
      this.game.post.grade.uniforms.fade.value = Math.max(0, this.fadeIn / 0.35);
    }
    this.applyCamera(step.lengthSq() > 0);
  }

  applyCamera(moving = false) {
    const cam = this.game.camera;
    const bob = moving && !reducedMotion() ? Math.sin(this.bob) * 0.035 : 0;
    cam.position.set(this.pos.x, this.feet + EYE + bob, this.pos.z);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
