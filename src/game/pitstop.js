// Pit stop challenge, kept simple: the team's car rolls straight into its box
// (no waiting for an in-lap), the player taps the four wheels on a fixed pad in
// any order (or presses Space), crew play their beats, jacks drop and the
// release light goes green. Beat 2.4 s. The result shows in the HUD with a
// one-tap "Go again", no pop-up.

import * as THREE from 'three';
import { PitStopRun, grade } from './pitstopRules.js';
import { pitStations } from './paddock.js';
import { PIT, CORNERS, COMPOUNDS } from '../data.js';
import { h } from '../ui/ui.js';

const CORNER_NAME = { FL: 'Front left', FR: 'Front right', RL: 'Rear left', RR: 'Rear right' };
const BEST_KEY = 'skycircuit.bestPitStop';

export function loadBest() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) || 'null');
  } catch {
    return null;
  }
}
function saveBest(v) {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

export class PitChallenge {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.phase = 'idle';
    this.markers = {};
    this.lastResult = null;
  }

  start(team) {
    const g = this.game;
    if (this.active) return;
    const car = team.trackCar;
    if (!car?.drive) return;
    this.active = true;
    this.aborted = false;
    this.team = team;
    this.car = car;
    this.run = new PitStopRun(CORNERS, PIT, { anyOrder: true });
    this.t = 0;
    this.phase = 'inlap';
    this.nextCompound = g.nextCompound[team.data.id] || 'soft';
    this.stations = pitStations(team);
    this.cornerState = Object.fromEntries(CORNERS.map((c) => [c, 'ready']));
    this.jackState = 'ready';

    // Crew run out to their stations.
    team.jackF.visible = team.jackR.visible = team.releaseBox.visible = true;
    team.releaseBox.userData.setGreen(false);
    for (const [key, st] of Object.entries(this.stations)) {
      team.crew[key].walkTo(st.pos, st.heading, { clip: st.clip, run: true });
    }

    // Skip the in-lap: behind a quick fade the car is put in the pit lane a
    // short run before its box, already at the pit limiter.
    const d = car.drive;
    this.fade(() => {
      for (const c of CORNERS) car.wheels[c].position.set(0, 0, 0);
      car.lift(0);
      d.requestPit(team.gx, () => this.onBoxed());
      d.mode = 'pit';
      d.pace = 1;
      d.s = Math.max(0, d.boxS - 26);
      d.v = 11;
      d.place();
    });
    g.focusBox(team);
    g.ui.toast(`<b>${team.data.name}:</b> Box, box! Tap all four wheels as fast as you can.`, { icon: '🎧', accent: team.data.primary, duration: 2600 });
    this.buildHud();
  }

  // Quick fade to white and back (post grade pass), running `mid` at the
  // peak. Stepped from update() so it follows game time.
  fade(mid) {
    this.fading = { t: 0, mid, done: false };
  }

  stepFade(dt) {
    const f = this.fading;
    if (!f) return;
    f.t += Math.min(dt, 1 / 30);
    const u = this.game.post?.grade?.uniforms?.fade;
    if (u) u.value = f.t < 0.18 ? f.t / 0.18 : Math.max(0, 1 - (f.t - 0.18) / 0.3);
    if (f.t >= 0.18 && !f.done) {
      f.done = true;
      f.mid();
    }
    if (f.t >= 0.48) {
      if (u) u.value = 0;
      this.fading = null;
    }
  }

  // Fixed pad at the bottom: a timer, and four wheel buttons laid out like the
  // car seen from above (front at the top). Keyboard: Space taps the next wheel.
  buildHud() {
    const g = this.game;
    const hud = g.ui.hud;
    this.timeEl = h('div', { class: 'time', 'aria-live': 'off' }, '0.00');
    this.metaEl = h('div', { class: 'meta' }, 'Car coming in…');
    this.wheelBtns = {};
    const wheel = (c) => {
      const b = h('button', { class: 'pit-wheel', 'aria-label': `${CORNER_NAME[c]} wheel`, disabled: true }, c);
      // Pointer down for instant response on touch; click covers keyboard activation.
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.tap(c);
      });
      b.addEventListener('click', (e) => {
        if (e.detail === 0) this.tap(c);
      });
      this.wheelBtns[c] = b;
      return b;
    };
    const pad = h('div', { class: 'pit-pad', role: 'group', 'aria-label': 'Wheels, front at the top' }, wheel('FL'), h('div', { class: 'pit-car', 'aria-hidden': 'true' }), wheel('FR'), wheel('RL'), h('div', { class: 'pit-car rear', 'aria-hidden': 'true' }), wheel('RR'));
    hud.replaceChildren(h('div', { class: 'pit-body' }, this.timeEl, this.metaEl), pad, h('button', { class: 'pit-quit', onclick: () => this.abort(), 'aria-label': 'Quit the pit stop challenge' }, '✕'));
    hud.classList.add('pit');
    hud.classList.remove('result');
    hud.hidden = false;
    g.ui.markers.replaceChildren();
    this.markers = {};
    if (!this.keyHandler) {
      this.keyHandler = (e) => {
        if (!this.active || e.repeat || (e.key !== ' ' && e.key !== 'Enter')) return;
        if (e.target?.closest?.('.pit-quit')) return;
        e.preventDefault();
        const next = CORNERS.find((c) => this.run.cornerStart[c] === undefined);
        if (next) this.tap(next);
      };
      window.addEventListener('keydown', this.keyHandler);
    }
  }

  refreshOrder() {
    for (const c of CORNERS) {
      const b = this.wheelBtns?.[c];
      if (!b) continue;
      b.disabled = this.phase !== 'running' || this.run.cornerStart[c] !== undefined;
      b.classList.toggle('done', this.run.cornerStart[c] !== undefined);
    }
  }

  onBoxed() {
    this.phase = 'running';
    this.t = 0;
    this.metaEl.textContent = `GO! Tap all four · target ${PIT.target.toFixed(1)} s`;
    const hud = this.game.ui.hud;
    hud.classList.add('go');
    setTimeout(() => hud.classList.remove('go'), 450);
    this.refreshOrder();
  }

  tap(corner) {
    if (!this.active || this.phase !== 'running') return;
    if (this.run.tap(corner, this.t) === 'ok') {
      navigator.vibrate?.(10);
      const left = CORNERS.filter((c) => this.run.cornerStart[c] === undefined).length;
      this.metaEl.textContent = left ? `${left} to go` : 'Guns on… jacks down…';
    }
    this.refreshOrder();
  }

  abort() {
    if (!this.active) return;
    if (this.phase === 'running' && !this.run.allTapped) {
      // Finish the stop automatically so the car is never stranded.
      for (const c of this.run.order) if (this.run.cornerStart[c] === undefined) this.run.tap(c, this.t);
    }
    if (this.phase === 'inlap') {
      // Let the car finish rolling in and leave straight away.
      const d = this.car.drive;
      if (d.pitRequest) d.pitRequest.onBoxed = () => d.release();
      this.finishCrew();
      this.cleanup();
      return;
    }
    this.aborted = true;
  }

  cleanup({ keepHud = false } = {}) {
    this.active = false;
    this.phase = 'idle';
    const hud = this.game.ui.hud;
    if (!keepHud) {
      hud.hidden = true;
      hud.classList.remove('pit', 'result');
    }
    this.game.ui.markers.replaceChildren();
    this.markers = {};
  }

  finishCrew() {
    const team = this.team;
    this.game.after(0.9, () => {
      if (this.active) return; // a new stop already sent them back out
      for (const a of team.pitCrew) a.goHome({ clip: 'idle_loop' });
      this.game.after(2.5, () => {
        if (!this.active) team.jackF.visible = team.jackR.visible = team.releaseBox.visible = false;
      });
    });
  }

  update(dt) {
    this.stepFade(dt);
    if (!this.active) return;
    const car = this.car;
    const team = this.team;

    if (this.phase === 'inlap') {
      if (car.drive.mode === 'pit') this.metaEl.textContent = 'Car coming in… get ready';
      return;
    }

    if (this.phase === 'running') {
      this.t += dt;
      const t = this.t;
      const run = this.run;
      this.timeEl.textContent = t.toFixed(2);
      car.lift(run.jackHeight(t));
      const lifted = run.jackHeight(t) > 0.02;
      team.jackF.userData.lever.rotation.x = lifted ? -0.12 : -0.55;
      team.jackR.userData.lever.rotation.x = lifted ? -0.12 : -0.55;
      team.jackF.position.y = team.jackR.position.y = run.jackHeight(t) * 0.5;
      if (this.jackState === 'ready' && t >= PIT.jackLift * 0.5) {
        this.jackState = 'up';
        team.crew.frontJack.anim.play('jack_lift', { hold: true });
        team.crew.rearJack.anim.play('jack_lift', { hold: true });
      }
      if (this.jackState === 'up' && run.cornersDone !== null && t >= run.cornersDone) {
        this.jackState = 'down';
        team.crew.frontJack.anim.play('jack_lower');
        team.crew.rearJack.anim.play('jack_lower');
      }

      for (const c of CORNERS) {
        const st = run.corner(c, t);
        const s = c[1] === 'L' ? 1 : -1;
        const wheel = car.wheels[c];
        wheel.position.x = s * st.out * 1.0;
        wheel.position.y = -st.out * 0.05;
        if (st.swapped && car.compounds[c] !== this.nextCompound) car.setCompound(c, this.nextCompound);
        // Crew beats.
        if (st.phase !== this.cornerState[c]) {
          this.cornerState[c] = st.phase;
          const gun = team.crew[`gun_${c}`];
          const tire = team.crew[`tire_${c}`];
          if (st.phase === 'gun_off') gun.anim.play('gun_off', { onDone: () => gun.anim.play('kneel_ready_loop') });
          if (st.phase === 'tire_pull') tire.anim.play('tire_pull', { hold: true });
          if (st.phase === 'tire_fit') tire.anim.play('tire_fit', { hold: true });
          if (st.phase === 'gun_on') {
            gun.anim.play('gun_on', { hold: true });
            tire.anim.play('idle_loop');
          }
          if (st.phase === 'hand_up') gun.anim.play('hand_up', { hold: true });
        }
        // The tire changer steps back with the wheel.
        const station = this.stations[`tire_${c}`];
        const tireActor = team.crew[`tire_${c}`];
        if (!tireActor.goal) {
          tireActor.root.position.copy(station.pos).add(new THREE.Vector3(0, 0, -s * st.out * 0.8));
        }
      }

      if (run.releaseTime !== null && t >= run.releaseTime) this.release();
    }
  }

  release() {
    const g = this.game;
    const team = this.team;
    const car = this.car;
    const time = this.run.releaseTime;
    this.phase = 'released';
    this.timeEl.textContent = time.toFixed(2);
    team.releaseBox.userData.setGreen(true);
    team.crew.release.anim.play('press_release');
    for (const c of CORNERS) {
      car.wheels[c].position.set(0, 0, 0);
    }
    car.lift(0);
    team.jackF.position.y = team.jackR.position.y = 0;
    car.drive.pace = 1;
    car.drive.release();
    this.finishCrew();
    const aborted = this.aborted;
    this.aborted = false;
    this.cleanup({ keepHud: !aborted });
    if (aborted) return;

    const best = loadBest();
    const isBest = !best || time < best.time;
    const result = { time, fumbles: this.run.fumbles, team: team.data.id, teamName: team.data.name, number: car.number, date: new Date().toISOString(), compound: this.nextCompound };
    if (isBest) saveBest(result);
    this.lastResult = result;
    g.onPitResult?.(result);
    this.showResult(result, isBest ? null : best);
  }

  // Result right in the HUD: time, grade, best, and a one-tap Go again.
  showResult(result, best) {
    const g = this.game;
    const hud = g.ui.hud;
    const gr = grade(result.time);
    const delta = result.time - PIT.target;
    hud.classList.add('pit', 'result');
    hud.replaceChildren(
      h(
        'div',
        { class: 'pit-body' },
        h('div', { class: 'time' }, `${result.time.toFixed(2)}s`),
        h('div', { class: 'meta' }, h('b', {}, gr.label), ` · ${delta < 0 ? '' : '+'}${delta.toFixed(2)} s vs ${PIT.target.toFixed(1)} s`, h('br'), best ? `Best ${best.time.toFixed(2)} s` : '★ New personal best!')
      ),
      h(
        'div',
        { class: 'pit-actions' },
        h('button', { class: 'primary', onclick: () => this.start(this.team) }, '↻ Go again'),
        h('button', { onclick: () => this.shareCard(result) }, 'Share'),
        h('button', { onclick: () => { hud.hidden = true; hud.classList.remove('pit', 'result'); g.goHome(); } }, 'Done')
      )
    );
    hud.hidden = false;
    hud.querySelector('button.primary')?.focus({ preventScroll: true });
  }

  async shareCard(result) {
    const canvas = drawShareCard(result, this.game.teams.find((t) => t.data.id === result.team).data);
    const url = canvas.toDataURL('image/png');
    const file = await new Promise((res) => canvas.toBlob((b) => res(b ? new File([b], 'sky-circuit-pit-stop.png', { type: 'image/png' }) : null)));
    const g = this.game;
    const img = h('img', { src: url, alt: `Pit stop share card: ${result.time.toFixed(2)} seconds` });
    const dl = h('a', { href: url, download: 'sky-circuit-pit-stop.png' }, h('button', { class: 'primary' }, 'Download PNG'));
    const actions = [dl];
    if (file && navigator.canShare?.({ files: [file] })) {
      actions.push(h('button', { onclick: () => navigator.share({ files: [file], title: 'Sky Circuit pit stop', text: `I just did a ${result.time.toFixed(2)} s pit stop in Sky Circuit!` }).catch(() => {}) }, 'Share…'));
    }
    actions.push(h('button', { onclick: () => g.ui.closeModal() }, 'Close'));
    g.ui.openModal(h('div', {}, h('h2', {}, 'Your pit stop card'), img, h('div', { class: 'row' }, actions)));
  }
}

