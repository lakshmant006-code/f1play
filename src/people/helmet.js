// Helmet design system: base color + one of 8 shared patterns + chin number +
// surname on the side band, painted onto one equirectangular template.

import * as THREE from 'three';

const W = 512;
const H = 256;
const THETA = 0.8; // fraction of the sphere the shell covers, top down

// Canvas x for a direction on the shell: 0 = -X side, 0.25 = front (+Z), 0.5 = +X side, 0.75 = back.
const ux = (u) => u * W;
// Canvas y for a polar angle given as a fraction of PI from the top.
const vy = (theta) => (theta / THETA) * H;

const PATTERNS = {
  rays(ctx, ink) {
    ctx.fillStyle = ink;
    for (let i = 0; i < 16; i++) {
      const x = ux(i / 16);
      ctx.beginPath();
      ctx.moveTo(ux(0.25), vy(0.62));
      ctx.lineTo(x, 0);
      ctx.lineTo(x + W / 40, 0);
      ctx.closePath();
      ctx.fill();
    }
  },
  waves(ctx, ink) {
    ctx.strokeStyle = ink;
    for (let k = 0; k < 3; k++) {
      ctx.lineWidth = 10 - k * 3;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 4) ctx.lineTo(x, vy(0.2 + k * 0.1) + Math.sin((x / W) * Math.PI * 6) * 10);
      ctx.stroke();
    }
  },
  chevrons(ctx, ink) {
    ctx.fillStyle = ink;
    for (let i = 0; i < 5; i++) {
      const y = vy(0.1 + i * 0.08);
      ctx.beginPath();
      ctx.moveTo(0, y + 28);
      ctx.lineTo(ux(0.25), y);
      ctx.lineTo(ux(0.5), y + 28);
      ctx.lineTo(ux(0.75), y);
      ctx.lineTo(W, y + 28);
      ctx.lineTo(W, y + 38);
      ctx.lineTo(ux(0.75), y + 10);
      ctx.lineTo(ux(0.5), y + 38);
      ctx.lineTo(ux(0.25), y + 10);
      ctx.lineTo(0, y + 38);
      ctx.fill();
    }
  },
  stars(ctx, ink) {
    ctx.fillStyle = ink;
    const star = (cx, cy, r) => {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 ? r * 0.45 : r;
        ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      ctx.fill();
    };
    for (let i = 0; i < 12; i++) star(ux(i / 12 + 0.04), vy(0.18 + (i % 3) * 0.1), 14 + (i % 2) * 6);
  },
  pinstripes(ctx, ink) {
    ctx.fillStyle = ink;
    for (const t of [0.3, 0.33, 0.62, 0.65]) ctx.fillRect(0, vy(t), W, 4);
    ctx.fillRect(ux(0.25) - 3, 0, 6, vy(0.4));
  },
  checks(ctx, ink) {
    ctx.fillStyle = ink;
    const c = 24;
    for (let y = 0; y < vy(0.38); y += c) for (let x = 0; x < W; x += c) if (((x + y) / c) % 2 === 0) ctx.fillRect(x, y, c, c);
  },
  grid(ctx, ink) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3;
    for (let x = 0; x <= W; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  },
  split(ctx, ink) {
    ctx.fillStyle = ink;
    ctx.fillRect(ux(0.5), 0, W / 2, H);
    ctx.fillRect(0, 0, ux(0.0) + 1, H);
  },
};

export const HELMET_PATTERN_NAMES = Object.keys(PATTERNS);

export function paintHelmet({ base, pattern, ink, number = '', name = '' }) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  PATTERNS[pattern]?.(ctx, ink);
  // Side band with surname on both sides.
  ctx.fillStyle = base;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(0, vy(0.6), W, vy(0.12));
  ctx.globalAlpha = 1;
  ctx.fillStyle = ink;
  ctx.font = `900 ${vy(0.09)}px Nunito, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const u of [0.0, 0.5, 1.0]) ctx.fillText(name.toUpperCase(), ux(u), vy(0.66));
  // Chin number.
  if (number !== '') {
    ctx.font = `900 ${vy(0.12)}px Nunito, Arial, sans-serif`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = base;
    ctx.strokeText(String(number), ux(0.25), vy(0.73));
    ctx.fillText(String(number), ux(0.25), vy(0.73));
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const geoCache = {};
export function helmetGeometry() {
  if (geoCache.shell) return geoCache;
  const r = 0.165;
  geoCache.shell = new THREE.SphereGeometry(r, 22, 14, 0, Math.PI * 2, 0, Math.PI * THETA);
  geoCache.shell.scale(1, 1.02, 1.1);
  // Visor: a front band of a slightly larger sphere, hinged at the helmet center.
  geoCache.visor = new THREE.SphereGeometry(r * 1.02, 20, 6, Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.4, Math.PI * 0.17);
  geoCache.visor.scale(1, 1.02, 1.1);
  geoCache.intake = new THREE.BoxGeometry(0.06, 0.03, 0.08).translate(0, r * 1.0, 0.03);
  geoCache.spoiler = new THREE.BoxGeometry(0.16, 0.012, 0.05).rotateX(-0.3).translate(0, r * 0.72, -r * 1.08);
  geoCache.collar = new THREE.TorusGeometry(0.1, 0.035, 6, 16).rotateX(Math.PI / 2).translate(0, -r * 0.88, -0.01);
  return geoCache;
}
