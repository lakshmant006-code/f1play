// Race engineer mode: the player sits on their team's pit wall deck in first
// person and runs the lapping car over the radio. Pace calls (push, balanced,
// save tyres) change its speed and tyre wear; box calls bring it in for a
// crew-run stop on the chosen tyres. Rain comes and goes and the driver
// reports what they feel. Drag to look around, or let the view follow the car.

import * as THREE from 'three';
import { h } from '../ui/ui.js';
import { COMPOUNDS } from '../data.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const MODES = {
  push: { label: 'Push', pace: 1.07, wear: 1.5, say: 'Push now, push push. Everything you have.', reply: 'Copy, pushing.' },
  normal: { label: 'Balanced', pace: 1, wear: 1, say: 'OK, back to target lap times.', reply: 'Understood, target laps.' },
  save: { label: 'Save tyres', pace: 0.94, wear: 0.6, say: 'Manage the tyres now. Lift and coast into turn one.', reply: 'Copy, looking after them.' },
};
// Wear per lap on each compound, and pace factor fresh.
const TYRE = {
  soft: { wear: 0.34, pace: 1.02 },
  medium: { wear: 0.23, pace: 1 },
  hard: { wear: 0.15, pace: 0.985 },
  intermediate: { wear: 0.26, pace: 0.97 },
};
const BOX_TYRES = ['soft', 'medium', 'hard', 'intermediate'];
const fmt = (t) => (t == null ? '--.--' : t.toFixed(2));

export class EngineerMode {
  constructor(game) {
    this.game = game;
    this.active = false;
  }

  // recipe: the player's character, worn by the team's race engineer.
  start(team, recipe) {
    const g = this.game;
    if (this.active || !team?.trackCar?.drive) return;
    this.active = true;
    this.team = team;
    this.car = team.trackCar;
    this.d = this.car.drive;
    this.time = 0;
    this.mode = 'normal';
    this.wear = 0;
    this.compound = this.car.compounds?.FL || 'medium';
    this.lastS = this.d.s;
    this.lastLapSeen = this.d.lastLap;
    this.laps = 0;
    this.best = null;
    this.last = null;
    this.stops = 0;
    this.boxing = null;
    this.nextEvent = 25 + Math.random() * 15;
    this.warned = {};
    this.log = [];
    this.follow = true;
    this.yaw = 0;
    this.pitch = -0.08;

    // Our character takes the race engineer's seat; we see through their eyes.
    const eng = team.crew.engineer;
    this.eng = eng;
    this.oldLook = { ...eng.person.recipe };
    if (recipe) eng.person.restyle({ ...recipe, helmet: false, name: eng.person.recipe.name });
    eng.root.visible = false;

    g.ui.hideCard();
    g.ui.closeModal();
    g.interactions.enabled = false;
    g.rig.frozen = true;
    g.rig.controls.enabled = false;
    g.rig.stopAutoRotate?.();
    g.post.setTilt(0);
    g.camera.fov = 58;
    g.camera.near = 0.05;
    g.camera.updateProjectionMatrix();
    document.body.classList.add('walking', 'eng-mode');
    this.buildPanel();
    this.bindLook();
    this.say(`Radio check, ${this.driverName()}. How are the tyres?`, 'Loud and clear. Tyres feel good. Let’s go.');
    g.audio?.start();
  }

  driverName() {
    return this.car.driver?.data.name.split(' ')[0] || 'driver';
  }

  stop() {
    if (!this.active) return;
    const g = this.game;
    this.active = false;
    this.d.pace = 1;
    this.eng.person.restyle(this.oldLook);
    this.eng.root.visible = true;
    this.panel?.remove();
    this.unbindLook?.();
    document.body.classList.remove('walking', 'eng-mode');
    g.post.setTilt(1);
    g.camera.fov = 32;
    g.camera.near = 0.5;
    g.camera.updateProjectionMatrix();
    const fwd = V(-Math.sin(this.yaw), 0, Math.cos(this.yaw));
    g.rig.controls.target.copy(g.camera.position).addScaledVector(fwd, 20).setY(0);
    g.rig.controls.enabled = true;
    g.rig.frozen = false;
    g.interactions.enabled = true;
    g.goHome();
    this.onExit?.();
  }

  // ---- Radio -------------------------------------------------------------------------------

  // Our message now, the driver's answer a moment later.
  say(ours, reply, delay = 1.3) {
    this.addLog('you', ours);
    if (reply) this.game.after(delay, () => this.active && this.addLog('driver', reply));
  }

  driver(msg) {
    this.addLog('driver', msg);
    navigator.vibrate?.(20);
  }

  addLog(who, text) {
    this.log.push({ who, text });
    this.log = this.log.slice(-5);
    if (!this.logEl) return;
    this.logEl.replaceChildren(
      ...this.log.map((m) => h('li', { class: m.who }, h('b', {}, m.who === 'you' ? 'You' : m.who === 'driver' ? this.driverName() : 'Pit wall'), ` ${m.text}`))
    );
    this.logEl.lastElementChild?.scrollIntoView?.({ block: 'nearest' });
  }

