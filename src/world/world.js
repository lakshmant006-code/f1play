// Floating island world: main circuit island with track, pit lane, garages and
// grandstand; a podium island on a bridge; small decorative islands; clouds.

import * as THREE from 'three';
import { bevelBox, merge, tint, rod } from '../geo.js';
import { PALETTE, TEAMS, SCENERY } from '../data.js';
import { TRACK_WIDTH, PIT_WIDTH, PIT_Z, GARAGE_FRONT_Z, GARAGE_DEPTH, GARAGE_X } from '../game/layout.js';

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts });

// Seeded random so the world looks the same on every load.
function rng(seed = 7) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ---- Island shell ------------------------------------------------------------

// Shared grass texture: soft olive patches with a fine speckle, mapped in
// world meters (the extruded cap's UVs are the shape's x/z coordinates).
let grassTex = null;
function grassTexture() {
  if (grassTex) return grassTex;
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = SCENERY.grass;
  ctx.fillRect(0, 0, S, S);
  const r = rng(41);
  // Large soft patches, drawn wrapped so the tile repeats seamlessly.
  const blob = (x, y, rad, color, alpha) => {
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = alpha;
      ctx.fillStyle = g;
      ctx.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
    }
  };
  for (let i = 0; i < 26; i++) blob(r() * S, r() * S, 40 + r() * 110, i % 3 ? SCENERY.grassDark : SCENERY.grassLight, 0.35);
  for (let i = 0; i < 10; i++) blob(r() * S, r() * S, 30 + r() * 60, SCENERY.meadow, 0.3);
  ctx.globalAlpha = 1;
  for (let i = 0; i < 9000; i++) {
    const l = r();
    ctx.fillStyle = l < 0.5 ? 'rgba(40,62,26,0.22)' : 'rgba(170,190,110,0.18)';
    ctx.fillRect(r() * S, r() * S, 1.5, 1.5);
  }
  grassTex = new THREE.CanvasTexture(c);
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(1 / 90, 1 / 90);
  grassTex.colorSpace = THREE.SRGBColorSpace;
  grassTex.anisotropy = 8;
  return grassTex;
}

let islandMats = null;
export function islandMaterials() {
  if (islandMats) return islandMats;
  islandMats = {
    grass: new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 0.97 }),
    soil: new THREE.MeshStandardMaterial({ color: SCENERY.soil, roughness: 1 }),
    rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }),
  };
  return islandMats;
}

