// Procedural animation clips for the people kit. Each clip returns a pose:
// bone -> [x, y, z] Euler offsets from the bind pose, plus `hips` (vertical
// offset in meters). The animator eases every bone toward the pose, so clips
// blend into each other without hand-made transitions.
// Clip names follow the spec: snake_case, looping clips end in _loop.
//
// Rotation cheat sheet (bind pose: arms hang down, facing +Z):
//   arm x < 0 swings the arm forward, armL z > 0 / armR z < 0 lifts it sideways
//   fore x < 0 bends the elbow forward, leg x < 0 lifts the thigh forward,
//   shin x > 0 bends the knee, spine/chest x > 0 leans forward

import * as THREE from 'three';

const S = Math.sin;
const PI = Math.PI;
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const bell = (t, a, b) => ease((t - a) / ((b - a) / 2)) * (1 - ease((t - (a + b) / 2) / ((b - a) / 2)));

const rest = (t) => ({
  chest: [0.03 * S(t * 2), 0, 0],
  armL: [0, 0, 0.1 + 0.02 * S(t * 2)],
  armR: [0, 0, -0.1 - 0.02 * S(t * 2)],
  foreL: [-0.15, 0, 0],
  foreR: [-0.15, 0, 0],
  head: [0, 0.15 * S(t * 0.5), 0],
});

const kneel = (t) => ({
  hips: -0.36,
  spine: [0.25, 0, 0],
  chest: [0.15, 0, 0],
  legL: [-1.45, 0, 0.05],
  shinL: [1.5, 0, 0],
  footL: [0.0, 0, 0],
  legR: [0.25, 0, -0.05],
  shinR: [1.75, 0, 0],
  footR: [-0.5, 0, 0],
  armR: [-1.0, 0, -0.1],
  foreR: [-0.5, 0, 0],
  armL: [-0.9, 0, 0.2],
  foreL: [-0.6, 0, 0],
  head: [-0.2 + 0.03 * S(t * 3), 0, 0],
});

const seated = (t, p = {}) => ({
  hips: 0,
  spine: [-0.85, 0, 0],
  chest: [-0.2, 0, 0],
  head: [0.95, 0, -(p.lean || 0) * 0.35],
  legL: [-1.45, 0, 0.06],
  legR: [-1.45, 0, -0.06],
  shinL: [0.25, 0, 0],
  shinR: [0.25, 0, 0],
  armL: [-1.6, 0, 0.25],
  armR: [-1.6, 0, -0.25],
  foreL: [-0.5, 0, 0],
  foreR: [-0.5, 0, 0],
});

const walk = (t, speed = 1) => {
  const w = t * 6.5 * speed;
  return {
    hips: -0.02 + 0.025 * Math.abs(S(w)),
    legL: [0.5 * S(w), 0, 0],
    legR: [-0.5 * S(w), 0, 0],
    shinL: [0.6 * Math.max(0, -S(w + 0.8)) + 0.1, 0, 0],
    shinR: [0.6 * Math.max(0, S(w + 0.8)) + 0.1, 0, 0],
    armL: [-0.45 * S(w), 0, 0.08],
    armR: [0.45 * S(w), 0, -0.08],
    foreL: [-0.35, 0, 0],
    foreR: [-0.35, 0, 0],
    chest: [0.05, 0.08 * S(w), 0],
  };
};

