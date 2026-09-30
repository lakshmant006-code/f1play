// Moves a car along the racing line and pit lane and drives its animated
// nodes: wheel spin, steering up to 25°, 2° pitch under braking and 2° roll in
// corners, rear flap opening to 60° on straights, rain light at 4 Hz.

import * as THREE from 'three';
import { CAR } from '../car/car.js';
import { deg } from '../geo.js';
import { PIT_Z } from './layout.js';

const MAX_STEER = deg(25);
const MAX_PITCH = deg(2);
const MAX_ROLL = deg(2);

export class CarDriver {
  constructor(car, track, pit, { s = 0, pace = 1 } = {}) {
    this.car = car;
    this.track = track;
    this.pit = pit;
    this.mode = 'track'; // track | pit | boxed | pit_exit | parked | push | parade
    this.s = s;
    this.v = 0;
    this.pace = pace;
    this.pitRequest = null; // { boxX, onBoxed }
    this.boxS = 0;
    this.accel = 0;
    this.smp = {};
    this.rain = false;
    this.flap = 0;
    this.pitch = 0;
    this.roll = 0;
    this.time = 0;
    this.lapStart = 0;
    this.lastLap = null;
    this.onLap = null;
    this.pushFrom = null;
    this.outLap = true; // first lap starts mid-track, so don't time it
    this.place();
  }

  get path() {
    return this.mode === 'track' || this.mode === 'parade' ? this.track : this.pit;
  }

  // Box this lap (or now, if the car is already in the pit lane) and stop in front of a garage.
  requestPit(boxX, onBoxed) {
    this.pitRequest = { boxX, onBoxed };
    this.boxS = this.pit.nearest(new THREE.Vector3(boxX, 0, PIT_Z));
  }

  release() {
    if (this.mode === 'boxed') this.mode = 'pit_exit';
  }

  // Leave the garage: roll out to the pit box, turn onto the pit lane and go.
  launchFromGarage(boxX, onTrack) {
    this.car.setGarage(false);
    const s = this.pit.nearest(new THREE.Vector3(boxX, 0, PIT_Z));
    const at = this.pit.at(s);
    this.moveTo(at.pos, Math.atan2(at.tan.x, at.tan.z), 2.4, () => {
      this.s = s;
      this.mode = 'pit_exit';
      this.onTrack = onTrack;
    });
  }

  park(position, heading) {
    this.mode = 'parked';
    this.v = 0;
    this.car.root.position.copy(position);
    this.car.root.rotation.set(0, heading, 0, 'YXZ');
  }

  // Scripted move (crew push back into the garage, or rolling out of it).
  moveTo(to, heading, duration, onDone) {
    this.mode = 'push';
    this.pushFrom = this.car.root.position.clone();
    this.pushTo = to.clone();
    this.pushHeadingFrom = this.car.root.rotation.y;
    let dh = heading - this.pushHeadingFrom;
    this.pushHeading = this.pushHeadingFrom + Math.atan2(Math.sin(dh), Math.cos(dh));
    this.pushT = 0;
    this.pushDur = duration;
    this.pushDone = onDone;
  }