// Grass top over a band of soil, then a craggy rock underside that hangs in
// uneven lobes to a point, with dark strata toward the bottom.
export function buildIsland(outline, { depth = 30, seed = 1, grassH = 1.2 } = {}) {
  const rand = rng(seed);
  const M = islandMaterials();
  const g = new THREE.Group();
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, -p.y)));
  const top = new THREE.ExtrudeGeometry(shape, { depth: grassH, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.6, bevelSegments: 3, curveSegments: 4 });
  top.rotateX(-Math.PI / 2);
  top.translate(0, -grassH - 0.36, 0); // bevel adds 0.35 m above the slab; keep the top just under y = 0
  // Caps get grass, the extruded sides a soil band.
  const grass = new THREE.Mesh(top, [M.grass, M.soil]);
  grass.receiveShadow = true;
  g.add(grass);

  // Rock: noisy rings shrinking toward the centroid, pulled down in lobes.
  const c = outline.reduce((a, p) => a.add(p), new THREE.Vector2()).multiplyScalar(1 / outline.length);
  const rings = 9;
  const n = outline.length;
  const lobes = Array.from({ length: 5 }, () => ({ a: rand() * Math.PI * 2, w: 0.5 + rand() * 0.6, d: 0.25 + rand() * 0.45 }));
  const lobe = (ang) => lobes.reduce((m, l) => Math.max(m, l.d * Math.exp(-Math.pow(Math.atan2(Math.sin(ang - l.a), Math.cos(ang - l.a)) / l.w, 2))), 0);
  const pos = [];
  const idx = [];
  const rim = 0.93;
  for (let k = 0; k <= rings; k++) {
    const t = k / rings;
    for (let i = 0; i < n; i++) {
      const p = outline[i];
      const ang = Math.atan2(p.y - c.y, p.x - c.x);
      // A short near-vertical cliff under the soil band, then the taper.
      const shrink = k === 0 ? 1 : k === 1 ? rim : rim * (1 - Math.pow((t - 1 / rings) / (1 - 1 / rings), 0.75) * 0.96);
      const jitter = k <= 1 ? 1 : 0.86 + rand() * 0.24;
      const drop = k === 0 ? 0 : k === 1 ? depth * 0.08 : depth * (0.08 + t * (0.7 + lobe(ang)));
      pos.push(c.x + (p.x - c.x) * shrink * jitter, -grassH - 0.3 - drop + (k > 1 ? (rand() - 0.5) * depth * 0.06 : 0), c.y + (p.y - c.y) * shrink * jitter);
    }
  }
  pos.push(c.x, -grassH - depth * 1.2, c.y);
  const tip = pos.length / 3 - 1;
  for (let k = 0; k < rings; k++) {
    for (let i = 0; i < n; i++) {
      const a = k * n + i;
      const b = k * n + ((i + 1) % n);
      const cc = (k + 1) * n + i;
      const d = (k + 1) * n + ((i + 1) % n);
      idx.push(a, b, cc, b, d, cc);
    }
  }
  for (let i = 0; i < n; i++) idx.push(rings * n + i, rings * n + ((i + 1) % n), tip);
  let rock = new THREE.BufferGeometry();
  rock.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rock.setIndex(idx);
  rock = rock.toNonIndexed();
  rock.computeVertexNormals();
  const col = [];
  const top1 = new THREE.Color(SCENERY.soil);
  const mid = new THREE.Color(SCENERY.cliff);
  const dark = new THREE.Color(SCENERY.cliffDark);
  const p = rock.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = -p.getY(i);
    const t = Math.min(1, y / (depth * 1.1));
    const band = Math.sin(y * 1.3) * 0.05 + Math.sin(y * 0.37 + 1) * 0.05;
    const cc = y < grassH + 2 ? top1.clone() : mid.clone().lerp(dark, Math.min(1, t * 0.95 + band));
    col.push(cc.r, cc.g, cc.b);
  }
  rock.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const rockMesh = new THREE.Mesh(rock, M.rock);
  rockMesh.castShadow = true;
  g.add(rockMesh);
  return g;
}

// ---- Track surfaces ------------------------------------------------------------

