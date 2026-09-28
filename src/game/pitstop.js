// Pit stop challenge: the team's car boxes, the player taps each corner in the
// shown order, crew play their beats, jacks drop and the release light goes
// green. Beat 2.4 s.

import * as THREE from 'three';
import { PitStopRun, shuffledOrder, grade } from './pitstopRules.js';
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
    if (!car?.drive || car.drive.mode !== 'track') {
      g.ui.toast('The car is not on track right now. Try again in a moment.', { icon: '⏳' });
      return;
    }
    this.active = true;
    this.team = team;
    this.car = car;
    this.run = new PitStopRun(shuffledOrder());
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

    car.drive.pace = 1.45;
    car.drive.requestPit(team.gx, () => this.onBoxed());
    g.focusBox(team);
    g.ui.toast(`<b>${team.data.name}:</b> Box, box. Car #${car.number} is on its in-lap on ${COMPOUNDS[this.nextCompound].name.toLowerCase()}s next.`, { icon: '🎧', accent: team.data.primary, duration: 4200 });
    this.buildHud();
  }

  buildHud() {
    const g = this.game;
    const hud = g.ui.hud;
    this.timeEl = h('div', { class: 'time', 'aria-live': 'off' }, '0.00');
    this.orderEl = h('div', { class: 'order', 'aria-label': 'Corner order' }, this.run.order.map((c, i) => h('span', { 'data-c': c }, `${i + 1}·${c}`)));
    this.metaEl = h('div', { class: 'meta' }, 'Car on its in-lap…');
    hud.replaceChildren(this.timeEl, h('div', {}, this.orderEl, this.metaEl), h('button', { onclick: () => this.abort(), 'aria-label': 'Quit the pit stop challenge' }, 'Quit'));
    hud.hidden = false;
    // Corner markers follow the wheels on screen.
    g.ui.markers.replaceChildren();
    this.markers = {};
    this.run.order.forEach((c, i) => {
      const b = h('button', { class: 'marker', 'aria-label': `${CORNER_NAME[c]} wheel, tap ${i + 1} of 4`, onclick: () => this.tap(c) }, String(i + 1), h('small', {}, c));
      b.hidden = true;
      g.ui.markers.append(b);
      this.markers[c] = b;
    });
    this.refreshOrder();
  }

  refreshOrder() {
    const next = this.run.expected;
    for (const span of this.orderEl.children) {
      const c = span.dataset.c;
      span.className = this.run.cornerStart[c] !== undefined ? 'done' : c === next ? 'next' : '';
    }
    for (const [c, b] of Object.entries(this.markers)) {
      b.classList.toggle('done', this.run.cornerStart[c] !== undefined);
      b.classList.toggle('next', c === next && this.phase === 'running');
    }
  }

  onBoxed() {
    this.phase = 'running';
    this.t = 0;
    this.metaEl.textContent = `Tap the corners in order. Target ${PIT.target.toFixed(1)} s`;
    this.refreshOrder();
    this.markers[this.run.expected]?.focus({ preventScroll: true });
  }

  tap(corner) {
    if (!this.active) return;
    if (this.phase !== 'running') {
      this.game.ui.toast('Wait for the car to stop on its marks!', { icon: '✋', duration: 1500 });
      return;
    }
    const r = this.run.tap(corner, this.t);
    const b = this.markers[corner];
    if (r === 'wrong') {
      b.classList.remove('wrong');
      void b.offsetWidth;
      b.classList.add('wrong');
      this.metaEl.textContent = `Wrong corner! Next is ${CORNER_NAME[this.run.expected]} (+${PIT.wrongTapPenalty}s fumble)`;
    } else if (r === 'ok') {
      this.metaEl.textContent = this.run.allTapped ? 'Guns on… jacks down…' : `Next: ${CORNER_NAME[this.run.expected]}`;
      const nb = this.markers[this.run.expected];
      nb?.focus({ preventScroll: true });
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
      this.car.drive.pitRequest = null;
      this.car.drive.pace = 1;
      this.finishCrew();
      this.cleanup();
    }
    this.aborted = true;
  }

  cleanup() {
    this.active = false;
    this.phase = 'idle';
    this.game.ui.hud.hidden = true;
    this.game.ui.markers.replaceChildren();
    this.markers = {};
  }

  finishCrew() {
    const team = this.team;
    this.game.after(0.9, () => {
      for (const a of team.pitCrew) a.goHome({ clip: 'idle_loop' });
      this.game.after(2.5, () => {
        if (!this.active) team.jackF.visible = team.jackR.visible = team.releaseBox.visible = false;
      });
    });
  }

  update(dt) {
    if (!this.active) return;
    const g = this.game;
    const car = this.car;
    const team = this.team;

    // Place markers over the wheels.
    const v = new THREE.Vector3();
    const showMarkers = this.phase === 'running' || (this.phase === 'inlap' && car.drive.mode === 'pit');
    for (const [c, b] of Object.entries(this.markers)) {
      const done = this.run.cornerStart[c] !== undefined;
      b.hidden = !showMarkers || (done && this.phase !== 'running');
      if (b.hidden) continue;
      car.wheels[c].getWorldPosition(v);
      v.y += 0.9;
      const s = g.toScreen(v);
      b.style.transform = `translate(${s.x}px, ${s.y}px)`;
    }

    if (this.phase === 'inlap') {
      const d = car.drive;
      if (d.mode === 'track') {
        const toEntry = (d.pit.sIn - d.s + d.track.length) % d.track.length;
        this.metaEl.textContent = `In-lap: ${Math.ceil(toEntry / Math.max(d.v, 1))} s to pit entry`;
      } else if (d.mode === 'pit') {
        this.metaEl.textContent = 'Pit lane: get ready…';
      }
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
    this.cleanup();
    if (aborted) return;

    const best = loadBest();
    const isBest = !best || time < best.time;
    const result = { time, fumbles: this.run.fumbles, team: team.data.id, teamName: team.data.name, number: car.number, date: new Date().toISOString(), compound: this.nextCompound };
    if (isBest) saveBest(result);
    this.lastResult = result;
    g.onPitResult?.(result);
    setTimeout(() => this.showResult(result, isBest ? null : best), 700);
  }

  showResult(result, best) {
    const g = this.game;
    const gr = grade(result.time);
    const delta = result.time - PIT.target;
    const content = h(
      'div',
      {},
      h('div', { class: 'kicker' }, `${result.teamName} · Car #${result.number}`),
      h('h2', {}, gr.label),
      h('div', { class: 'big' }, `${result.time.toFixed(2)} s`),
      h('p', {}, `${delta < 0 ? '' : '+'}${delta.toFixed(2)} s against the ${PIT.target.toFixed(1)} s target${result.fumbles ? ` · ${result.fumbles} fumble${result.fumbles > 1 ? 's' : ''}` : ''}.`),
      h('p', {}, best ? `Your best: ${best.time.toFixed(2)} s` : 'New personal best!'),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'primary', onclick: () => { g.ui.closeModal(); this.start(this.team); } }, 'Run it again'),
        h('button', { onclick: () => this.shareCard(result) }, 'Share card'),
        h('button', { onclick: () => { g.ui.closeModal(); g.goHome(); } }, 'Back to island')
      )
    );
    g.ui.openModal(content);
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
