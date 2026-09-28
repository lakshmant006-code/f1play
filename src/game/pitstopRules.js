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
  constructor(order = CORNERS, rules = PIT, { anyOrder = false } = {}) {
    this.order = [...order];
    this.anyOrder = anyOrder;
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

  // Time the last corner finishes, or null while taps are outstanding.
  get cornersDone() {
    if (!this.allTapped) return null;
    return Math.max(...Object.values(this.cornerStart)) + this.rules.cornerDuration;
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
    const r = (t - start) / d; // 0..1 over the corner sequence
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

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOut = (x) => 1 - (1 - x) * (1 - x);
const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