function ribbon(path, halfWidth, y, { from = 0, to = path.length, step = 1, offset = 0 } = {}) {
  const pos = [];
  const uv = [];
  const idx = [];
  const s0 = from;
  const count = Math.max(2, Math.ceil((to - from) / step) + 1);
  const smp = {};
  for (let i = 0; i < count; i++) {
    const s = Math.min(to, s0 + i * step);
    path.at(s, smp);
    const nx = smp.tan.z;
    const nz = -smp.tan.x; // left normal (+x of heading)
    const cx = smp.pos.x + nx * offset;
    const cz = smp.pos.z + nz * offset;
    pos.push(cx + nx * halfWidth, y, cz + nz * halfWidth, cx - nx * halfWidth, y, cz - nz * halfWidth);
    uv.push(0, s / 4, 1, s / 4);
    if (i) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Ensure up-facing normals regardless of winding.
  const nrm = g.attributes.normal;
  if (nrm.getY(0) < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
    g.computeVertexNormals();
  }
  return g;
}

function asphaltTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = PALETTE.asphalt;
  ctx.fillRect(0, 0, 256, 256);
  const r = rng(3);
  for (let i = 0; i < 2500; i++) {
    const v = 50 + r() * 30;
    ctx.fillStyle = `rgba(${v},${v + 2},${v + 6},0.35)`;
    ctx.fillRect(r() * 256, r() * 256, 1.5, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildTrackMeshes(track, pit, onIsland = () => true) {
  const g = new THREE.Group();
  const asphalt = asphaltTexture();
  const trackMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.88 });
  const road = new THREE.Mesh(ribbon(track, TRACK_WIDTH / 2, 0.03, { step: 1 }), trackMat);
  road.receiveShadow = true;
  g.add(road);
  // Edge lines.
  const lineMat = mat(PALETTE.kerbWhite, { roughness: 0.6 });
  for (const s of [1, -1]) {
    const line = new THREE.Mesh(ribbon(track, 0.12, 0.045, { step: 1, offset: s * (TRACK_WIDTH / 2 - 0.35) }), lineMat);
    line.receiveShadow = true;
    g.add(line);
  }

  // Pit lane surface and lines.
  const pitRoad = new THREE.Mesh(ribbon(pit, PIT_WIDTH / 2, 0.025, { from: 6, to: pit.length - 6 }), trackMat);
  pitRoad.receiveShadow = true;
  g.add(pitRoad);
  for (const s of [1, -1]) {
    g.add(new THREE.Mesh(ribbon(pit, 0.1, 0.04, { from: 14, to: pit.length - 14, offset: s * (PIT_WIDTH / 2 - 0.2) }), lineMat));
  }

  // Kerbs: alternating red/white blocks on corner edges (one instanced draw call).
  const kerbSpots = [];
  const smp = {};
  for (let s = 0; s < track.length; s += 1.6) {
    track.at(s, smp);
    if (Math.abs(smp.curv) < 0.035) continue;
    const inside = Math.sign(smp.curv); // +1: left side is inside
    for (const side of [inside, -inside]) {
      if (side === -inside && Math.abs(smp.curv) < 0.06) continue;
      kerbSpots.push({ pos: smp.pos.clone(), tan: smp.tan.clone(), side, red: Math.round(s / 1.6) % 2 === 0 });
    }
  }
  const kerbGeo = bevelBox(1.0, 0.08, 1.55, 0.02);
  const kerbs = new THREE.InstancedMesh(kerbGeo, mat('#ffffff', { roughness: 0.6 }), kerbSpots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  kerbSpots.forEach((k, i) => {
    const nx = k.tan.z;
    const nz = -k.tan.x;
    const off = k.side * (TRACK_WIDTH / 2 + 0.4);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(k.tan.x, k.tan.z));
    m.compose(new THREE.Vector3(k.pos.x + nx * off, 0.04, k.pos.z + nz * off), q, new THREE.Vector3(1, 1, 1));
    kerbs.setMatrixAt(i, m);
    kerbs.setColorAt(i, col.set(k.red ? PALETTE.kerbRed : PALETTE.kerbWhite));
  });
  kerbs.receiveShadow = true;
  g.add(kerbs);

  // Tire walls on the outside of corners, kept clear of the rest of the track.
  const walls = [];
  for (let s = 0; s < track.length; s += 0.8) {
    track.at(s, smp);
    if (Math.abs(smp.curv) < 0.05) continue;
    const out = -Math.sign(smp.curv);
    const nx = smp.tan.z;
    const nz = -smp.tan.x;
    const off = out * (TRACK_WIDTH / 2 + 5.5);
    const p = new THREE.Vector3(smp.pos.x + nx * off, 0, smp.pos.z + nz * off);
    let clear = true;
    for (let i = 0; i < track.n && clear; i += 4) if (track.pos[i].distanceTo(p) < TRACK_WIDTH / 2 + 4.5) clear = false;
    for (let i = 0; i < pit.n && clear; i += 4) if (pit.pos[i].distanceTo(p) < PIT_WIDTH / 2 + 3) clear = false;
    if (clear && onIsland(p.x, p.z)) walls.push({ p, a: Math.atan2(smp.tan.x, smp.tan.z) });
  }
  const tireGeo = new THREE.TorusGeometry(0.36, 0.17, 6, 12).rotateX(Math.PI / 2);
  const tires = new THREE.InstancedMesh(tireGeo, mat(PALETTE.barrier, { roughness: 0.9 }), walls.length * 3);
  let ti = 0;
  for (const w of walls) {
    for (let h = 0; h < 3; h++) {
      m.makeTranslation(w.p.x, 0.17 + h * 0.3, w.p.z);
      tires.setMatrixAt(ti, m);
      tires.setColorAt(ti++, col.set(h === 1 ? '#3d4452' : PALETTE.barrier));
    }
  }
  tires.castShadow = true;
  tires.receiveShadow = true;
  g.add(tires);

  // Start/finish checker line on the main straight.
  const cc = document.createElement('canvas');
  cc.width = 64;
  cc.height = 16;
  const cx = cc.getContext('2d');
  for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
    cx.fillStyle = (x + y) % 2 ? '#111' : '#f2f2ee';
    cx.fillRect(x * 4, y * 4, 4, 4);
  }
  const ct = new THREE.CanvasTexture(cc);
  ct.magFilter = THREE.NearestFilter;
  ct.colorSpace = THREE.SRGBColorSpace;
  const start = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_WIDTH - 0.6, 1.2).rotateX(-Math.PI / 2).rotateY(Math.PI / 2), new THREE.MeshStandardMaterial({ map: ct, roughness: 0.7 }));
  start.position.set(-10, 0.05, -35);
  g.add(start);

  // Grid boxes.
  const gridGeo = [];
  for (let i = 0; i < 6; i++) {
    const x = -18 - i * 7;
    const z = -35 + (i % 2 ? -2.6 : 2.6);
    gridGeo.push(new THREE.PlaneGeometry(0.15, 2.2).rotateX(-Math.PI / 2).translate(x, 0.05, z));
    gridGeo.push(new THREE.PlaneGeometry(1.2, 0.15).rotateX(-Math.PI / 2).translate(x - 0.6, 0.05, z - 1.05));
    gridGeo.push(new THREE.PlaneGeometry(1.2, 0.15).rotateX(-Math.PI / 2).translate(x - 0.6, 0.05, z + 1.05));
  }
  g.add(new THREE.Mesh(merge(gridGeo), lineMat));
  return g;
}

