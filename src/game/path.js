// Arc-length sampled paths for the racing line and the pit lane, plus a speed
// profile limited by lateral grip, acceleration and braking.

import * as THREE from 'three';

const STEP = 0.5; // meters between samples

export class Path {
  constructor(points, { closed = false, vMax = 34, aLat = 16, aAcc = 9, aBrake = 18, vStart = null, vEnd = null } = {}) {
    this.closed = closed;
    const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
    this.length = curve.getLength();
    const n = Math.max(2, Math.round(this.length / STEP));
    this.n = n;
    this.pos = [];
    this.tan = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      this.pos.push(curve.getPointAt(u));
      this.tan.push(curve.getTangentAt(u).normalize());
    }
    // Signed curvature on the ground plane (positive = turning left, towards +x of heading).
    this.curv = this.pos.map((_, i) => {
      const a = this.tan[this.wrap(i - 2)];
      const b = this.tan[this.wrap(i + 2)];
      const ds = STEP * 4;
      const cross = a.z * b.x - a.x * b.z;
      const dot = a.x * b.x + a.z * b.z;
      return Math.atan2(cross, dot) / ds;
    });
    this.speed = speedProfile(this.curv, STEP, { vMax, aLat, aAcc, aBrake, closed, vStart, vEnd });
  }

  wrap(i) {
    const n = this.n;
    if (this.closed) return ((i % n) + n) % n;
    return Math.min(n, Math.max(0, i));
  }

  index(s) {
    if (this.closed) s = ((s % this.length) + this.length) % this.length;
    else s = Math.min(this.length, Math.max(0, s));
    return s / STEP;
  }

  // Interpolated sample at distance s.
  at(s, out = {}) {
    const f = this.index(s);
    const i = Math.floor(f);
    const t = f - i;
    const j = this.wrap(i + 1);
    const a = this.wrap(i);
    out.pos = (out.pos || new THREE.Vector3()).copy(this.pos[a]).lerp(this.pos[j], t);
    out.tan = (out.tan || new THREE.Vector3()).copy(this.tan[a]).lerp(this.tan[j], t).normalize();
    out.curv = this.curv[a] * (1 - t) + this.curv[j] * t;
    out.speed = this.speed[a] * (1 - t) + this.speed[j] * t;
    return out;
  }

  // Distance along the path of the sample nearest to a point.
  nearest(p) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i <= this.n; i++) {
      const d = this.pos[i].distanceToSquared(p);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best * STEP;
  }
}

export function speedProfile(curv, ds, { vMax, aLat, aAcc, aBrake, closed, vStart, vEnd }) {
  const n = curv.length;
  const v = curv.map((k) => Math.min(vMax, Math.sqrt(aLat / Math.max(Math.abs(k), 1e-4))));
  if (vStart !== null) v[0] = Math.min(v[0], vStart);
  if (vEnd !== null) v[n - 1] = Math.min(v[n - 1], vEnd);
  // Two laps of each pass settles the wrap-around on closed loops.
  const passes = closed ? 2 : 1;
  for (let p = 0; p < passes; p++) {
    for (let k = 1; k < n * (closed ? 1 : 1); k++) {
      const i = k % n;
      const prev = (i - 1 + n) % n;
      v[i] = Math.min(v[i], Math.sqrt(v[prev] * v[prev] + 2 * aAcc * ds));
    }
    for (let k = n - 2; k >= 0; k--) {
      const i = k;
      const next = (i + 1) % n;
      v[i] = Math.min(v[i], Math.sqrt(v[next] * v[next] + 2 * aBrake * ds));
    }
    if (closed) {
      v[0] = Math.min(v[0], Math.sqrt(v[n - 1] * v[n - 1] + 2 * aAcc * ds));
      v[n - 1] = Math.min(v[n - 1], Math.sqrt(v[0] * v[0] + 2 * aBrake * ds));
    }
  }
  return v;
}
