// A person in the world: animator plus simple walk-to steering.

import * as THREE from 'three';
import { Animator } from './anim.js';

export class Actor {
  constructor(person, { base = 'idle_loop', role = '', info = {} } = {}) {
    this.person = person;
    this.root = person.root;
    this.anim = new Animator(person, base);
    this.anim.snap();
    this.role = role;
    this.info = info;
    this.goal = null;
    this.speed = 1.6;
  }

  place(pos, heading = 0) {
    this.root.position.copy(pos);
    this.root.rotation.y = heading;
    this.home = { pos: pos.clone(), heading };
  }

  // Walk (or run) to a point, then face `heading` and play `clip`.
  walkTo(pos, heading, { clip = null, run = false, onArrive = null } = {}) {
    this.goal = { pos: pos.clone(), heading, clip, onArrive };
    this.speed = run ? 4.2 : 1.6;
    if (this.root.position.distanceTo(pos) > 0.05) this.anim.play(run ? 'walk_loop' : 'walk_loop');
  }

  goHome(opts = {}) {
    if (this.home) this.walkTo(this.home.pos, this.home.heading, opts);
  }

  update(dt) {
    const g = this.goal;
    if (g) {
      const p = this.root.position;
      const d = new THREE.Vector3().subVectors(g.pos, p);
      d.y = 0;
      const dist = d.length();
      if (dist < 0.05) {
        p.copy(g.pos);
        this.turnTo(g.heading, dt, 1);
        this.goal = null;
        if (g.clip) this.anim.setBase(g.clip);
        else this.anim.play(this.anim.base);
        g.onArrive?.();
      } else {
        const step = Math.min(dist, this.speed * dt);
        p.addScaledVector(d.normalize(), step);
        this.turnTo(Math.atan2(d.x, d.z), dt, 12);
        this.anim.params.speed = this.speed;
      }
    } else if (this.faceHeading !== undefined) {
      this.turnTo(this.faceHeading, dt, 8);
    }
    this.anim.update(this.goal ? dt * (this.speed > 2 ? 1.7 : 1) : dt);
  }

  turnTo(h, dt, rate) {
    const r = this.root.rotation;
    let dh = h - r.y;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    r.y += dh * Math.min(1, dt * rate);
  }
}