// ---- Buildings -------------------------------------------------------------------

function textTexture(lines, { w = 512, h = 128, bg = '#fff', fg = '#111', font = 'Nunito, Arial, sans-serif', weight = 900 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lh = h / lines.length;
  lines.forEach((l, i) => {
    ctx.font = `${weight} ${lh * 0.62}px ${font}`;
    ctx.fillText(l, w / 2, lh * (i + 0.5));
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildPitBuilding() {
  const g = new THREE.Group();
  const canopy = mat(PALETTE.canopy, { roughness: 0.5 });
  const x0 = -34;
  const x1 = 34;
  const zf = GARAGE_FRONT_Z;
  const zb = zf - GARAGE_DEPTH;
  const h = 5.2;
  const walls = [];
  // Back wall, roof slab with overhang, dividers between garages.
  walls.push(bevelBox(x1 - x0, h, 0.4, 0.05).translate(0, h / 2, zb));
  walls.push(bevelBox(x1 - x0 + 1, 0.5, GARAGE_DEPTH + 2.6, 0.12).translate(0, h + 0.25, (zf + zb) / 2 + 1.1));
  const dividers = [x0, ...GARAGE_X.slice(0, -1).map((x, i) => (x + GARAGE_X[i + 1]) / 2), x1];
  for (const x of dividers) walls.push(bevelBox(0.5, h, GARAGE_DEPTH, 0.05).translate(x, h / 2, (zf + zb) / 2));
  // Upper floor (hospitality) with windows band.
  walls.push(bevelBox(x1 - x0, 3.2, GARAGE_DEPTH - 2, 0.1).translate(0, h + 2.1, (zf + zb) / 2 - 1));
  const shell = new THREE.Mesh(merge(walls), canopy);
  shell.castShadow = true;
  shell.receiveShadow = true;
  g.add(shell);
  const glass = new THREE.Mesh(bevelBox(x1 - x0 - 1, 1.6, 0.1, 0.03).translate(0, h + 2.2, (zf + zb) / 2 + GARAGE_DEPTH / 2 - 0.95), new THREE.MeshStandardMaterial({ color: '#3b6f8f', roughness: 0.1, metalness: 0.6 }));
  g.add(glass);
  // Sky Circuit mark on the roof front.
  const markTex = textTexture(['SKY CIRCUIT'], { w: 1024, h: 96, bg: '#0E1B2B', fg: '#F4F5F7' });
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(22, 2.06), new THREE.MeshStandardMaterial({ map: markTex, roughness: 0.6 }));
  mark.position.set(0, h + 2.2, (zf + zb) / 2 + GARAGE_DEPTH / 2 - 0.88);
  g.add(mark);

  // Per-team garage interiors: floor, back wall in team color, name header.
  TEAMS.forEach((t, i) => {
    const x = GARAGE_X[i];
    const inner = new THREE.Group();
    const floor = new THREE.Mesh(bevelBox(12, 0.06, GARAGE_DEPTH - 0.4, 0.02).translate(0, 0.03, (zf + zb) / 2), mat('#d9dbe0', { roughness: 0.4 }));
    floor.receiveShadow = true;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(12, h - 0.2).translate(0, h / 2, zb + 0.22), mat(t.primary, { roughness: 0.7 }));
    const header = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 1.1),
      new THREE.MeshStandardMaterial({ map: textTexture([t.name.toUpperCase()], { bg: t.primary, fg: t.secondary === '#F5FAFA' ? '#F5FAFA' : t.accent }), roughness: 0.6 })
    );
    header.position.set(0, h - 0.4, zf + 1.3 + 0.01);
    const headerBack = new THREE.Mesh(bevelBox(10.4, 1.3, 0.2, 0.04).translate(0, h - 0.4, zf + 1.2), mat(t.secondary, { roughness: 0.5 }));
    // Tool chests along the back wall.
    const chests = new THREE.Mesh(merge([bevelBox(1.4, 1.0, 0.6, 0.04).translate(-4, 0.5, zb + 0.6), bevelBox(1.4, 1.0, 0.6, 0.04).translate(4, 0.5, zb + 0.6), bevelBox(2.2, 0.9, 0.7, 0.04).translate(0, 0.45, zb + 0.6)]), mat(t.secondary === '#F5FAFA' ? t.accent : t.secondary, { roughness: 0.5, metalness: 0.2 }));
    chests.castShadow = true;
    inner.add(floor, back, header, headerBack, chests);
    inner.position.x = x;
    g.add(inner);
  });

  // Pit wall with a dark fence top, and box marks in each team's slot.
  const wall = new THREE.Mesh(bevelBox(100, 1.0, 0.6, 0.08).translate(0, 0.5, PIT_Z + PIT_WIDTH / 2 + 1.2), canopy);
  wall.castShadow = true;
  wall.receiveShadow = true;
  g.add(wall);
  const fencePosts = [];
  for (let x = -49; x <= 49; x += 3) fencePosts.push(rod(new THREE.Vector3(x, 1, PIT_Z + PIT_WIDTH / 2 + 1.2), new THREE.Vector3(x, 3.2, PIT_Z + PIT_WIDTH / 2 + 1.2), 0.04, 5));
  fencePosts.push(bevelBox(100, 0.05, 0.05, 0.01).translate(0, 3.2, PIT_Z + PIT_WIDTH / 2 + 1.2));
  g.add(new THREE.Mesh(merge(fencePosts), mat(PALETTE.barrier, { roughness: 0.5, metalness: 0.5 })));
  const netMat = new THREE.MeshStandardMaterial({ color: PALETTE.barrier, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(98, 2.2).translate(0, 2.1, PIT_Z + PIT_WIDTH / 2 + 1.2), netMat));

  const marks = [];
  for (const x of GARAGE_X) {
    marks.push(new THREE.PlaneGeometry(5.2, 0.15).rotateX(-Math.PI / 2).translate(x, 0.05, PIT_Z - 1.1));
    marks.push(new THREE.PlaneGeometry(5.2, 0.15).rotateX(-Math.PI / 2).translate(x, 0.05, PIT_Z + 1.1));
    marks.push(new THREE.PlaneGeometry(0.15, 2.3).rotateX(-Math.PI / 2).translate(x + 2.6, 0.05, PIT_Z));
  }
  g.add(new THREE.Mesh(merge(marks), mat('#F5C518', { roughness: 0.6 })));
  return g;
}

