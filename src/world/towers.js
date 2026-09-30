// Caspian Dawn's race control tower: a twisted twelve-sided glass shaft on a
// sandstone podium, an observation pod in two glass tiers under a crown of
// flame-shaped fins, a slim mast, and the live timing board. It keeps the
// Sky Circuit tower's walk-in sizes (deck floor at TOWER_H + 2.3, radius 7+).

import * as THREE from 'three';
import { bevelBox, merge, rod } from '../geo.js';
import { textTexture } from './world.js';
import { TOWER_H } from './circuit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });

// A prism of `sides` whose cross-section turns by `twist` radians from bottom
// to top, with radii given along the height (a smooth twisted shaft).
function twistedShaft(profile, sides, twist, segments = 40) {
  const pos = [];
  const idx = [];
  const H = profile[profile.length - 1][1];
  const radiusAt = (y) => {
    for (let i = 1; i < profile.length; i++) {
      const [r0, y0] = profile[i - 1];
      const [r1, y1] = profile[i];
      if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    }
    return profile[profile.length - 1][0];
  };
  const y0 = profile[0][1];
  for (let j = 0; j <= segments; j++) {
    const y = y0 + ((H - y0) * j) / segments;
    const r = radiusAt(y);
    const turn = (twist * (y - y0)) / (H - y0);
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2 + turn;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  }
  const row = sides + 1;
  for (let j = 0; j < segments; j++) {
    for (let k = 0; k < sides; k++) {
      const a = j * row + k;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const flat = g.toNonIndexed(); // crisp facets
  flat.computeVertexNormals();
  flat.userData = { radiusAt, turnAt: (y) => (twist * (y - y0)) / (H - y0) };
  return flat;
}

export function buildDawnTower() {
  const g = new THREE.Group();
  const H = TOWER_H;
  const sand = mat('#D9C29B', { roughness: 0.85 });
  const white = mat('#F3EFE6', { roughness: 0.4 });
  const bronze = new THREE.MeshStandardMaterial({ color: '#B98A4E', metalness: 0.75, roughness: 0.3 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#35577a', roughness: 0.06, metalness: 0.5, clearcoat: 1, envMapIntensity: 1.5 });
  const warmGlass = new THREE.MeshPhysicalMaterial({ color: '#f0b58a', emissive: '#ff9a5a', emissiveIntensity: 0.25, roughness: 0.08, metalness: 0.3, clearcoat: 1, transparent: true, opacity: 0.82 });

  // Plaza: stepped sandstone rings with a bronze inlay.
  const plaza = [];
  plaza.push(new THREE.CylinderGeometry(10.5, 11, 0.3, 64).translate(0, 0.15, 0));
  plaza.push(new THREE.CylinderGeometry(8.2, 8.6, 0.3, 64).translate(0, 0.45, 0));
  const plazaMesh = new THREE.Mesh(merge(plaza), sand);
  plazaMesh.receiveShadow = true;
  const inlay = new THREE.Mesh(new THREE.TorusGeometry(9.4, 0.08, 6, 96).rotateX(Math.PI / 2).translate(0, 0.31, 0), bronze);
  // Lobby: a glass drum with bronze fins, under a thin white canopy.
  const lobby = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 3.6, 48).translate(0, 2.4, 0), glass);
  const canopy = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.2, 0.35, 64).translate(0, 4.35, 0), white);
  const fins = [];
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2;
    fins.push(bevelBox(0.08, 3.6, 0.5, 0.02).rotateY(-a).translate(Math.cos(a) * 5.3, 2.4, Math.sin(a) * 5.3));
  }
  // Twisted shaft: glass between twisted white ribs.
  const prof = [[3.4, 4.5], [2.8, 11], [2.35, 18], [2.5, 22], [3.1, H]];
  const shaftGeo = twistedShaft(prof, 12, Math.PI / 3);
  const shaft = new THREE.Mesh(shaftGeo, glass);
  shaft.castShadow = true;
  const ribs = [];
  const { radiusAt, turnAt } = shaftGeo.userData;
  for (let k = 0; k < 12; k++) {
    let prev = null;
    for (let j = 0; j <= 24; j++) {
      const y = 4.5 + ((H - 4.5) * j) / 24;
      const a = (k / 12) * Math.PI * 2 + turnAt(y);
      const r = radiusAt(y) + 0.06;
      const p = V(Math.cos(a) * r, y, Math.sin(a) * r);
      if (prev) ribs.push(rod(prev, p, 0.11, 5));
      prev = p;
    }
  }
  // Floor bands every few meters.
  for (let y = 7; y < H - 1; y += 3.5) ribs.push(new THREE.TorusGeometry(radiusAt(y) + 0.05, 0.08, 5, 48).rotateX(Math.PI / 2).translate(0, y, 0));

  // Observation pod: a bronze underside, two glass tiers with a deck ring.
  const podBase = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 3.1, 2.3, 64).translate(0, H + 1.15, 0), white);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(7.8, 7.8, 0.25, 64).translate(0, H + 2.3, 0), white);
  const tier1 = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.8, 3.2, 64, 1, true).translate(0, H + 3.9, 0), glass);
  const mid = new THREE.Mesh(new THREE.CylinderGeometry(6.9, 6.6, 0.45, 64).translate(0, H + 5.7, 0), white);
  const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 6.1, 2.4, 64, 1, true).translate(0, H + 7.1, 0), warmGlass);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.4, 0.4, 64).translate(0, H + 8.5, 0), white);
  // Deck railing.
  const rail = [];
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    const b = ((k + 1) / 64) * Math.PI * 2;
    rail.push(rod(V(Math.cos(a) * 7.65, H + 3.35, Math.sin(a) * 7.65), V(Math.cos(b) * 7.65, H + 3.35, Math.sin(b) * 7.65), 0.04, 5));
    if (k % 2 === 0) rail.push(rod(V(Math.cos(a) * 7.65, H + 2.4, Math.sin(a) * 7.65), V(Math.cos(a) * 7.65, H + 3.35, Math.sin(a) * 7.65), 0.025, 4));
  }
  // Crown: flame-shaped fins curling up from the roof.
  const crown = [];
  const petal = (() => {
    const s = new THREE.Shape();
    s.moveTo(-0.9, 0);
    s.bezierCurveTo(-1.1, 2.2, -0.2, 3.6, 0.35, 5.2);
    s.bezierCurveTo(0.2, 3.4, 0.9, 2.2, 0.9, 0);
    s.lineTo(-0.9, 0);
    return new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 10 });
  })();
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const p = petal.clone().translate(0, 0, -0.09).rotateX(-0.22).rotateY(-a + Math.PI / 2).translate(Math.cos(a) * 5.1, H + 8.7, Math.sin(a) * 5.1);
    crown.push(p);
  }
  const crownMesh = new THREE.Mesh(merge(crown), bronze);
  crownMesh.castShadow = true;
  // Mast and beacon.
  const mast = [rod(V(0, H + 8.7, 0), V(0, H + 17, 0), 0.2, 10), rod(V(0, H + 17, 0), V(0, H + 21, 0), 0.07, 8)];
  const beaconMat = new THREE.MeshStandardMaterial({ color: '#ff3b30', emissive: '#ff3b30', emissiveIntensity: 2 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 10), beaconMat);
  beacon.position.set(0, H + 21.2, 0);

  // Race control sign round the lower tier, and the live timing board.
  const signTex = textTexture(['RACE CONTROL · CASPIAN DAWN'], { w: 2048, h: 128, bg: '#1B2233', fg: '#F7E3C4' });
  const sign = new THREE.Mesh(new THREE.CylinderGeometry(6.93, 6.93, 0.42, 64, 1, true, 0, Math.PI * 2), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.5 }));
  sign.position.y = H + 5.7;
  const { board, frame, draw } = timingBoard();
  board.position.set(0, 13, 3.1);
  frame.position.set(0, 13, 2.9);

  for (const m of [lobby, canopy, podBase, deck, mid, roof, frame]) m.castShadow = true;
  g.add(plazaMesh, inlay, lobby, canopy, new THREE.Mesh(merge(fins), bronze), shaft, new THREE.Mesh(merge(ribs), white), podBase, deck, tier1, mid, tier2, roof, new THREE.Mesh(merge(rail), bronze), crownMesh, new THREE.Mesh(merge(mast), bronze), beacon, sign, board, frame);
  g.userData.topY = H + 3.5;
  g.userData.drawBoard = draw;
  g.userData.update = (t) => {
    beaconMat.emissiveIntensity = Math.sin(t * 3) > 0.6 ? 4 : 0.6;
  };
  return g;
}