  setMode(id) {
    if (this.mode === id) return;
    this.mode = id;
    const m = MODES[id];
    this.say(m.say, m.reply);
    this.renderButtons();
  }

  box(compound) {
    const g = this.game;
    if (this.boxing || g.pitChallenge.active) {
      this.addLog('wall', 'The crew is busy. Try again in a moment.');
      return;
    }
    if (this.d.mode !== 'track') {
      this.addLog('wall', 'Wait until the car is back on track.');
      return;
    }
    const name = COMPOUNDS[compound].name.toLowerCase();
    this.boxing = compound;
    this.say(`Box, box. Box this lap for ${name}s.`, `Copy, box this lap, ${name}s.`);
    g.pitChallenge.start(this.team, {
      auto: true,
      natural: true,
      silent: true,
      keepCamera: true,
      compound,
      onDone: (r) => {
        this.stops++;
        this.wear = 0;
        this.compound = compound;
        this.boxing = null;
        this.warned = {};
        this.addLog('wall', `Stop ${r.time.toFixed(2)} s. ${name[0].toUpperCase() + name.slice(1)}s fitted.`);
        this.game.after(1.2, () => this.active && this.driver(r.time < 2.6 ? 'Great stop, guys!' : 'OK, back out.'));
        this.renderButtons();
        this.refresh();
      },
    });
    this.renderButtons();
  }

  // ---- Panel -------------------------------------------------------------------------------

  buildPanel() {
    const g = this.game;
    this.panel?.remove();
    const t = this.team.data;
    this.stats = {};
    const stat = (k, label) => h('div', { class: 'eng-stat' }, h('span', {}, label), (this.stats[k] = h('b', {}, '–')));
    this.wearBar = h('i');
    this.modeBtns = h('div', { class: 'eng-row', role: 'group', 'aria-label': 'Pace' });
    this.boxBtns = h('div', { class: 'eng-row', role: 'group', 'aria-label': 'Box for tyres' });
    this.logEl = h('ul', { class: 'eng-log', 'aria-live': 'polite' });
    this.followBtn = h('button', { 'aria-pressed': 'true', onclick: () => this.setFollow(!this.follow) }, '👀 Follow car');
    this.panel = h(
      'section',
      { class: 'eng-panel panel', role: 'region', 'aria-label': 'Pit wall radio' },
      h('div', { class: 'kicker' }, `Race engineer · ${t.name}`),
      h('h2', {}, `Car #${this.car.number} · ${this.car.driver?.data.name || ''}`),
      h('div', { class: 'eng-stats' }, stat('lap', 'Laps'), stat('last', 'Last'), stat('best', 'Best'), stat('tyre', 'Tyres'), stat('pace', 'Pace'), stat('weather', 'Track')),
      h('div', { class: 'eng-wear', 'aria-hidden': 'true' }, this.wearBar),
      h('h3', {}, 'Radio'),
      this.logEl,
      h('h3', {}, 'Pace'),
      this.modeBtns,
      h('h3', {}, 'Box this lap for'),
      this.boxBtns,
      h('div', { class: 'eng-row' }, this.followBtn, h('button', { class: 'primary', onclick: () => this.stop() }, 'Leave pit wall'))
    );
    g.ui.root.append(this.panel);
    this.renderButtons();
    this.addLog('wall', 'You are on the pit wall. Call the pace and the stops.');
    this.refresh();
  }

  renderButtons() {
    this.modeBtns.replaceChildren(
      ...Object.entries(MODES).map(([id, m]) => h('button', { 'aria-pressed': String(this.mode === id), onclick: () => this.setMode(id) }, m.label))
    );
    this.boxBtns.replaceChildren(
      ...BOX_TYRES.map((c) =>
        h(
          'button',
          { class: 'eng-tyre', disabled: this.boxing ? true : null, style: { '--band': COMPOUNDS[c].hex }, onclick: () => this.box(c), 'aria-label': `Box for ${COMPOUNDS[c].name} tyres` },
          h('span', { class: 'band', 'aria-hidden': 'true' }),
          COMPOUNDS[c].name
        )
      )
    );
  }

  refresh() {
    const s = this.stats;
    s.lap.textContent = String(this.laps);
    s.last.textContent = fmt(this.last);
    s.best.textContent = fmt(this.best);
    s.tyre.textContent = `${COMPOUNDS[this.compound]?.name || this.compound} · ${Math.round((1 - this.wear) * 100)}%`;
    s.pace.textContent = this.boxing ? 'Boxing' : this.d.mode === 'track' ? MODES[this.mode].label : 'Pit lane';
    s.weather.textContent = this.game.rain ? 'Wet' : 'Dry';
    this.wearBar.style.width = `${Math.round((1 - this.wear) * 100)}%`;
    this.wearBar.style.background = this.wear > 0.75 ? '#e03a3a' : this.wear > 0.5 ? '#F5C518' : '#35b04a';
  }

  // ---- Look (first person on the deck) -----------------------------------------------------

  setFollow(on) {
    this.follow = on;
    this.followBtn.setAttribute('aria-pressed', String(on));
  }