export const CLIPS = {
  idle_loop: { loop: true, fn: rest },
  walk_loop: { loop: true, fn: (t) => walk(t) },
  carry_walk_loop: { loop: true, fn: (t) => ({ ...walk(t, 0.8), armL: [-1.0, 0, 0.35], armR: [-1.0, 0, -0.35], foreL: [-0.3, 0, 0], foreR: [-0.3, 0, 0] }) },
  push_cart_loop: { loop: true, fn: (t) => ({ ...walk(t, 0.6), spine: [0.3, 0, 0], armL: [-1.2, 0, 0.1], armR: [-1.2, 0, -0.1], foreL: [-0.1, 0, 0], foreR: [-0.1, 0, 0] }) },
  wave: {
    dur: 2,
    fn: (t) => ({ ...rest(t), armR: [-0.2, 0, -2.5 * ease(t / 0.3) * (1 - ease((t - 1.7) / 0.3))], foreR: [0, 0, -0.5 + 0.5 * S(t * 12)], head: [0, -0.2, 0] }),
  },
  bow: {
    dur: 1.8,
    fn: (t) => ({ ...rest(t), spine: [0.7 * bell(t, 0.1, 1.7), 0, 0], chest: [0.3 * bell(t, 0.1, 1.7), 0, 0], armR: [-0.9 * bell(t, 0.1, 1.7), 0, 0], foreR: [-1.2 * bell(t, 0.1, 1.7), 0.5, 0] }),
  },
  point_sky: { dur: 2, fn: (t) => ({ ...rest(t), armR: [-2.9 * bell(t, 0, 2), 0, -0.2], foreR: [0, 0, 0], head: [-0.4 * bell(t, 0, 2), 0, 0] }) },
  fist_pump: {
    dur: 1.4,
    fn: (t) => ({ ...rest(t), armR: [-0.6 * bell(t, 0, 1.4), 0, -0.4], foreR: [-2.2 * bell(t, 0, 1.4) + 0.3 * S(t * 14) * bell(t, 0.3, 1.1), 0, 0] }),
  },
  thumbs_up: { dur: 1.4, fn: (t) => ({ ...rest(t), armR: [-1.2 * bell(t, 0, 1.4), 0, -0.2], foreR: [-1.0 * bell(t, 0, 1.4), 0, 0] }) },
  high_five: { dur: 1.2, fn: (t) => ({ ...rest(t), armR: [-2.6 * bell(t, 0, 1.2), 0, -0.3], foreR: [-0.3, 0, 0], chest: [-0.1, 0, 0] }) },
  jump: {
    dur: 1.2,
    fn: (t) => {
      const air = t > 0.25 && t < 0.85 ? S(((t - 0.25) / 0.6) * PI) * 0.45 : 0;
      const crouch = bell(t, 0, 0.35) * -0.15 + bell(t, 0.8, 1.2) * -0.12;
      return { ...rest(t), hips: air + crouch, armL: [0, 0, 2.6 * bell(t, 0.1, 1.1)], armR: [0, 0, -2.6 * bell(t, 0.1, 1.1)], legL: [-0.4 * bell(t, 0, 0.4), 0, 0], legR: [-0.4 * bell(t, 0, 0.4), 0, 0], shinL: [0.8 * bell(t, 0, 0.4), 0, 0], shinR: [0.8 * bell(t, 0, 0.4), 0, 0] };
    },
  },
  air_guitar: {
    dur: 2.2,
    fn: (t) => ({ ...rest(t), spine: [-0.2, 0, 0], armL: [-1.0, 0.5, 0.6], foreL: [-0.6, 0, 0], armR: [-0.5, 0, -0.2], foreR: [-1.2 + 0.4 * S(t * 18), 0, 0], head: [0.2 * S(t * 9), 0, 0] }),
  },
  cap_tip: { dur: 1.4, fn: (t) => ({ ...rest(t), armR: [-2.2 * bell(t, 0, 1.4), 0, -0.3], foreR: [-2.0 * bell(t, 0, 1.4), 0, 0], head: [0.2 * bell(t, 0.3, 1.1), 0, 0] }) },
  salute: { dur: 1.6, fn: (t) => ({ ...rest(t), armR: [-1.4 * bell(t, 0, 1.6), 0, -1.0 * bell(t, 0, 1.6)], foreR: [-2.3 * bell(t, 0, 1.6), 0, 0] }) },
  helmet_off: {
    dur: 1.3,
    fn: (t) => ({ ...rest(t), armL: [-2.5 * bell(t, 0, 1.3), 0, 0.3], armR: [-2.5 * bell(t, 0, 1.3), 0, -0.3], foreL: [-1.2 * bell(t, 0, 1.3), 0, 0], foreR: [-1.2 * bell(t, 0, 1.3), 0, 0], head: [0.2 * bell(t, 0.3, 1), 0, 0] }),
    events: { 0.65: 'helmet_toggle' },
  },
  helmet_on: {
    dur: 1.3,
    fn: (t) => CLIPS.helmet_off.fn(t),
    events: { 0.65: 'helmet_toggle' },
  },
  drive_seated_loop: { loop: true, fn: seated },
  kneel_ready_loop: { loop: true, fn: kneel },
  gun_off: { dur: 0.3, fn: (t) => ({ ...kneel(t), armR: [-1.15, 0, -0.1], foreR: [-0.2 - 0.3 * S(t * 40), 0, 0] }) },
  gun_on: { dur: 0.3, fn: (t) => ({ ...kneel(t), armR: [-1.15, 0, -0.1], foreR: [-0.2 - 0.3 * S(t * 40), 0, 0] }) },
  hand_up: { dur: 0.8, loopHold: true, fn: (t) => ({ ...kneel(t), armL: [0, 0, 2.9], foreL: [0, 0, 0] }) },
  tire_pull: {
    dur: 0.5,
    fn: (t) => ({ hips: -0.25, spine: [0.5, 0, 0], legL: [-0.9, 0, 0.1], legR: [-0.9, 0, -0.1], shinL: [1.3, 0, 0], shinR: [1.3, 0, 0], footL: [-0.3, 0, 0], footR: [-0.3, 0, 0], armL: [-1.2, 0, 0.35], armR: [-1.2, 0, -0.35], foreL: [-0.2, 0, 0], foreR: [-0.2, 0, 0] }),
  },
  tire_fit: { dur: 0.5, fn: (t) => CLIPS.tire_pull.fn(t) },
  jack_ready_loop: { loop: true, fn: (t) => ({ spine: [0.35, 0, 0], legL: [-0.4, 0, 0], shinL: [0.4, 0, 0], legR: [0.3, 0, 0], armL: [-1.1, 0, 0.1], armR: [-1.1, 0, -0.1], foreL: [-0.3, 0, 0], foreR: [-0.3, 0, 0], head: [-0.25, 0, 0] }) },
  jack_lift: { dur: 0.3, fn: (t) => ({ spine: [-0.15, 0, 0], legL: [-0.4, 0, 0], shinL: [0.3, 0, 0], legR: [0.4, 0, 0], armL: [-0.7, 0, 0.1], armR: [-0.7, 0, -0.1], foreL: [-0.2, 0, 0], foreR: [-0.2, 0, 0] }), loopHold: true },
  jack_lower: { dur: 0.3, fn: (t) => CLIPS.jack_ready_loop.fn(t) },
  watch_loop: { loop: true, fn: (t) => ({ ...rest(t), armR: [-0.9, 0, -0.1], foreR: [-0.7, 0, 0], head: [0.1, 0.4 * S(t * 0.8), 0] }) },
  press_release: { dur: 0.6, fn: (t) => ({ ...rest(t), armR: [-1.3, 0, -0.1], foreR: [-0.2, 0, 0] }) },
  radio_talk_loop: {
    loop: true,
    fn: (t) => ({ ...rest(t), armL: [-0.4, 0, 1.1], foreL: [-2.4, 0, 0], armR: [-0.5, 0, -0.1], foreR: [-1.3, 0.3, 0], head: [0.05 * S(t * 3), 0.1 * S(t * 0.7), 0] }),
  },
  point_at_screen: { dur: 1.4, fn: (t) => ({ ...rest(t), armL: [-1.4 * bell(t, 0, 1.4), 0, 0.2], foreL: [-0.1, 0, 0], armR: [-0.5, 0, -0.1], foreR: [-1.3, 0.3, 0] }) },
  typing_loop: { loop: true, fn: (t) => ({ ...rest(t), spine: [0.3, 0, 0], armL: [-0.9, 0, 0.15], armR: [-0.9, 0, -0.15], foreL: [-0.6 + 0.08 * S(t * 20), 0, 0], foreR: [-0.6 + 0.08 * S(t * 20 + 1), 0, 0], head: [0.2, 0, 0] }) },
  lean_to_screen: { dur: 1.6, fn: (t) => ({ ...rest(t), spine: [0.55 * bell(t, 0, 1.6), 0, 0], head: [0.2, 0, 0] }) },
  arms_crossed_loop: { loop: true, fn: (t) => ({ chest: [0.02 * S(t * 2), 0, 0], armL: [-0.35, 0, 0.15], armR: [-0.35, 0, -0.15], foreL: [-1.5, -0.9, 0], foreR: [-1.4, 0.9, 0], head: [0, 0.2 * S(t * 0.4), 0] }) },
  applause: { dur: 1.6, fn: (t) => ({ ...rest(t), armL: [-0.8, 0, 0.1], armR: [-0.8, 0, -0.1], foreL: [-0.9, -0.5 - 0.3 * S(t * 18), 0], foreR: [-0.9, 0.5 + 0.3 * S(t * 18), 0] }) },
  handshake: { dur: 1.2, fn: (t) => ({ ...rest(t), armR: [-0.8 * bell(t, 0, 1.2), 0, 0], foreR: [-0.3 - 0.15 * S(t * 16), 0, 0] }) },
  trophy_lift: { dur: 2.2, loopHold: true, fn: (t) => ({ ...rest(t), armL: [-0.3, 0, 2.7 * ease(t / 0.5)], armR: [-0.3, 0, -2.7 * ease(t / 0.5)], foreL: [-0.3, 0, 0], foreR: [-0.3, 0, 0], head: [-0.3, 0, 0] }) },
  champagne_spray_loop: { loop: true, fn: (t) => ({ ...rest(t), armR: [-2.0 + 0.2 * S(t * 16), 0, -0.3], foreR: [-0.3, 0, 0], armL: [-0.3, 0, 0.9], foreL: [-0.5, 0, 0], chest: [-0.15, 0.2 * S(t * 2), 0] }) },
  interview_talk_loop: { loop: true, fn: (t) => ({ ...rest(t), armR: [-0.6, 0, -0.1], foreR: [-1.0 + 0.3 * S(t * 3), 0.3 * S(t * 2), 0], armL: [-0.3, 0, 0.1], foreL: [-0.8 + 0.2 * S(t * 2.5), 0, 0], head: [0.05 * S(t * 4), 0.1 * S(t), 0] }) },
  wrench_loop: { loop: true, fn: (t) => ({ ...kneel(t), armR: [-1.2, 0.3 * S(t * 5), -0.2], foreR: [-0.4 + 0.2 * S(t * 5), 0, 0], armL: [-0.7, 0, 0.3] }) },
  crouch_inspect: { dur: 2.2, fn: (t) => ({ ...kneel(t), spine: [0.5, 0, 0], armL: [-0.6, 0, 0.3], armR: [-0.6, 0, -0.3], head: [0.3, 0.3 * S(t * 2), 0] }) },
  hug: { dur: 1.6, fn: (t) => ({ ...rest(t), armL: [-1.4 * bell(t, 0, 1.6), 0, 0.2], armR: [-1.4 * bell(t, 0, 1.6), 0, -0.2], foreL: [-0.2, -1.2 * bell(t, 0, 1.6), 0], foreR: [-0.2, 1.2 * bell(t, 0, 1.6), 0] }) },
  // Preset emotes used by the paddock characters.
  finger_point: { dur: 1.4, fn: (t) => ({ ...rest(t), armR: [-1.5 * bell(t, 0, 1.4), 0, -0.1], foreR: [0, 0, 0] }) },
  chin_stroke: { dur: 2, fn: (t) => ({ ...rest(t), armR: [-1.0 * bell(t, 0, 2), 0, -0.1], foreR: [-2.4 * bell(t, 0, 2), 0.4 * S(t * 6), 0], head: [0.15, 0, 0] }) },
  gun_spin: { dur: 1.6, fn: (t) => ({ ...rest(t), armR: [-1.0 * bell(t, 0, 1.6), 0, -0.2], foreR: [-0.8, 0, 0], handR: [0, t * 20, 0] }) },
  wipe_hands: { dur: 1.8, fn: (t) => ({ ...rest(t), armL: [-0.7, 0, 0.1], armR: [-0.7, 0, -0.1], foreL: [-1.1, -0.6 + 0.3 * S(t * 12), 0], foreR: [-1.1, 0.6 + 0.3 * S(t * 12), 0] }) },
};