// The live timing board both towers carry (a canvas the game redraws).
export function timingBoard() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3, 6), new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.7, roughness: 0.4 }));
  board.rotation.x = 0.06;
  const frame = new THREE.Mesh(bevelBox(3.3, 6.3, 0.3, 0.05), mat('#1C1D20'));
  const draw = (rows) => {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0B111A';
    ctx.fillRect(0, 0, 256, 512);
    ctx.fillStyle = '#F4F5F7';
    ctx.font = '900 30px Nunito, Arial, sans-serif';
    ctx.fillText('LIVE', 18, 44);
    ctx.fillStyle = '#E03A3A';
    ctx.fillRect(96, 22, 12, 12);
    rows.slice(0, 8).forEach((r, i) => {
      const y = 92 + i * 52;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(10, y - 30, 236, 44);
      ctx.fillStyle = r.color;
      ctx.fillRect(10, y - 30, 8, 44);
      ctx.fillStyle = '#F4F5F7';
      ctx.font = '900 26px Nunito, Arial, sans-serif';
      ctx.fillText(`${i + 1}`, 28, y);
      ctx.font = '800 24px Nunito, Arial, sans-serif';
      ctx.fillText(r.label, 64, y);
    });
    tex.needsUpdate = true;
  };
  return { board, frame, draw };
}
