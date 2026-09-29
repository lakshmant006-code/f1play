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
import { wheelgun, loadRecipe, DEFAULT_RECIPE } from '../character/blocky.js';

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

  // opts: { mechanic } you are the front-left gunner, in first person (the
  // crew does the other three corners); { auto } the crew does all four;
  // { natural } the car comes in on its own lap instead of a quick fade;
  // { silent } no HUD; { compound } tires to fit; { keepCamera };
  // { onDone(result) } after the stop; { onExit() } when the player leaves.
  start(team, opts = {}) {
    const g = this.game;
    if (this.active) return;
    const car = team.trackCar;
    if (!car?.drive) return;
    this.active = true;
    this.aborted = false;
    this.team = team;
    this.car = car;
    this.opts = opts;
    this.mine = opts.mechanic ? 'FL' : null;
    this.run = new PitStopRun(CORNERS, PIT, { anyOrder: true, manual: this.mine ? [this.mine] : [] });
    this.aiTaps = {};
    if (opts.auto || this.mine) for (const c of CORNERS) if (c !== this.mine) this.aiTaps[c] = 0.08 + Math.random() * 0.28;
    this.lockUntil = 0;
    this.t = 0;
    this.phase = 'inlap';
    this.nextCompound = opts.compound || g.nextCompound[team.data.id] || 'soft';
    this.stations = pitStations(team);
    this.cornerState = Object.fromEntries(CORNERS.map((c) => [c, 'ready']));
    this.jackState = 'ready';

    // Crew run out to their stations.
    team.jackF.visible = team.jackR.visible = team.releaseBox.visible = true;
    team.releaseBox.userData.setGreen(false);
    for (const [key, st] of Object.entries(this.stations)) {
      team.crew[key].walkTo(st.pos, st.heading, { clip: st.clip, run: !this.mine || key !== `gun_${this.mine}` });
    }

    const d = car.drive;
    if (opts.natural) {
      // The car boxes at the end of its lap.
      d.requestPit(team.gx, () => this.onBoxed());
    } else {
      // Skip the in-lap: behind a quick fade the car is put in the pit lane a
      // short run before its box, already at the pit limiter.
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
    }
    if (this.mine) this.enterFirstPerson();
    else if (!opts.keepCamera) g.focusBox(team);
    if (!opts.silent) {
      const msg = this.mine ? 'Box, box! You are on the front-left wheel gun: gun off, then tighten when the new tire is on.' : 'Box, box! Tap all four wheels as fast as you can.';
      g.ui.toast(`<b>${team.data.name}:</b> ${msg}`, { icon: '🎧', accent: team.data.primary, duration: 3200 });
    }
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

  // ---- First person (mechanic) -------------------------------------------------------

  enterFirstPerson() {
    const g = this.game;
    this.fp = true;
    g.rig.frozen = true;
    g.rig.controls.enabled = false;
    g.rig.stopAutoRotate?.();
    g.post.setTilt(0);
    g.camera.fov = 68;
    g.camera.near = 0.05;
    g.camera.updateProjectionMatrix();
    g.ui.hideCard();
    g.interactions.enabled = false;
    document.body.classList.add('walking', 'pit-fp');
    // Our own body stays out of view; our hands and the wheel gun are.
    const me = this.team.crew[`gun_${this.mine}`];
    me.root.visible = false;
    if (!this.hands) this.hands = buildGunHands(this.opts.recipe);
    if (!g.camera.parent) g.scene.add(g.camera);
    g.camera.add(this.hands);
    this.fpLook = null;
  }

  exitFirstPerson() {
    if (!this.fp) return;
    const g = this.game;
    this.fp = false;
    this.hands?.removeFromParent();
    this.hands = null;
    const me = this.team.crew[`gun_${this.mine}`];
    me.root.visible = true;
    document.body.classList.remove('walking', 'pit-fp');
    g.post.setTilt(1);
    g.camera.fov = 32;
    g.camera.near = 0.5;
    g.camera.updateProjectionMatrix();
    g.rig.controls.enabled = true;
    g.rig.frozen = false;
    g.interactions.enabled = true;
    g.focusBox(this.team);
    this.opts.onExit?.();
  }

  // Kneeling at the front-left station, looking at the wheel nut.
  updateFirstPerson(dt) {
    const g = this.game;
    const st = this.stations[`gun_${this.mine}`];
    const car = this.car;
    const wheel = car.wheels[this.mine].getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(Math.sin(st.heading), 0, Math.cos(st.heading));
    // A step back and to the outside, so the tire changer beside us stays out of the way.
    const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const eye = st.pos.clone().addScaledVector(fwd, -0.95).addScaledVector(side, -0.5);
    const boxed = this.phase === 'running' || this.phase === 'released';
    eye.y = boxed ? 1.15 : 1.6; // stand while the car comes in, crouch for the stop
    const t = performance.now() / 1000;
    eye.y += Math.sin(t * 1.7) * 0.006;
    const look = boxed ? wheel.clone().setY(wheel.y + 0.05) : car.root.position.clone().setY(0.6);
    this.fpLook = this.fpLook ? this.fpLook.lerp(look, Math.min(1, dt * 6)) : look;
    this.fpEye = this.fpEye ? this.fpEye.lerp(eye, Math.min(1, dt * 5)) : eye;
    g.camera.position.copy(this.fpEye);
    g.camera.up.set(0, 1, 0);
    g.camera.lookAt(this.fpLook);
    // The gun kicks when it fires.
    if (this.hands) {
      this.kick = Math.max(0, (this.kick || 0) - dt * 6);
      this.hands.position.set(0.34, -0.24 + this.kick * 0.03, -0.55 + this.kick * 0.05);
    }
  }

  // Fixed pad at the bottom: a timer, and four wheel buttons laid out like the
  // car seen from above (front at the top). Keyboard: Space taps the next wheel.
  // As the mechanic: one big wheel gun button instead.
  buildHud() {
    const g = this.game;
    const hud = g.ui.hud;
    this.timeEl = h('div', { class: 'time', 'aria-live': 'off' }, '0.00');
    this.metaEl = h('div', { class: 'meta' }, 'Car coming in…');
    this.wheelBtns = {};
    let pad;
    if (this.mine) {
      this.gunBtn = h('button', { class: 'pit-gun', disabled: true, 'aria-label': 'Wheel gun' }, 'GUN OFF');
      this.gunBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.gunPress();
      });
      this.gunBtn.addEventListener('click', (e) => {
        if (e.detail === 0) this.gunPress();
      });
      pad = this.gunBtn;
    } else {
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
      pad = h('div', { class: 'pit-pad', role: 'group', 'aria-label': 'Wheels, front at the top' }, wheel('FL'), h('div', { class: 'pit-car', 'aria-hidden': 'true' }), wheel('FR'), wheel('RL'), h('div', { class: 'pit-car rear', 'aria-hidden': 'true' }), wheel('RR'));
    }
    hud.replaceChildren(h('div', { class: 'pit-body' }, this.timeEl, this.metaEl), pad, h('button', { class: 'pit-quit', onclick: () => this.abort(), 'aria-label': 'Quit the pit stop' }, '✕'));
    hud.classList.add('pit');
    hud.classList.remove('result');
    hud.hidden = !!this.opts.silent;
    g.ui.markers.replaceChildren();
    this.markers = {};
    if (!this.keyHandler) {
      this.keyHandler = (e) => {
        if (!this.active || this.opts.silent || e.repeat || (e.key !== ' ' && e.key !== 'Enter')) return;
        if (e.target?.closest?.('.pit-quit')) return;
        e.preventDefault();
        if (this.mine) {
          this.gunPress();
          return;
        }
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
    if (this.gunBtn) {
      const c = this.mine;
      const started = this.run.cornerStart[c] !== undefined;
      const tightened = this.run.tightenAt[c] !== undefined;
      const fitted = started && this.t >= this.run.fittedAt(c);
      this.gunBtn.disabled = this.phase !== 'running' || tightened;
      this.gunBtn.textContent = !started ? 'GUN OFF' : tightened ? 'DONE ✓' : fitted ? 'TIGHTEN!' : 'WAIT…';
      this.gunBtn.classList.toggle('ready', this.phase === 'running' && (!started || (fitted && !tightened)));
      this.gunBtn.classList.toggle('done', tightened);
    }
  }

  onBoxed() {
    this.phase = 'running';
    this.t = 0;
    if (!this.opts.silent) {
      this.metaEl.textContent = this.mine ? 'GO! Gun off!' : `GO! Tap all four · target ${PIT.target.toFixed(1)} s`;
      const hud = this.game.ui.hud;
      hud.classList.add('go');
      setTimeout(() => hud.classList.remove('go'), 450);
      navigator.vibrate?.(30);
    }
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

  // The mechanic's one button: first press loosens the nut, the second
  // tightens it once the new tire is on. Too early costs a fumble.
  gunPress() {
    if (!this.active || this.phase !== 'running' || this.t < this.lockUntil) return;
    const c = this.mine;
    this.kick = 1;
    if (this.run.cornerStart[c] === undefined) {
      this.run.tap(c, this.t);
      navigator.vibrate?.(15);
      this.metaEl.textContent = 'Nut off! Tire coming off…';
      this.game.audio?.thud?.();
    } else {
      const r = this.run.tighten(c, this.t);
      if (r === 'early') {
        this.run.fumbles++;
        this.lockUntil = this.t + PIT.wrongTapPenalty;
        this.metaEl.textContent = 'Too early! Wait for the new tire.';
        this.gunBtn.classList.remove('wrong');
        void this.gunBtn.offsetWidth;
        this.gunBtn.classList.add('wrong');
        navigator.vibrate?.([20, 40, 20]);
      } else if (r === 'ok') {
        navigator.vibrate?.(15);
        this.metaEl.textContent = 'Tight! Jacks down…';
      }
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
      this.exitFirstPerson();
      return;
    }
    if (this.mine && this.run.tightenAt[this.mine] === undefined) {
      if (this.run.cornerStart[this.mine] === undefined) this.run.tap(this.mine, this.t);
      this.run.tightenAt[this.mine] = Math.max(this.t, this.run.fittedAt(this.mine));
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
    if (this.fp) this.updateFirstPerson(dt);
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
      // Crew hands on the other corners.
      for (const [c, at] of Object.entries(this.aiTaps)) if (t >= at && run.cornerStart[c] === undefined) run.tap(c, t);
      if (this.mine) this.refreshOrder();
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
    this.cleanup({ keepHud: !aborted && !this.opts.silent && !this.opts.auto });
    if (aborted) {
      this.exitFirstPerson();
      return;
    }

    const result = { time, fumbles: this.run.fumbles, team: team.data.id, teamName: team.data.name, number: car.number, date: new Date().toISOString(), compound: this.nextCompound, role: this.mine ? 'mechanic' : this.opts.auto ? 'crew' : 'player' };
    this.lastResult = result;
    this.opts.onDone?.(result);
    if (this.opts.silent || this.opts.auto) return;
    const best = loadBest();
    const isBest = !best || time < best.time;
    if (isBest) saveBest(result);
    g.onPitResult?.(result);
    this.showResult(result, isBest ? null : best);
  }

  // Result right in the HUD: time, grade, best, and a one-tap Go again.
  showResult(result, best) {
    const g = this.game;
    const hud = g.ui.hud;
    const gr = grade(result.time);
    const delta = result.time - PIT.target;
    const done = () => {
      hud.hidden = true;
      hud.classList.remove('pit', 'result');
      if (this.fp) this.exitFirstPerson();
      else g.goHome();
    };
    hud.classList.add('pit', 'result');
    hud.replaceChildren(
      h(
        'div',
        { class: 'pit-body' },
        h('div', { class: 'time' }, `${result.time.toFixed(2)}s`),
        h('div', { class: 'meta' }, h('b', {}, gr.label), ` · ${delta < 0 ? '' : '+'}${delta.toFixed(2)} s vs ${PIT.target.toFixed(1)} s${result.fumbles ? ` · ${result.fumbles} fumble${result.fumbles > 1 ? 's' : ''}` : ''}`, h('br'), best ? `Best ${best.time.toFixed(2)} s` : '★ New personal best!')
      ),
      h(
        'div',
        { class: 'pit-actions' },
        h('button', { class: 'primary', onclick: () => this.start(this.team, { ...this.opts }) }, '↻ Go again'),
        h('button', { onclick: () => this.shareCard(result) }, 'Share'),
        h('button', { onclick: done }, 'Done')
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

// First-person hands for the mechanic: the player's gloves on a wheel gun.
function buildGunHands(recipe) {
  const r = { ...DEFAULT_RECIPE, ...(loadRecipe()?.recipe || {}), ...(recipe || {}) };
  const g = new THREE.Group();
  const gun = wheelgun(r);
  gun.scale.setScalar(0.62);
  gun.rotation.set(-0.15, Math.PI + 0.25, 0);
  g.add(gun);
  const glove = new THREE.MeshStandardMaterial({ color: r.gloves === 'bare' ? r.skin : r.gloves === 'starInverse' ? r.primary : '#1c1d20', roughness: 0.6 });
  const sleeve = new THREE.MeshStandardMaterial({ color: r.primary, roughness: 0.6 });
  for (const [x, y, z] of [[0.02, -0.12, 0.12], [-0.14, 0.02, 0.02]]) {
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.1, 0.12), glove);
    hand.position.set(x, y, z);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.35), sleeve);
    arm.position.set(x + 0.02, y - 0.03, z + 0.24);
    g.add(hand, arm);
  }
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.renderOrder = 10;
    }
  });
  g.scale.setScalar(0.75);
  g.position.set(0.34, -0.24, -0.55);
  return g;
}
