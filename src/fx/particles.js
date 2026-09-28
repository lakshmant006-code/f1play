// One pooled particle system for tire spray, confetti, champagne and sparkles,
// plus a rain curtain that follows the camera target.

import * as THREE from 'three';

export class Particles {
  constructor(max = 4000) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { scale: { value: 600 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vC; varying float vA; uniform float scale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        varying vec3 vC; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d); if (r > 0.25) discard;
          gl_FragColor = vec4(vC, vA * smoothstep(0.25, 0.12, r));
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.geo = g;
  }

  emit({ pos, vel, color = '#ffffff', life = 1, size = 0.2, gravity = -9.8, drag = 0.5, spread = 0.5, count = 1, jitter = 0 }) {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      this.pos[i * 3] = pos.x + (Math.random() - 0.5) * jitter;
      this.pos[i * 3 + 1] = pos.y + (Math.random() - 0.5) * jitter;
      this.pos[i * 3 + 2] = pos.z + (Math.random() - 0.5) * jitter;
      this.vel[i * 3] = vel.x + (Math.random() - 0.5) * spread;
      this.vel[i * 3 + 1] = vel.y + (Math.random() - 0.5) * spread;
      this.vel[i * 3 + 2] = vel.z + (Math.random() - 0.5) * spread;
      const cc = Array.isArray(color) ? new THREE.Color(color[Math.floor(Math.random() * color.length)]) : c;
      this.col[i * 3] = cc.r;
      this.col[i * 3 + 1] = cc.g;
      this.col[i * 3 + 2] = cc.b;
      this.size[i] = size * (0.7 + Math.random() * 0.6);
      this.life[i] = life * (0.7 + Math.random() * 0.6);
      this.age[i] = 0;
      this.grav[i] = gravity;
      this.drag[i] = drag;
      this.alpha[i] = 1;
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.alpha[i] <= 0) continue;
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) {
        this.alpha[i] = 0;
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
    }
    for (const k of ['position', 'color', 'size', 'alpha']) this.geo.attributes[k].needsUpdate = true;
  }
}

export class Rain {
  constructor(count = 2500) {
    const pos = new Float32Array(count * 6);
    this.count = count;
    this.drops = [];
    for (let i = 0; i < count; i++) this.drops.push({ x: (Math.random() - 0.5) * 160, y: Math.random() * 60, z: (Math.random() - 0.5) * 160, v: 28 + Math.random() * 10 });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#cfe3f5', transparent: true, opacity: 0.45 }));
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    this.pos = pos;
    this.geo = g;
  }

  update(dt, center) {
    if (!this.lines.visible) return;
    for (let i = 0; i < this.count; i++) {
      const d = this.drops[i];
      d.y -= d.v * dt;
      if (d.y < -2) d.y += 60;
      const x = center.x + d.x;
      const z = center.z + d.z;
      this.pos.set([x, d.y, z, x + 0.1, d.y + 0.9, z], i * 6);
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