export const ONE_SHOT_EMOTES = ['wave', 'bow', 'point_sky', 'fist_pump', 'thumbs_up', 'high_five', 'jump', 'air_guitar', 'cap_tip', 'salute', 'hug'];

const BONE_KEYS = ['spine', 'chest', 'head', 'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR', 'legL', 'shinL', 'footL', 'legR', 'shinR', 'footR'];

export class Animator {
  constructor(person, base = 'idle_loop') {
    this.p = person;
    this.base = base;
    this.clip = base;
    this.t = Math.random() * 10;
    this.params = {};
    this.hipsY = person.bones.hips.position.y;
    this.hipsOff = 0;
    this.onEvent = null;
    this.firedEvents = new Set();
    this.onDone = null;
    this.stiffness = 12;
  }

  setBase(name) {
    const wasBase = this.clip === this.base;
    this.base = name;
    if (wasBase || CLIPS[this.clip]?.loop) this.play(name);
  }

  play(name, { onDone = null, hold = false } = {}) {
    if (!CLIPS[name]) return;
    this.clip = name;
    this.t = 0;
    this.hold = hold;
    this.onDone = onDone;
    this.firedEvents.clear();
  }

  update(dt) {
    const c = CLIPS[this.clip];
    this.t += dt;
    if (c.events) {
      for (const [k, ev] of Object.entries(c.events)) {
        if (this.t >= +k && !this.firedEvents.has(k)) {
          this.firedEvents.add(k);
          this.onEvent?.(ev, this.clip);
        }
      }
    }
    if (!c.loop && this.t >= c.dur && !(this.hold || c.loopHold)) {
      const done = this.onDone;
      this.onDone = null;
      this.play(this.base);
      done?.();
    }
    const tt = !c.loop && (this.hold || c.loopHold) ? Math.min(this.t, c.dur) : this.t;
    const pose = CLIPS[this.clip].fn(tt, this.params);
    const k = THREE.MathUtils.clamp(1 - Math.exp(-dt * this.stiffness), 0, 1);
    const b = this.p.bones;
    for (const key of BONE_KEYS) {
      const target = pose[key] || ZERO;
      const r = b[key].rotation;
      r.x += (target[0] - r.x) * k;
      r.y += (target[1] - r.y) * k;
      r.z += (target[2] - r.z) * k;
    }
    this.hipsOff += ((pose.hips || 0) - this.hipsOff) * k;
    b.hips.position.y = this.hipsY + this.hipsOff;
  }

  snap() {
    this.stiffness = 1e4;
    this.update(0.016);
    this.stiffness = 12;
  }
}

const ZERO = [0, 0, 0];