export function drawShareCard(result, team) {
  const W = 1200;
  const H = 630;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const gr = grade(result.time);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, team.primary);
  bg.addColorStop(1, team.secondary);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // Rays from the corner.
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 0.5;
    ctx.beginPath();
    ctx.moveTo(W, H);
    ctx.lineTo(W - Math.cos(a) * 1600, H - Math.sin(a) * 1600);
    ctx.lineTo(W - Math.cos(a + 0.05) * 1600, H - Math.sin(a + 0.05) * 1600);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(14,27,43,0.82)';
  roundRect(ctx, 60, 60, W - 120, H - 120, 36);
  ctx.fill();
  if (gr.holo) {
    const holo = ctx.createLinearGradient(60, 60, W - 60, H - 60);
    ['#ff8ad8', '#8ae3ff', '#b6ff8a', '#fff38a', '#ff8ad8'].forEach((col, i) => holo.addColorStop(i / 4, col));
    ctx.strokeStyle = holo;
    ctx.lineWidth = 10;
    roundRect(ctx, 60, 60, W - 120, H - 120, 36);
    ctx.stroke();
  }
  ctx.fillStyle = '#F4F5F7';
  ctx.font = '900 34px Nunito, Arial, sans-serif';
  ctx.fillText('SKY CIRCUIT · PIT STOP CHALLENGE', 110, 140);
  ctx.font = '900 190px Nunito, Arial, sans-serif';
  ctx.fillStyle = team.primary === '#7A1F2B' ? '#EFE6D2' : team.primary;
  ctx.fillText(`${result.time.toFixed(2)}s`, 100, 340);
  ctx.fillStyle = '#F4F5F7';
  ctx.font = '800 40px Nunito, Arial, sans-serif';
  ctx.fillText(`${gr.label}${gr.holo ? ' ✦' : ''}  ·  target ${PIT.target.toFixed(1)} s`, 110, 410);
  ctx.font = '700 32px Nunito, Arial, sans-serif';
  ctx.fillStyle = 'rgba(244,245,247,0.8)';
  ctx.fillText(`${result.teamName}  ·  Car #${result.number}  ·  ${COMPOUNDS[result.compound]?.name || ''} tires`, 110, 480);
  ctx.fillText(new Date(result.date).toLocaleDateString(), 110, 525);
  return c;
}

function roundRect(ctx, x, y, w, hgt, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + hgt, r);
  ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
  ctx.arcTo(x, y + hgt, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