  bindLook() {
    const el = this.game.renderer.domElement;
    let last = null;
    const down = (e) => {
      last = { x: e.clientX, y: e.clientY };
      this.setFollow(false);
    };
    const move = (e) => {
      if (!last) return;
      this.yaw = THREE.MathUtils.clamp(this.yaw - (e.clientX - last.x) * 0.005, -1.4, 1.4);
      this.pitch = THREE.MathUtils.clamp(this.pitch - (e.clientY - last.y) * 0.004, -0.7, 0.5);
      last = { x: e.clientX, y: e.clientY };
    };
    const up = () => (last = null);
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    const key = (e) => {
      if (e.key === 'Escape') this.stop();
    };
    window.addEventListener('keydown', key);
    this.unbindLook = () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key);
    };
  }

  updateCamera(dt) {
    const g = this.game;
    const eye = this.eng.root.position.clone();
    eye.y += 1.7 * this.eng.root.scale.y; // seated eye height, looking over the monitors
    eye.z += 0.25;
    if (this.follow) {
      const to = this.car.root.position.clone().sub(eye);
      // Yaw measured from facing the track (+z); keep it within a head turn.
      let want = Math.atan2(to.x, to.z);
      want = THREE.MathUtils.clamp(want, -0.8, 0.8); // a head turn, not over the shoulder
      let dy = want - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * Math.min(1, dt * 2.5);
      const flat = Math.hypot(to.x, to.z);
      const wantP = THREE.MathUtils.clamp(Math.atan2(to.y + 0.5, flat), -0.5, 0.3);
      this.pitch += (wantP - this.pitch) * Math.min(1, dt * 2);
    }
    const dir = V(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    g.camera.position.copy(eye);
    g.camera.up.set(0, 1, 0);
    g.camera.lookAt(eye.clone().add(dir));
  }

  // ---- Simulation ------------------------------------------------------------------------------

  update(dt) {
    if (!this.active) return;
    const g = this.game;
    this.time += dt;
    const d = this.d;
    const len = d.track.length;
    const rain = g.rain;
    const inter = this.compound === 'intermediate';
    if (d.mode === 'track') {
      let ds = d.s - this.lastS;
      if (ds < -len / 2) ds += len;
      if (ds > 0 && ds < len / 2) {
        const tyre = TYRE[this.compound] || TYRE.medium;
        const dryInter = inter && !rain ? 2 : 1;
        this.wear = Math.min(1, this.wear + (ds / len) * tyre.wear * MODES[this.mode].wear * dryInter);
      }
      // Pace: the call, the tyres' age and whether they suit the weather.
      const tyre = TYRE[this.compound] || TYRE.medium;
      const worn = 1 - 0.3 * Math.max(0, this.wear - 0.55) / 0.45;
      const weather = rain ? (inter ? 0.95 : 0.8) : inter ? 0.93 : 1;
      d.pace = MODES[this.mode].pace * tyre.pace * worn * weather;
    }
    this.lastS = d.s;
    if (d.lastLap !== this.lastLapSeen && d.lastLap != null) {
      this.lastLapSeen = d.lastLap;
      this.laps++;
      this.last = d.lastLap;
      const pb = this.best == null || d.lastLap < this.best;
      if (pb) this.best = d.lastLap;
      this.addLog('wall', `Lap ${this.laps}: ${d.lastLap.toFixed(2)}${pb ? ' · personal best' : ''}`);
    }
    // The driver speaks up.
    if (this.wear > 0.75 && !this.warned.wear && !this.boxing) {
      this.warned.wear = true;
      this.driver('The tyres are gone! Box me, box me.');
    }
    if (rain && !inter && !this.warned.rain && !this.boxing) {
      this.warned.rain = true;
      this.driver('It’s raining here, I have no grip! Inters?');
    }
    if (!rain && inter && !this.warned.dry && !this.boxing && this.time > 3) {
      this.warned.dry = true;
      this.driver('Track is drying. These inters are overheating.');
    }
    if (!rain) this.warned.rain = false;
    if (rain) this.warned.dry = false;
    // Weather and traffic.
    if (this.time > this.nextEvent) {
      this.nextEvent = this.time + 35 + Math.random() * 30;
      const r = Math.random();
      if (!rain && r < 0.35) {
        g.setRain(true);
        document.getElementById('btn-rain')?.setAttribute('aria-pressed', 'true');
        this.addLog('wall', 'Weather: rain arriving now.');
      } else if (rain && r < 0.6) {
        g.setRain(false);
        document.getElementById('btn-rain')?.setAttribute('aria-pressed', 'false');
        this.addLog('wall', 'Weather: rain has stopped, track drying.');
      } else {
        const gap = (0.5 + Math.random() * 1.5).toFixed(1);
        this.driver(Math.random() < 0.5 ? `Car behind is close, ${gap} seconds. Can I push?` : `Gap to the car ahead?`);
        if (!this.warned.gapReply) {
          this.warned.gapReply = true;
          this.game.after(2, () => this.active && this.addLog('wall', 'Tip: answer with a pace call.'));
        }
      }
    }
    if (Math.floor(this.time * 4) !== Math.floor((this.time - dt) * 4)) this.refresh();
    this.updateCamera(dt);
  }
}