// Podium stage: navy platform with gold trim and front stairs, stepped
// podium 1-3, a curved backdrop with an LED band, a box-truss arch overhead
// and team flags behind.
export function buildPodium() {
  const g = new THREE.Group();
  const stageH = 0.6;
  const navy = mat('#16202E', { roughness: 0.6 });
  const gold = new THREE.MeshStandardMaterial({ color: '#D6B24C', metalness: 0.85, roughness: 0.25 });
  const white = mat('#F2F0EB', { roughness: 0.35 });
  const steel = new THREE.MeshStandardMaterial({ color: '#C9CED6', metalness: 0.7, roughness: 0.3 });

  // Stage and stairs.
  const stage = new THREE.Mesh(bevelBox(13, stageH, 8, 0.08).translate(0, stageH / 2, -0.6), navy);
  stage.castShadow = stage.receiveShadow = true;
  const trim = new THREE.Mesh(merge([bevelBox(13.1, 0.08, 0.1, 0.02).translate(0, stageH, 3.42), bevelBox(0.1, 0.08, 8.1, 0.02).translate(6.52, stageH, -0.6), bevelBox(0.1, 0.08, 8.1, 0.02).translate(-6.52, stageH, -0.6)]), gold);
  const stairs = [];
  for (let k = 0; k < 3; k++) stairs.push(bevelBox(4, stageH * ((k + 1) / 3), 0.45, 0.03).translate(0, (stageH * ((k + 1) / 3)) / 2, 4.55 - k * 0.45));
  const stairMesh = new THREE.Mesh(merge(stairs), navy);
  stairMesh.receiveShadow = true;
  g.add(stage, trim, stairMesh);

  // Steps 1-3.
  const heights = { 1: 1.2, 2: 0.8, 3: 0.5 };
  const xs = { 1: 0, 2: -2.3, 3: 2.3 };
  for (const n of [1, 2, 3]) {
    const s = new THREE.Mesh(bevelBox(2.2, heights[n], 1.9, 0.06), white);
    s.position.set(xs[n], stageH + heights[n] / 2, 0);
    s.castShadow = s.receiveShadow = true;
    const band = new THREE.Mesh(bevelBox(2.24, 0.1, 1.94, 0.02), gold);
    band.position.set(xs[n], stageH + heights[n] - 0.065, 0);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshStandardMaterial({ map: textTexture([String(n)], { w: 128, h: 80, bg: '#F2F0EB', fg: '#16202E' }) }));
    label.position.set(xs[n], stageH + heights[n] / 2, 0.955);
    g.add(s, band, label);
  }

  // Curved backdrop with a glowing LED band and the Sky Circuit mark.
  const R = 9;
  const arc = 0.9;
  const backGeo = new THREE.CylinderGeometry(R, R, 4.2, 40, 1, true, Math.PI - arc / 2, arc);
  const back = new THREE.Mesh(backGeo, new THREE.MeshStandardMaterial({ color: '#16202E', side: THREE.DoubleSide, roughness: 0.55 }));
  back.position.set(0, stageH + 2.1, R - 3.3);
  back.castShadow = true;
  const markTex = textTexture(['SKY CIRCUIT'], { w: 1024, h: 128, bg: '#16202E', fg: '#F4F5F7' });
  const mark = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.05, R - 0.05, 1.1, 40, 1, true, Math.PI - arc * 0.32, arc * 0.64), new THREE.MeshStandardMaterial({ map: markTex, side: THREE.BackSide, roughness: 0.5 }));
  mark.position.copy(back.position).add(new THREE.Vector3(0, 0.9, 0));
  const ledMat = new THREE.MeshStandardMaterial({ color: '#F5C518', emissive: '#F5C518', emissiveIntensity: 1.4, side: THREE.BackSide });
  const led = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.06, R - 0.06, 0.12, 40, 1, true, Math.PI - arc / 2, arc), ledMat);
  led.position.copy(back.position).add(new THREE.Vector3(0, -0.4, 0));
  // Mark reads from the front: flip it so the text isn't mirrored on the inside face.
  mark.scale.x = -1;
  g.add(back, mark, led);

  // Box-truss arch over the stage.
  const truss = [];
  const legs = [-6.2, 6.2];
  const topY = stageH + 6.2;
  const boxTruss = (a, b, w = 0.35) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const up = Math.abs(dir.y) > len * 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const s1 = new THREE.Vector3().crossVectors(dir, up).normalize().multiplyScalar(w / 2);
    const s2 = new THREE.Vector3().crossVectors(dir, s1).normalize().multiplyScalar(w / 2);
    const corners = [s1.clone().add(s2), s1.clone().sub(s2), s1.clone().negate().sub(s2), s1.clone().negate().add(s2)];
    for (const c of corners) truss.push(rod(a.clone().add(c), b.clone().add(c), 0.035, 5));
    const n = Math.max(2, Math.round(len / 0.7));
    for (let k = 0; k < n; k++) {
      const p0 = a.clone().lerp(b, k / n);
      const p1 = a.clone().lerp(b, (k + 1) / n);
      truss.push(rod(p0.clone().add(corners[k % 4]), p1.clone().add(corners[(k + 1) % 4]), 0.02, 4));
    }
  };
  for (const x of legs) boxTruss(new THREE.Vector3(x, stageH, -3.4), new THREE.Vector3(x, topY, -3.4));
  boxTruss(new THREE.Vector3(legs[0], topY, -3.4), new THREE.Vector3(legs[1], topY, -3.4));
  for (const x of legs) boxTruss(new THREE.Vector3(x, topY, -3.4), new THREE.Vector3(x, topY, 2.4));
  boxTruss(new THREE.Vector3(legs[0], topY, 2.4), new THREE.Vector3(legs[1], topY, 2.4));
  const trussMesh = new THREE.Mesh(merge(truss), steel);
  trussMesh.castShadow = true;
  g.add(trussMesh);
  // Spot lights hanging from the front beam.
  for (let k = -2; k <= 2; k++) {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.4, 10).rotateX(0.7), mat('#1C1D20'));
    can.position.set(k * 2.2, topY - 0.45, 2.4);
    g.add(can);
  }

  // Team flags behind the backdrop.
  const poles = [];
  TEAMS.forEach((t, k) => {
    const x = -5 + k * 2.5;
    poles.push(rod(new THREE.Vector3(x, 0, -5.2), new THREE.Vector3(x, 8, -5.2), 0.05, 6));
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1, 4, 1).translate(0.8, 0, 0), new THREE.MeshStandardMaterial({ color: t.primary, side: THREE.DoubleSide, roughness: 0.7 }));
    f.position.set(x, 7.4, -5.2);
    f.rotation.y = 0.2;
    g.add(f);
  });
  g.add(new THREE.Mesh(merge(poles), steel));

  g.userData.stepTop = (n) => new THREE.Vector3(xs[n], stageH + heights[n], 0);
  return g;
}