  update(dt) {
    this.time += dt;
    const car = this.car;
    const prevV = this.v;

    if (this.mode === 'track' || this.mode === 'parade') {
      const target = this.track.at(this.s, this.smp).speed * this.pace * (this.mode === 'parade' ? 0.35 : 1);
      this.approach(target, dt);
      const before = this.s;
      this.s += this.v * dt;
      if (this.s >= this.track.length) {
        this.s -= this.track.length;
        if (!this.outLap) {
          this.lastLap = this.time - this.lapStart;
          this.bestLap = Math.min(this.bestLap ?? Infinity, this.lastLap);
          this.onLap?.(this.lastLap);
        }
        this.outLap = false;
        this.lapStart = this.time;
      }
      if (this.pitRequest && crossed(before, this.s, this.pit.sIn, this.track.length)) {
        this.mode = 'pit';
        this.s = 0;
      }
    } else if (this.mode === 'pit') {
      const lim = this.pit.at(this.s, this.smp).speed;
      const toBox = this.boxS - this.s;
      const stopV = Math.sqrt(Math.max(0, 2 * 9 * toBox));
      this.approach(Math.min(lim, stopV), dt);
      this.s += this.v * dt;
      if (toBox <= 0.05 || (this.v < 0.3 && toBox < 0.6)) {
        this.s = this.boxS;
        this.v = 0;
        this.mode = 'boxed';
        const cb = this.pitRequest.onBoxed;
        this.pitRequest = null;
        cb?.();
      }
    } else if (this.mode === 'pit_exit') {
      const lim = this.pit.at(this.s, this.smp).speed;
      this.approach(lim, dt, 10);
      this.s += this.v * dt;
      if (this.s >= this.pit.length - 0.01) {
        this.mode = 'track';
        this.s = this.pit.sOut;
        this.lapStart = this.time;
        this.outLap = true;
        const cb = this.onTrack;
        this.onTrack = null;
        cb?.();
      }
    } else if (this.mode === 'push') {
      this.pushT = Math.min(1, this.pushT + dt / this.pushDur);
      const e = this.pushT * this.pushT * (3 - 2 * this.pushT);
      const prev = car.root.position.clone();
      car.root.position.lerpVectors(this.pushFrom, this.pushTo, e);
      car.root.rotation.y = THREE.MathUtils.lerp(this.pushHeadingFrom, this.pushHeading, e);
      // Signed speed along the car's heading, so wheels roll the right way.
      const fwd = new THREE.Vector3(Math.sin(car.root.rotation.y), 0, Math.cos(car.root.rotation.y));
      this.v = car.root.position.clone().sub(prev).dot(fwd) / Math.max(dt, 1e-4);
      if (this.pushT >= 1) {
        this.mode = 'parked';
        this.v = 0;
        const cb = this.pushDone;
        this.pushDone = null;
        cb?.();
      }
    } else {
      this.v = 0;
    }

    this.accel = (this.v - prevV) / Math.max(dt, 1e-4);
    if (this.mode !== 'parked' && this.mode !== 'push' && this.mode !== 'boxed') this.place();
    this.animateNodes(dt);
  }

  approach(target, dt, acc = 9) {
    if (this.v < target) this.v = Math.min(target, this.v + acc * dt);
    else this.v = Math.max(target, this.v - 18 * dt);
  }

  place() {
    const p = this.path.at(this.s, this.smp);
    this.car.root.position.copy(p.pos); // roads climb and fall on some circuits
    const flat = Math.hypot(p.tan.x, p.tan.z) || 1;
    this.car.root.rotation.set(-Math.atan2(p.tan.y, flat), Math.atan2(p.tan.x, p.tan.z), 0, 'YXZ');
  }

  animateNodes(dt) {
    const car = this.car;
    const n = car.nodes;
    const curv = this.mode === 'parked' || this.mode === 'push' || this.mode === 'boxed' ? 0 : this.smp.curv || 0;
    // Wheels spin with speed.
    const spin = (this.v / CAR.wheelR) * dt;
    for (const w of Object.values(car.wheels)) w.rotation.x += spin;
    // Steering from path curvature (Ackermann-ish single angle).
    const steer = THREE.MathUtils.clamp(Math.atan(CAR.wheelbase * curv), -MAX_STEER, MAX_STEER);
    for (const s of Object.values(car.steers)) s.rotation.y += (steer - s.rotation.y) * Math.min(1, dt * 10);
    // Pitch under braking, roll in corners (outward).
    const k = Math.min(1, dt * 6);
    const pitchT = THREE.MathUtils.clamp(-this.accel / 18, -0.5, 1) * MAX_PITCH;
    const rollT = THREE.MathUtils.clamp((this.v * this.v * curv) / 16, -1, 1) * MAX_ROLL;
    this.pitch += (pitchT - this.pitch) * k;
    this.roll += (rollT - this.roll) * k;
    n.sprung.rotation.x = this.pitch;
    n.sprung.rotation.z = this.roll;
    // Boost: rear flap opens on straights at speed.
    const boost = this.mode === 'track' && Math.abs(curv) < 0.012 && this.v > 24 ? 1 : 0;
    this.flap += ((boost ? deg(60) : 0) - this.flap) * Math.min(1, dt * 8);
    n.flapR.rotation.x = this.flap;
    n.flapF.rotation.x = -Math.min(deg(15), Math.abs(curv) * 1.5);
    // Rain light blinks at 4 Hz in the rain.
    car.setRainLight(this.rain && this.mode !== 'parked' && Math.floor(this.time * 8) % 2 === 0);
  }
}

// Did s move across `mark` this frame on a loop of `length`?
export function crossed(from, to, mark, length) {
  if (to >= from) return from < mark && to >= mark;
  // Wrapped past the start line: the mark was crossed if it lies after `from` or before `to`.
  return (mark > from && mark <= length) || mark <= to;
}
