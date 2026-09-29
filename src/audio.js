// Procedural sound for walk mode: an engine voice per car (two detuned saws
// through a low-pass, pitch follows speed, positioned in 3D) and a crowd bed
// (filtered noise) that swells near the grandstand and podium crowds.
// Starts only after a user gesture, as browsers require.

import * as THREE from 'three';

export class SoundScape {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.muted = false;
    this.cars = new Map();
  }

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(ctx.destination);

    // Crowd bed: looping pink-ish noise through a band-pass, with slow swells.
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.97 * b0 + w * 0.3;
      b1 = 0.6 * b1 + w * 0.4;
      d[i] = (b0 + b1) * 0.25;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.6;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0;
    src.connect(bp).connect(this.crowdGain).connect(this.master);
    src.start();
  }

  toggle() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.1);
  }

  voice(car) {
    if (this.cars.has(car)) return this.cars.get(car);
    const ctx = this.ctx;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = o2.type = 'sawtooth';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.value = 0;
    const pan = ctx.createPanner();
    pan.panningModel = 'HRTF';
    pan.distanceModel = 'inverse';
    pan.refDistance = 6;
    pan.rolloffFactor = 1.4;
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(pan).connect(this.master);
    o1.start();
    o2.start();
    const v = { o1, o2, lp, g, pan };
    this.cars.set(car, v);
    return v;
  }

  // A rush of water (driving through the waterfall): a filtered noise burst.
  splash() {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const len = Math.floor(ctx.sampleRate * 1.2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(bp).connect(g).connect(this.master);
    src.start();
  }

  update(active) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const cam = this.game.camera;
    const L = ctx.listener;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    if (L.positionX) {
      L.positionX.setTargetAtTime(cam.position.x, t, 0.05);
      L.positionY.setTargetAtTime(cam.position.y, t, 0.05);
      L.positionZ.setTargetAtTime(cam.position.z, t, 0.05);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.05);
      L.forwardY.setTargetAtTime(fwd.y, t, 0.05);
      L.forwardZ.setTargetAtTime(fwd.z, t, 0.05);
      L.upX.setTargetAtTime(up.x, t, 0.05);
      L.upY.setTargetAtTime(up.y, t, 0.05);
      L.upZ.setTargetAtTime(up.z, t, 0.05);
    } else {
      L.setPosition(cam.position.x, cam.position.y, cam.position.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
    for (const team of this.game.teams) {
      for (const car of team.cars) {
        if (!car.drive) continue;
        const v = this.voice(car);
        const speed = Math.abs(car.drive.v);
        const f = 70 + speed * 11;
        v.o1.frequency.setTargetAtTime(f, t, 0.05);
        v.o2.frequency.setTargetAtTime(f * 1.505, t, 0.05);
        v.lp.frequency.setTargetAtTime(600 + speed * 60, t, 0.1);
        const on = active && speed > 0.5 && car.root.visible ? 0.05 + Math.min(0.12, speed / 250) : 0;
        v.g.gain.setTargetAtTime(on, t, 0.08);
        const p = car.root.position;
        if (v.pan.positionX) {
          v.pan.positionX.setTargetAtTime(p.x, t, 0.03);
          v.pan.positionY.setTargetAtTime(p.y + 0.5, t, 0.03);
          v.pan.positionZ.setTargetAtTime(p.z, t, 0.03);
        } else v.pan.setPosition(p.x, 0.5, p.z);
      }
    }
    // Crowd loudness from distance to the grandstand and podium crowds.
    const g = this.game;
    const near = (obj, r) => Math.max(0, 1 - cam.position.distanceTo(obj.position) / r);
    const excite = g.celebrating ? 1 : g.pitChallenge.phase === 'running' ? 0.5 : 0;
    const level = active ? Math.min(0.5, 0.05 + near(g.grandstand, 70) * 0.3 + near(g.podium, 60) * (0.2 + excite * 0.3)) : 0;
    this.crowdGain.gain.setTargetAtTime(level, t, 0.3);
  }
}
