// Palm trees, shared by both circuits: a curved trunk with ringed bark and a
// full crown of arching, feathered fronds (leaflets drawn on an alpha-cut
// texture) with a coconut cluster. All instanced: three draw calls however
// many palms there are.

import * as THREE from 'three';
import { merge } from '../geo.js';

let parts = null;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Ringed bark: dark bands with lighter scale edges, tiling up the trunk.
function barkTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#8a6a48';
  x.fillRect(0, 0, 64, 128);
  const r = rng(7);
  for (let y = 0; y < 128; y += 16) {
    const g = x.createLinearGradient(0, y, 0, y + 16);
    g.addColorStop(0, '#5e4631');
    g.addColorStop(0.35, '#9b7a55');
    g.addColorStop(0.8, '#7c5e40');
    g.addColorStop(1, '#4d3a29');
    x.fillStyle = g;
    x.fillRect(0, y, 64, 16);
  }
  for (let i = 0; i < 600; i++) {
    x.fillStyle = r() < 0.5 ? 'rgba(40,28,18,0.3)' : 'rgba(200,170,130,0.2)';
    x.fillRect(r() * 64, r() * 128, 1 + r() * 2, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 4);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A frond: a midrib down the middle with angled leaflets either side,
// longest in the middle, on a transparent background (alpha-tested).
function frondTexture() {
  const W = 128;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  x.clearRect(0, 0, W, H);
  const r = rng(11);
  x.lineCap = 'round';
  for (let y = 24; y < H - 6; y += 5) {
    // Canvas top is the frond's tip (textures load flipped): leaflets sweep
    // toward the tip, longest mid-frond, finer near the tip.
    const t = 1 - y / H; // 0 at the base, 1 at the tip
    const len = (W / 2 - 4) * Math.sin(Math.PI * Math.min(1, t * 1.05)) * (0.75 + r() * 0.25);
    for (const side of [-1, 1]) {
      const g = 60 + Math.floor(r() * 50);
      x.strokeStyle = `rgb(${40 + g * 0.2},${g + 60},${30 + g * 0.25})`;
      x.lineWidth = 4.6 * (1 - t * 0.45);
      x.beginPath();
      x.moveTo(W / 2, y);
      x.quadraticCurveTo(W / 2 + side * len * 0.5, y - 4, W / 2 + side * len, y - 18 - t * 10);
      x.stroke();
    }
  }
  x.strokeStyle = '#6d7a3c';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(W / 2, 0);
  x.lineTo(W / 2, H);
  x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function buildParts() {
  // Trunk: tapered, curving gently, 8 m.
  const trunk = new THREE.CylinderGeometry(0.2, 0.36, 8, 12, 12);
  const tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i) + 4;
    tp.setX(i, tp.getX(i) + (y / 8) ** 2 * 0.9);
    tp.setY(i, y);
  }
  trunk.computeVertexNormals();
  // Crown: 16 fronds, each a bent strip (arching up, then drooping), at three
  // pitches, plus a few young ones standing up in the middle.
  const fronds = [];
  const R = rng(5);
  const frond = (length, lift, droop, yaw, width = 1.9) => {
    const f = new THREE.PlaneGeometry(width, length, 2, 10).translate(0, length / 2, 0);
    const p = f.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / length;
      const along = t * length;
      // Rise at first, then droop toward the tip; leaflets fold into a shallow V.
      p.setZ(i, along * Math.cos(lift));
      p.setY(i, along * Math.sin(lift) - droop * t * t * length * 0.5 - Math.abs(p.getX(i)) * 0.25);
    }
    f.rotateY(yaw);
    return f.translate(0.9, 8, 0); // the trunk top leans +x
  };
  for (let k = 0; k < 20; k++) {
    const tier = k % 3;
    fronds.push(frond(4.4 + R() * 1.2, [0.55, 0.25, -0.05][tier], [0.9, 1.1, 1.3][tier], (k / 20) * Math.PI * 2 + R() * 0.2));
  }
  for (let k = 0; k < 4; k++) fronds.push(frond(2.6, 1.15, 0.2, (k / 4) * Math.PI * 2 + 0.4, 0.9));
  const crown = merge(fronds, { uv: true });
  crown.computeVertexNormals();
  // Coconuts under the crown.
  const nuts = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    nuts.push(new THREE.SphereGeometry(0.16, 10, 8).translate(0.9 + Math.cos(a) * 0.28, 7.72, Math.sin(a) * 0.28));
  }
  parts = {
    trunk,
    crown,
    nuts: merge(nuts),
    bark: new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 0.95 }),
    leaf: new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 }),
    nut: new THREE.MeshStandardMaterial({ color: '#6b8a2e', roughness: 0.7 }),
  };
  return parts;
}

// Palms at the given spots: [{ x, z, y?, yaw?, scale? }].
export function buildPalms(spots) {
  const P = parts || buildParts();
  const g = new THREE.Group();
  g.name = 'palms';
  if (!spots.length) return g;
  const trunks = new THREE.InstancedMesh(P.trunk, P.bark, spots.length);
  const crowns = new THREE.InstancedMesh(P.crown, P.leaf, spots.length);
  const nuts = new THREE.InstancedMesh(P.nuts, P.nut, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  spots.forEach((s, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw ?? 0);
    const k = s.scale ?? 1;
    m.compose(new THREE.Vector3(s.x, s.y ?? 0, s.z), q, new THREE.Vector3(k, k, k));
    trunks.setMatrixAt(i, m);
    crowns.setMatrixAt(i, m);
    nuts.setMatrixAt(i, m);
  });
  for (const mesh of [trunks, crowns, nuts]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  g.add(trunks, crowns, nuts);
  return g;
}