// Soft cumulus: smooth puffs with flat, grey-shaded bottoms, drifting slowly
// around and between the islands.
export function buildClouds(rand = rng(21)) {
  const g = new THREE.Group();
  const puff = new THREE.IcosahedronGeometry(1, 2);
  const pp = puff.attributes.position;
  const colors = [];
  const hi = new THREE.Color('#FBF8F2');
  const lo = new THREE.Color('#BFC2C4');
  for (let i = 0; i < pp.count; i++) {
    const y = pp.getY(i);
    if (y < -0.25) pp.setY(i, -0.25 - (y + 0.25) * 0.15); // flatten the base
    const c = lo.clone().lerp(hi, Math.min(1, Math.max(0, (y + 0.4) / 1.1)));
    colors.push(c.r, c.g, c.b);
  }
  puff.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  puff.computeVertexNormals();
  const count = 30;
  const per = 7;
  const inst = new THREE.InstancedMesh(puff, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: '#F2EBDD', emissiveIntensity: 0.35 }), count * per);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const clouds = [];
  for (let k = 0; k < count; k++) {
    const a = rand() * Math.PI * 2;
    const r = 130 + rand() * 210;
    const y = -30 + rand() * 75;
    const size = 5 + rand() * 8;
    const parts = [];
    for (let p = 0; p < per; p++) {
      const t = (p - (per - 1) / 2) / ((per - 1) / 2);
      parts.push({ dx: t * size * 1.6 + (rand() - 0.5) * size * 0.4, dy: (1 - t * t) * size * 0.55 + rand() * size * 0.15, dz: (rand() - 0.5) * size * 0.9, s: size * (0.55 + (1 - Math.abs(t)) * 0.55 + rand() * 0.2) });
    }
    clouds.push({ cx: Math.cos(a) * r, cy: y, cz: Math.sin(a) * r, parts, speed: 0.4 + rand() * 0.6 });
  }
  const place = (t) => {
    let j = 0;
    for (const cl of clouds) {
      const ox = Math.sin(t * 0.01 * cl.speed + cl.cx) * 6;
      for (const p of cl.parts) {
        q.identity();
        m.compose(new THREE.Vector3(cl.cx + p.dx + ox, cl.cy + p.dy, cl.cz + p.dz), q, new THREE.Vector3(p.s, p.s * 0.72, p.s));
        inst.setMatrixAt(j++, m);
      }
    }
    inst.instanceMatrix.needsUpdate = true;
  };
  place(0);
  g.add(inst);
  g.userData.update = place;
  return g;
}

export function buildSky() {
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(SCENERY.skyTop) }, mid: { value: new THREE.Color(SCENERY.skyMid) }, bottom: { value: new THREE.Color(SCENERY.skyLow) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader:
      'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.7)) : mix(mid, bottom, pow(-h, 0.6)); gl_FragColor = vec4(c, 1.0);\n#include <colorspace_fragment>\n}',
  });
  const sky = new THREE.Mesh(geo, m);
  sky.renderOrder = -1;
  return sky;
}

export { rng, textTexture };
