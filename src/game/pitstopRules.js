// Pure rules for the pit stop challenge. Time 0 is the moment the car stops on
// its box marks. The player taps the four corners (in the shown order, or in
// any order with `anyOrder`); each tap starts that corner's gun-off / tire
// swap / gun-on sequence. Jacks drop once every corner is done and the release
// light goes green right after.

import { PIT, CORNERS } from '../data.js';

export function shuffledOrder(rand = Math.random) {
  const order = [...CORNERS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export class PitStopRun {
  constructor(order = CORNERS, rules = PIT, { anyOrder = false, manual = [] } = {}) {
    this.order = [...order];
    this.anyOrder = anyOrder;
    // Manual corners (a player's wheel gun) pause once the new tire is on
    // until tighten() is called, then finish the gun-on beat.
    this.manual = new Set(manual);
    this.tightenAt = {};
    this.rules = rules;
    this.next = 0;
    this.lockedUntil = 0;
    this.fumbles = 0;
    this.cornerStart = {};
  }

  get allTapped() {
    return this.next >= this.order.length;
  }

  get expected() {
    return this.order[this.next] ?? null;
  }

  // Returns 'ok', 'wrong', 'locked', 'early', 'repeat' or 'done'.
  tap(corner, t) {
    if (this.allTapped) return 'done';
    if (t < 0) return 'early';
    if (this.anyOrder) {
      if (this.cornerStart[corner] !== undefined) return 'repeat';
      // Move this corner up to the next slot so `order` records the tap order.
      const i = this.order.indexOf(corner);
      [this.order[this.next], this.order[i]] = [this.order[i], this.order[this.next]];
    }
    if (t < this.lockedUntil) return 'locked';
    if (corner !== this.expected) {
      this.fumbles++;
      this.lockedUntil = t + this.rules.wrongTapPenalty;
      return 'wrong';
    }
    this.cornerStart[corner] = t;
    this.next++;
    return 'ok';
  }

  // When a manual corner's new tire is on and waiting for the gun.
  fittedAt(corner) {
    const start = this.cornerStart[corner];
    return start === undefined ? null : start + FIT * this.rules.cornerDuration;
  }

  // Tighten a manual corner's wheel. Returns 'ok', 'early' (tire not on yet)
  // or 'done' (already tightened / not started).
  tighten(corner, t) {
    const fit = this.fittedAt(corner);
    if (fit === null || this.tightenAt[corner] !== undefined) return 'done';
    if (t < fit) return 'early';
    this.tightenAt[corner] = t;
    return 'ok';
  }

  cornerEnd(corner) {
    const start = this.cornerStart[corner];
    if (start === undefined) return null;
    const d = this.rules.cornerDuration;
    if (!this.manual.has(corner)) return start + d;
    const tt = this.tightenAt[corner];
    return tt === undefined ? null : tt + (1 - FIT) * d;
  }

  // Time the last corner finishes, or null while taps are outstanding.
  get cornersDone() {
    if (!this.allTapped) return null;
    const ends = this.order.map((c) => this.cornerEnd(c));
    return ends.includes(null) ? null : Math.max(...ends);
  }

  get releaseTime() {
    const done = this.cornersDone;
    return done === null ? null : done + this.rules.jackDrop + this.rules.releaseDelay;
  }

  jackHeight(t) {
    const { jackLift, liftHeight, jackDrop } = this.rules;
    if (t <= 0) return 0;
    const done = this.cornersDone;
    if (done !== null && t >= done) {
      return liftHeight * (1 - clamp01((t - done) / jackDrop));
    }
    return liftHeight * easeOut(clamp01(t / jackLift));
  }

  // Phase of one corner at time t, used to pose crew and move the wheel.
  corner(corner, t) {
    const start = this.cornerStart[corner];
    if (start === undefined || t < start) return { phase: 'ready', out: 0, swapped: false };
    const d = this.rules.cornerDuration;
    let r = (t - start) / d; // 0..1 over the corner sequence
    if (this.manual.has(corner) && r >= FIT) {
      const tt = this.tightenAt[corner];
      if (tt === undefined || t < tt) return { phase: 'await_gun', out: 0, swapped: true };
      r = FIT + (t - tt) / d;
    }
    if (r < 0.12) return { phase: 'gun_off', out: 0, swapped: false };
    if (r < 0.42) return { phase: 'tire_pull', out: easeInOut((r - 0.12) / 0.3), swapped: false };
    if (r < 0.75) return { phase: 'tire_fit', out: 1 - easeInOut((r - 0.42) / 0.33), swapped: true };
    if (r < 1) return { phase: 'gun_on', out: 0, swapped: true };
    return { phase: 'hand_up', out: 0, swapped: true };
  }
}

export function grade(time, target = PIT.target) {
  if (time < target - 0.3) return { label: 'Record pace', holo: true };
  if (time < target) return { label: 'Beat the target', holo: true };
  if (time < target + 0.6) return { label: 'Solid stop', holo: false };
  return { label: 'Slow stop', holo: false };
}

const FIT = 0.75; // share of a corner's sequence until the new tire is on
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOut = (x) => 1 - (1 - x) * (1 - x);
const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
