// Team pit wall decks: four covered stands side by side between the pit wall
// and the pit lane, facing the track (after the pit wall photo). Each has a
// raised platform with team-colored base panels, a desk with two monitors per
// seat and an overhead row, a roof with a team-colored edge and the team name
// board facing the pit lane, glass end panels, stools and hoop railings.

import * as THREE from 'three';
import { bevelBox, merge, rod } from '../geo.js';
import { textTexture } from './world.js';
import { DECK_W, DECK_D, DECK_H } from '../game/layout.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });

export const SEATS = 5;
export const SEAT_H = 0.75; // stool top above the deck
// Seat positions in deck space (x across, z toward the track).
export const seatPos = (i) => V(-3.6 + i * 1.8, DECK_H + SEAT_H, 0.05);

export function buildPitWallDeck(team) {
  const g = new THREE.Group();
  g.name = `pitwall_${team.id}`;
  const W = DECK_W;
  const D = DECK_D;
  const front = D / 2; // track side (+z)
  const back = -D / 2; // pit lane side
  const dark = mat('#26292f', { roughness: 0.55 });
  const trim = mat(team.primary, { roughness: 0.45 });
  const accent = mat(team.accent === '#151515' ? team.secondary : team.accent, { roughness: 0.4 });

  // Platform and team-colored base panels on both long sides.
  const base = [bevelBox(W, DECK_H, D, 0.04).translate(0, DECK_H / 2, 0)];
  g.add(new THREE.Mesh(merge(base), dark));
  const panels = [];
  for (const z of [back - 0.01, front + 0.01]) panels.push(new THREE.BoxGeometry(W - 0.1, DECK_H * 0.7, 0.03).translate(0, DECK_H * 0.5, z));
  g.add(new THREE.Mesh(merge(panels), trim));

  // Desk: counter, front modesty panel and a cable tray.
  const desk = [
    bevelBox(W - 0.4, 0.08, 0.72, 0.02).translate(0, DECK_H + 1.0, 0.95),
    bevelBox(W - 0.4, 1.0, 0.08, 0.02).translate(0, DECK_H + 0.5, 1.3),
  ];
  const deskMesh = new THREE.Mesh(merge(desk), dark);
  deskMesh.castShadow = true;
  g.add(deskMesh);

  // Monitors: two per seat on the desk, one per seat hanging from the roof.
  // Screens show live-looking timing: lap traces, sector bars and a map,
  // tinted with the team color.
  const screenTex = timingTexture(team.primary);
  const screenMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: screenTex, emissive: '#ffffff', emissiveMap: screenTex, emissiveIntensity: 0.35, roughness: 0.25 });
  const bezels = [];
  const screens = [];
  for (let i = 0; i < SEATS; i++) {
    const x = seatPos(i).x;
    for (const dx of [-0.36, 0.36]) {
      bezels.push(bevelBox(0.66, 0.44, 0.05, 0.01).rotateX(-0.12).rotateY(-dx * 0.5).translate(x + dx, DECK_H + 1.36, 1.1));
      screens.push(new THREE.PlaneGeometry(0.6, 0.38).rotateX(-0.12).rotateY(-dx * 0.5).translate(x + dx, DECK_H + 1.36, 1.073));
    }
    bezels.push(bevelBox(0.7, 0.42, 0.05, 0.01).rotateX(0.25).translate(x, DECK_H + 2.35, 1.2));
    screens.push(new THREE.PlaneGeometry(0.64, 0.36).rotateY(Math.PI).rotateX(-0.25).translate(x, DECK_H + 2.35, 1.17));
  }
  g.add(new THREE.Mesh(merge(bezels), mat('#111317', { roughness: 0.4 })));
  // Screens show on both sides so they read from the seats and the track.
  screenMat.side = THREE.DoubleSide;
  g.add(new THREE.Mesh(merge(screens), screenMat));

  // Posts and roof with a team-colored edge.
  const roofY = DECK_H + 2.95;
  const posts = [];
  for (const x of [-W / 2 + 0.15, W / 2 - 0.15]) for (const z of [back + 0.15, front - 0.1]) posts.push(bevelBox(0.14, roofY - DECK_H, 0.14, 0.02).translate(x, DECK_H + (roofY - DECK_H) / 2, z));
  g.add(new THREE.Mesh(merge(posts), dark));
  const roof = new THREE.Mesh(bevelBox(W + 0.3, 0.22, D + 0.5, 0.04).translate(0, roofY + 0.11, 0.1), dark);
  roof.castShadow = true;
  const edge = new THREE.Mesh(
    merge([
      bevelBox(W + 0.42, 0.14, 0.12, 0.02).translate(0, roofY + 0.24, 0.1 + (D + 0.5) / 2),
      bevelBox(W + 0.42, 0.14, 0.12, 0.02).translate(0, roofY + 0.24, 0.1 - (D + 0.5) / 2),
      bevelBox(0.12, 0.14, D + 0.62, 0.02).translate(W / 2 + 0.15, roofY + 0.24, 0.1),
      bevelBox(0.12, 0.14, D + 0.62, 0.02).translate(-W / 2 - 0.15, roofY + 0.24, 0.1),
    ]),
    accent
  );
  g.add(roof, edge);
  // Team name board under the roof, facing the pit lane.
  const nameTex = textTexture([team.name.toUpperCase()], { w: 1024, h: 128, bg: '#16181c', fg: '#F4F5F7' });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.4, 0.55), new THREE.MeshStandardMaterial({ map: nameTex, roughness: 0.5 }));
  board.rotation.y = Math.PI;
  board.position.set(0, roofY - 0.3, back + 0.05);
  const boardBack = new THREE.Mesh(bevelBox(W - 0.3, 0.62, 0.08, 0.02).translate(0, roofY - 0.3, back + 0.1), dark);
  g.add(boardBack, board);

  // Glass end panels tinted with the team color.
  const glassMat = new THREE.MeshPhysicalMaterial({ color: team.primary, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(D - 0.3, roofY - DECK_H - 0.2), glassMat);
    gl.rotation.y = Math.PI / 2;
    gl.position.set(s * (W / 2 - 0.05), DECK_H + (roofY - DECK_H) / 2, 0);
    g.add(gl);
  }

  // High chairs: a padded seat and a team-colored backrest on a steel column.
  const stools = [];
  const backs = [];
  for (let i = 0; i < SEATS; i++) {
    const p = seatPos(i);
    stools.push(new THREE.CylinderGeometry(0.22, 0.2, 0.09, 20).translate(p.x, p.y - 0.045, p.z));
    stools.push(new THREE.CylinderGeometry(0.035, 0.035, SEAT_H - 0.08, 10).translate(p.x, DECK_H + (SEAT_H - 0.08) / 2, p.z));
    stools.push(new THREE.CylinderGeometry(0.22, 0.24, 0.03, 20).translate(p.x, DECK_H + 0.02, p.z));
    stools.push(new THREE.TorusGeometry(0.18, 0.015, 6, 20).rotateX(Math.PI / 2).translate(p.x, DECK_H + 0.3, p.z));
    stools.push(rod(V(p.x, p.y, p.z - 0.2), V(p.x, p.y + 0.35, p.z - 0.24), 0.02, 6));
    backs.push(bevelBox(0.4, 0.3, 0.06, 0.025).rotateX(-0.12).translate(p.x, p.y + 0.42, p.z - 0.25));
  }
  g.add(new THREE.Mesh(merge(stools), mat('#15161a', { roughness: 0.4, metalness: 0.3 })));
  g.add(new THREE.Mesh(merge(backs), trim));
  // A glowing team-colored strip under the roof edge, facing the track.
  const glow = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.05, 0.05).translate(0, DECK_H + 2.82, front + 0.25), new THREE.MeshStandardMaterial({ color: team.primary, emissive: team.primary, emissiveIntensity: 1.6 }));
  g.add(glow);

  // Hoop railings along the pit lane side.
  const rails = [];
  const n = 4;
  for (let k = 0; k < n; k++) {
    const x0 = -W / 2 + 0.6 + k * ((W - 1.2) / n);
    const x1 = x0 + (W - 1.2) / n - 0.5;
    const z = back - 0.55;
    rails.push(rod(V(x0, 0, z), V(x0, 1.0, z), 0.03, 6), rod(V(x1, 0, z), V(x1, 1.0, z), 0.03, 6), rod(V(x0, 1.0, z), V(x1, 1.0, z), 0.03, 6));
  }
  g.add(new THREE.Mesh(merge(rails), mat('#C9CED6', { metalness: 0.6, roughness: 0.3 })));

  g.traverse((o) => {
    if (o.isMesh && !o.material.transparent) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  g.userData.screenMat = screenMat;
  return g;
}

// Timing screen art: dark panel, lap-time traces, sector bars and a track map.
function timingTexture(color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const x = c.getContext('2d');
  x.fillStyle = '#0b1018';
  x.fillRect(0, 0, 256, 160);
  x.strokeStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 256; i += 32) x.strokeRect(i, 0, 32, 160);
  const trace = (col, seed, y0) => {
    x.strokeStyle = col;
    x.lineWidth = 2.5;
    x.beginPath();
    for (let i = 0; i <= 24; i++) {
      const y = y0 + Math.sin(i * 0.9 + seed) * 10 + Math.sin(i * 0.37 + seed * 2) * 6;
      i ? x.lineTo(i * 6 + 6, y) : x.moveTo(6, y);
    }
    x.stroke();
  };
  trace(color, 1, 48);
  trace('#e8edf4', 3, 70);
  trace('#35d45a', 5, 100);
  ['#b25cff', '#35d45a', '#F5C518'].forEach((col, i) => {
    x.fillStyle = col;
    x.fillRect(10 + i * 50, 130, 44, 14);
  });
  x.strokeStyle = color;
  x.lineWidth = 3;
  x.beginPath();
  x.ellipse(206, 60, 34, 22, 0.4, 0, Math.PI * 2);
  x.stroke();
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.arc(230, 52, 4, 0, Math.PI * 2);
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
