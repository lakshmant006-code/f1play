// The circuit as four floating islands joined by track bridges:
//   pit island        main straight, pit lane, garages, start gantry
//   grandstand island the eastern corner with a covered grandstand and crowd
//   tower island      race control watch tower in the infield
//   podium island     the celebration podium beside the track
// Island shapes follow the track: every ground cell belongs to the island that
// owns the nearest stretch of track, and cells nearest a bridge stretch are sky.

import * as THREE from 'three';
import { bevelBox, merge, tint, rod } from '../geo.js';
import { PALETTE, TEAMS } from '../data.js';
import { TRACK_WIDTH } from '../game/layout.js';
import { buildIsland, textTexture } from './world.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });

// Track stretches (s in meters from the start line) owned by each island; the
// gaps between them are bridges.
export const ISLANDS = [
  { id: 'pit', name: 'Pit island', arcs: [[412, 443.4], [0, 138]], depth: 55 },
  { id: 'grandstand', name: 'Grandstand island', arcs: [[178, 228]], depth: 36 },
  { id: 'tower', name: 'Watch tower island', arcs: [[262, 312]], depth: 40 },
  { id: 'podium', name: 'Podium island', arcs: [[340, 384]], depth: 34 },
];
export const BRIDGES = [[138, 178], [228, 262], [312, 340], [384, 412]];

// Landmark placement (world meters).
export const LANDMARKS = {
  grandstand: { x: 62, z: 0.5, rot: 0, len: 28 },
  tower: { x: -6, z: 26 },
  podium: { x: -92, z: 22, rot: Math.PI / 2 },
};

const inArc = (s, [a, b]) => s >= a && s <= b;

// Dimensions the walk mode needs to stand on these structures.
export const STAND = { rows: 12, rowD: 0.9, rowH: 0.45, base: 1.2 };
export const TOWER_H = 26;

// ---- Island shapes from a ground mask ---------------------------------------------------

export function buildIslandShapes(track, pit, extras) {
  const CELL = 1.2;
  const MARGIN = 15.5;
  const CLEAR = 4; // sky channel between neighbouring islands
  const x0 = -130;
  const z0 = -95;
  const W = Math.ceil(260 / CELL);
  const H = Math.ceil(200 / CELL);
  // Track samples every 2 m tagged with their owner (-1 = bridge).
  const samples = [];
  for (let s = 0; s < track.length; s += 2) {
    const p = track.at(s).pos;
    const owner = ISLANDS.findIndex((isl) => isl.arcs.some((a) => inArc(s, a)));
    samples.push({ x: p.x, z: p.z, owner });
  }
  const owners = new Int8Array(W * H).fill(-1);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = x0 + i * CELL;
      const z = z0 + j * CELL;
      // Explicit extras (pit building, landmarks) win.
      let owner = -1;
      for (const e of extras) {
        if (e.shape === 'rect' ? x >= e.x0 && x <= e.x1 && z >= e.z0 && z <= e.z1 : Math.hypot(x - e.x, z - e.z) <= e.r) {
          owner = e.island;
          break;
        }
      }
      if (owner < 0) {
        let best = Infinity;
        let bestOwner = -1;
        let other = Infinity;
        for (const sm of samples) {
          const d = (sm.x - x) * (sm.x - x) + (sm.z - z) * (sm.z - z);
          if (d < best) {
            if (sm.owner !== bestOwner) other = Math.min(other, best);
            best = d;
            bestOwner = sm.owner;
          } else if (sm.owner !== bestOwner && d < other) other = d;
        }
        best = Math.sqrt(best);
        other = Math.sqrt(other);
        if (bestOwner >= 0 && best <= MARGIN && other - best >= CLEAR) owner = bestOwner;
      }
      owners[j * W + i] = owner;
    }
  }
  const at = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? -1 : owners[j * W + i]);
  const outlines = ISLANDS.map((_, k) => contour(W, H, (i, j) => at(i, j) === k, x0, z0, CELL));
  const onIsland = (x, z) => at(Math.round((x - x0) / CELL), Math.round((z - z0) / CELL)) >= 0;
  return { outlines, onIsland };
}

// Marching squares on a binary grid; returns the longest loop, smoothed.
export function contour(W, H, inside, x0, z0, cell) {
  const segs = new Map();
  const key = (a) => `${a[0]},${a[1]}`;
  const link = (a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (!segs.has(ka)) segs.set(ka, { p: a, n: [] });
    if (!segs.has(kb)) segs.set(kb, { p: b, n: [] });
    segs.get(ka).n.push(kb);
    segs.get(kb).n.push(ka);
  };
  // Edge midpoints in doubled grid units so keys stay integral.
  for (let j = -1; j < H; j++) {
    for (let i = -1; i < W; i++) {
      const a = inside(i, j) ? 1 : 0;
      const b = inside(i + 1, j) ? 1 : 0;
      const c = inside(i + 1, j + 1) ? 1 : 0;
      const d = inside(i, j + 1) ? 1 : 0;
      const idx = a | (b << 1) | (c << 2) | (d << 3);
      if (idx === 0 || idx === 15) continue;
      const T = [2 * i + 1, 2 * j];
      const R = [2 * i + 2, 2 * j + 1];
      const B = [2 * i + 1, 2 * j + 2];
      const L = [2 * i, 2 * j + 1];
      const table = {
        1: [[L, T]], 2: [[T, R]], 3: [[L, R]], 4: [[R, B]], 5: [[L, T], [R, B]], 6: [[T, B]], 7: [[L, B]],
        8: [[B, L]], 9: [[B, T]], 10: [[T, R], [B, L]], 11: [[B, R]], 12: [[R, L]], 13: [[R, T]], 14: [[T, L]],
      };
      for (const [p, q] of table[idx]) link(p, q);
    }
  }
  // Walk loops.
  const seen = new Set();
  let bestLoop = [];
  for (const [k] of segs) {
    if (seen.has(k)) continue;
    const loop = [];
    let cur = k;
    let prev = null;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const node = segs.get(cur);
      loop.push(node.p);
      const next = node.n.find((x) => x !== prev && !seen.has(x));
      prev = cur;
      cur = next;
    }
    if (loop.length > bestLoop.length) bestLoop = loop;
  }
  let pts = bestLoop.map(([gx, gz]) => new THREE.Vector2(x0 + (gx / 2) * cell, z0 + (gz / 2) * cell));
  // Decimate then Chaikin-smooth for soft, natural rims.
  pts = pts.filter((_, i) => i % 2 === 0);
  for (let it = 0; it < 3; it++) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      out.push(a.clone().lerp(b, 0.25), a.clone().lerp(b, 0.75));
    }
    pts = out;
  }
  return pts.filter((_, i) => i % 3 === 0);
}

export function buildIslands(outlines) {
  const g = new THREE.Group();
  outlines.forEach((o, k) => {
    if (o.length < 8) return;
    const isl = buildIsland(o, { depth: ISLANDS[k].depth, seed: 3 + k * 7 });
    isl.userData.islandId = ISLANDS[k].id;
    // Label anchor at the island's centre.
    const c = o.reduce((a, p) => a.add(p), new THREE.Vector2()).multiplyScalar(1 / o.length);
    const anchor = new THREE.Object3D();
    anchor.position.set(c.x, 2, c.y);
    isl.add(anchor);
    isl.userData.anchor = anchor;
    g.add(isl);
  });
  return g;
}

// ---- Track bridges -------------------------------------------------------------------------

// Concrete deck under the track, jersey barriers with catch fencing, steel
// arches below with hangers, and lamp posts.
export function buildBridges(track, onIsland) {
  const g = new THREE.Group();
  const concrete = mat('#A9AAA6', { roughness: 0.9, side: THREE.DoubleSide });
  const steel = mat('#D9DCDF', { roughness: 0.35, metalness: 0.6 });
  const dark = mat(PALETTE.barrier, { roughness: 0.6, metalness: 0.3 });
  const fenceMat = new THREE.MeshStandardMaterial({ color: '#3a3f47', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
  const half = TRACK_WIDTH / 2 + 2;
  for (const [a0, b0] of BRIDGES) {
    const a = a0 - 6;
    const b = b0 + 6;
    const deck = [];
    const walls = [];
    const steelParts = [];
    const fences = [];
    const posts = [];
    const smp = {};
    const frames = [];
    for (let s = a; s <= b + 0.01; s += 1) {
      track.at(s, smp);
      const n = V(smp.tan.z, 0, -smp.tan.x);
      frames.push({ p: smp.pos.clone(), n, s });
    }
    // Deck: a closed box section swept along the path.
    const section = [[-half, -0.02], [half, -0.02], [half, -1.1], [half - 1.2, -1.6], [-half + 1.2, -1.6], [-half, -1.1]];
    deck.push(sweep(frames, section));
    // Jersey barriers (both sides) and catch fence panels.
    const jersey = [[0, 0], [0.55, 0], [0.45, 0.25], [0.18, 0.4], [0.15, 0.95], [0, 0.95]];
    for (const side of [1, -1]) {
      walls.push(sweep(frames, jersey.map(([x, y]) => [side * (half - x), y])));
      const fence = [];
      for (const f of frames) fence.push(f);
      fences.push(ribbonWall(fence, side * (half - 0.1), 0.95, 3.6));
      for (let k = 0; k < frames.length; k += 4) {
        const f = frames[k];
        const base = f.p.clone().addScaledVector(f.n, side * (half - 0.1)).setY(0.9);
        posts.push(rod(base, base.clone().setY(3.7), 0.05, 5));
        if (k % 16 === 0) {
          // Lamp post leaning over the track.
          const top = base.clone().setY(7.5);
          posts.push(rod(base, top, 0.09, 6));
          posts.push(rod(top, top.clone().addScaledVector(f.n, -side * 1.6), 0.06, 5));
        }
      }
    }
    // Arches below the deck between the island rims, with vertical hangers.
    const off = frames.filter((f) => !onIsland(f.p.x, f.p.z));
    if (off.length > 4) {
      const i0 = frames.indexOf(off[0]) - 2;
      const i1 = frames.indexOf(off[off.length - 1]) + 2;
      const span = Math.max(1, i1 - i0);
      const sag = Math.min(14, 4 + span * 0.28);
      for (const side of [1, -1]) {
        const arch = [];
        for (let k = i0; k <= i1; k++) {
          const f = frames[Math.max(0, Math.min(frames.length - 1, k))];
          const t = (k - i0) / span;
          const y = -1.6 - sag * Math.sin(Math.PI * t);
          arch.push(f.p.clone().addScaledVector(f.n, side * (half - 1.4)).setY(y));
        }
        for (let k = 0; k < arch.length - 1; k++) steelParts.push(rod(arch[k], arch[k + 1], 0.32, 8));
        for (let k = 2; k < arch.length - 2; k += 3) steelParts.push(rod(arch[k], arch[k].clone().setY(-1.55), 0.08, 5));
        // Lateral bracing between the two arches.
        if (side > 0) {
          for (let k = 3; k < arch.length - 3; k += 6) {
            const f = frames[Math.max(0, Math.min(frames.length - 1, i0 + k))];
            const p1 = arch[k];
            const p2 = p1.clone().addScaledVector(f.n, -2 * (half - 1.4));
            steelParts.push(rod(p1, p2, 0.07, 5));
          }
        }
      }
    }
    const deckMesh = new THREE.Mesh(merge(deck), concrete);
    const wallMesh = new THREE.Mesh(merge(walls), mat('#E9E7E1', { roughness: 0.7, side: THREE.DoubleSide }));
    const fenceMesh = new THREE.Mesh(merge(fences), fenceMat);
    const postMesh = new THREE.Mesh(merge(posts), dark);
    for (const m of [deckMesh, wallMesh, postMesh]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    g.add(deckMesh, wallMesh, fenceMesh, postMesh);
    if (steelParts.length) {
      const st = new THREE.Mesh(merge(steelParts), steel);
      st.castShadow = true;
      g.add(st);
    }
  }
  return g;
}

// Sweep a 2D cross-section ([lateral, y] pairs, closed) along path frames.
function sweep(frames, section) {
  const pos = [];
  const idx = [];
  const n = section.length;
  frames.forEach((f) => {
    for (const [lx, y] of section) {
      pos.push(f.p.x + f.n.x * lx, y, f.p.z + f.n.z * lx);
    }
  });
  for (let k = 0; k < frames.length - 1; k++) {
    for (let i = 0; i < n; i++) {
      const a = k * n + i;
      const b = k * n + ((i + 1) % n);
      const c = (k + 1) * n + i;
      const d = (k + 1) * n + ((i + 1) % n);
      idx.push(a, c, b, b, c, d);
    }
  }
  // End caps (fan).
  for (const k of [0, frames.length - 1]) {
    for (let i = 1; i < n - 1; i++) idx.push(k * n, k * n + i, k * n + i + 1);
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

function ribbonWall(frames, lateral, y0, y1) {
  const pos = [];
  const idx = [];
  frames.forEach((f, k) => {
    const x = f.p.x + f.n.x * lateral;
    const z = f.p.z + f.n.z * lateral;
    pos.push(x, y0, z, x, y1, z);
    if (k) idx.push((k - 1) * 2, k * 2, (k - 1) * 2 + 1, (k - 1) * 2 + 1, k * 2, k * 2 + 1);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---- Grandstand with crowd -------------------------------------------------------------------

// Covered grandstand: tiered concrete terraces with colored seat blocks,
// aisles, a cantilevered roof on trusses and a video screen; a seated crowd of
// little people (body + head, two instanced draw calls) that cheers.
export function buildGrandstandHD({ len = 36 } = {}) {
  const g = new THREE.Group();
  const { rows, rowD, rowH, base } = STAND;
  const terr = [];
  const seats = [];
  const aisles = [];
  const nAisles = 5;
  const aisleX = Array.from({ length: nAisles }, (_, i) => -len / 2 + (len / (nAisles - 1)) * i);
  const seatColors = TEAMS.map((t) => t.primary);
  for (let r = 0; r < rows; r++) {
    terr.push(bevelBox(len, base + r * rowH, rowD, 0.03).translate(0, (base + r * rowH) / 2, -r * rowD));
    // Seat blocks between aisles, colored by team section.
    for (let k = 0; k < nAisles - 1; k++) {
      const xa = aisleX[k] + 0.7;
      const xb = aisleX[k + 1] - 0.7;
      seats.push(tint(bevelBox(xb - xa, 0.18, 0.42, 0.04).translate((xa + xb) / 2, base + r * rowH + 0.09, -r * rowD - 0.12), seatColors[k % seatColors.length]));
      seats.push(tint(bevelBox(xb - xa, 0.4, 0.08, 0.02).translate((xa + xb) / 2, base + r * rowH + 0.22, -r * rowD - 0.36), seatColors[k % seatColors.length]));
    }
    for (const x of aisleX) aisles.push(bevelBox(1.2, 0.05, rowD, 0.01).translate(x, base + r * rowH + 0.02, -r * rowD));
  }
  // Front wall with a team-colored fascia and hand rail.
  terr.push(bevelBox(len + 0.6, base + 0.4, 0.3, 0.05).translate(0, (base + 0.4) / 2, 0.6));
  const back = bevelBox(len + 0.6, base + rows * rowH + 3.4, 0.4, 0.05).translate(0, (base + rows * rowH + 3.4) / 2, -rows * rowD - 0.1);
  terr.push(back);
  for (const s of [1, -1]) terr.push(bevelBox(0.4, base + rows * rowH + 1, rows * rowD + 0.8, 0.05).translate(s * (len / 2 + 0.3), (base + rows * rowH + 1) / 2, -(rows * rowD) / 2 + 0.3));
  const concrete = new THREE.Mesh(merge(terr), mat('#D8D4CB', { roughness: 0.85 }));
  concrete.castShadow = concrete.receiveShadow = true;
  const seatMesh = new THREE.Mesh(merge(seats, { color: true }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }));
  seatMesh.receiveShadow = true;
  const aisleMesh = new THREE.Mesh(merge(aisles), mat('#BDB8AE'));
  aisleMesh.receiveShadow = true;
  g.add(concrete, seatMesh, aisleMesh);

  // Cantilevered wing roof: a curved shell that thins toward an upturned front
  // lip, carried by tapered steel ribs on back columns. Under it: purlins with
  // downlights; at the front a fascia with a team-colored band and LED strip;
  // at the back a glass clerestory over the back wall, which gets vertical fins.
  const topY = base + rows * rowH + 3.4;
  const zBack = -rows * rowD - 0.6;
  const zTip = 3.4;
  const W = len + 3;
  const zAt = (u) => zBack + (zTip - zBack) * u;
  const roofTop = (u) => topY + 1.7 - 1.3 * u + 0.55 * u * u * u;
  const thick = (u) => 0.55 - 0.4 * u;
  const under = (u) => roofTop(u) - thick(u);
  const ribLow = (u) => topY - 0.3 + (under(1) - 0.02 - (topY - 0.3)) * u;
  // Side profile in (z, y), extruded along x. Shape x is -z so a -90° turn about y maps it back.
  const profile = (top, bottom, width, x0, n = 24) => {
    const shape = new THREE.Shape();
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const pt = [-zAt(u), top(u)];
      if (i === 0) shape.moveTo(...pt);
      else shape.lineTo(...pt);
    }
    for (let i = n; i >= 0; i--) shape.lineTo(-zAt(i / n), bottom(i / n));
    return new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 1 }).rotateY(Math.PI / 2).translate(x0, 0, 0);
  };
  const roof = new THREE.Mesh(profile(roofTop, under, W, -W / 2, 40), mat(PALETTE.canopy, { roughness: 0.4 }));
  roof.castShadow = roof.receiveShadow = true;
  const steel = [];
  const nRibs = 7;
  for (let k = 0; k < nRibs; k++) {
    const x = -len / 2 + (len / (nRibs - 1)) * k;
    steel.push(profile(under, ribLow, 0.28, x - 0.14));
    // Tapered back column from the ground to the rib heel.
    const col = new THREE.CylinderGeometry(0.22, 0.32, topY + 1.2, 8).translate(x, (topY + 1.2) / 2, zBack + 0.15);
    steel.push(col);
    // Back tie from the column foot of the roof to the ground behind the wall.
    steel.push(rod(V(x, topY + 1.1, zBack + 0.1), V(x, 0, zBack - 2.6), 0.07, 6));
  }
  // Purlins between the ribs, just under the shell.
  for (const u of [0.18, 0.38, 0.58, 0.78, 0.94]) {
    const y = under(u) - 0.12;
    steel.push(bevelBox(W - 0.4, 0.16, 0.12, 0.02).translate(0, y, zAt(u)));
  }
  const steelMesh = new THREE.Mesh(merge(steel), mat('#B9C0C9', { metalness: 0.55, roughness: 0.35 }));
  steelMesh.castShadow = true;
  // Fascia along the front lip: team band and a thin LED strip.
  const lipY = roofTop(1);
  const fascia = new THREE.Mesh(bevelBox(W + 0.1, 0.42, 0.18, 0.04).translate(0, lipY - 0.12, zTip + 0.05), mat(TEAMS[0].primary, { roughness: 0.4 }));
  const led = new THREE.Mesh(new THREE.BoxGeometry(W - 0.6, 0.05, 0.05).translate(0, lipY - 0.36, zTip + 0.1), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 1.2 }));
  // Downlights along the purlins.
  const lights = [];
  for (const u of [0.38, 0.78]) for (let x = -len / 2 + 2; x <= len / 2 - 2; x += 3) lights.push(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 10).translate(x, under(u) - 0.22, zAt(u)));
  const lightMesh = new THREE.Mesh(merge(lights), new THREE.MeshStandardMaterial({ color: '#fff8e8', emissive: '#fff4d6', emissiveIntensity: 1.4 }));
  // Glass clerestory between the back wall top and the roof heel.
  const glassH = under(0) - topY;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(len + 0.6, glassH, 0.06).translate(0, topY + glassH / 2, zBack + 0.5), new THREE.MeshPhysicalMaterial({ color: '#bfe3f7', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45 }));
  // Vertical fins on the back wall.
  const fins = [];
  for (let x = -len / 2; x <= len / 2 + 0.01; x += 1.5) fins.push(bevelBox(0.16, topY - 0.6, 0.5, 0.03).translate(x, (topY - 0.6) / 2 + 0.3, zBack + 0.05 - 0.25));
  const finMesh = new THREE.Mesh(merge(fins), mat('#E9E7E1', { roughness: 0.6 }));
  finMesh.castShadow = true;
  g.add(roof, steelMesh, fascia, led, lightMesh, glass, finMesh);

  // Video screen on legs beside the west end of the stand, set back from the
  // front so its legs and panel stay clear of the track (which bends close
  // around the east end).
  const screenTex = textTexture(['SKY CIRCUIT', 'LIVE'], { w: 512, h: 256, bg: '#0E1B2B', fg: '#F4F5F7' });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.6), new THREE.MeshStandardMaterial({ map: screenTex, emissive: '#ffffff', emissiveMap: screenTex, emissiveIntensity: 0.6 }));
  const sx = -len / 2 - 4.2;
  const sz = -3;
  screen.position.set(sx, 7.5, sz + 0.3);
  const frame = new THREE.Mesh(merge([bevelBox(7.4, 4, 0.4, 0.06).translate(sx, 7.5, sz + 0.05), rod(V(sx + 1.6, 0, sz), V(sx + 1.6, 5.6, sz), 0.18, 8), rod(V(sx - 1.6, 0, sz), V(sx - 1.6, 5.6, sz), 0.18, 8)]), mat('#2B2F36', { roughness: 0.5 }));
  frame.castShadow = true;
  g.add(frame, screen);

  // Crowd: body (shirt colors) and head instances, a few waving flags.
  const bodyGeo = new THREE.CapsuleGeometry(0.17, 0.28, 1, 6).translate(0, 0.38, 0);
  const headGeo = new THREE.IcosahedronGeometry(0.13, 0).translate(0, 0.78, 0);
  const shirts = TEAMS.flatMap((t) => [t.primary, t.primary, t.secondary, t.accent]).concat(['#ffffff', '#E8D35B', '#D96A5A', '#5A7FD9']);
  const skins = ['#F1CFB3', '#E0AE88', '#C48B63', '#9C6644', '#6E452C'];
  const people = [];
  const rand = mulberry(9);
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < nAisles - 1; k++) {
      const xa = aisleX[k] + 0.9;
      const xb = aisleX[k + 1] - 0.9;
      for (let x = xa; x <= xb; x += 0.62) {
        if (rand() < 0.12) continue;
        people.push({ x: x + (rand() - 0.5) * 0.1, y: base + r * rowH + 0.1, z: -r * rowD - 0.12, sh: shirts[Math.floor(rand() * shirts.length)], sk: skins[Math.floor(rand() * skins.length)], ph: rand() * 6.28, team: k });
      }
    }
  }
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), people.length);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ roughness: 0.7 }), people.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  people.forEach((p, i) => {
    m.makeTranslation(p.x, p.y, p.z);
    bodies.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
    bodies.setColorAt(i, c.set(p.sh));
    heads.setColorAt(i, c.set(p.sk));
  });
  bodies.castShadow = true;
  g.add(bodies, heads);

  // Flags on poles along the front.
  const flags = [];
  const flagMeshes = [];
  TEAMS.forEach((t, k) => {
    const x = -len / 2 + 2 + ((len - 4) / (TEAMS.length - 1)) * k;
    flags.push(rod(V(x, base, 0.9), V(x, base + 4.5, 0.9), 0.04, 5));
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9, 6, 1).translate(0.7, 0, 0), new THREE.MeshStandardMaterial({ color: t.primary, side: THREE.DoubleSide, roughness: 0.7 }));
    f.position.set(x, base + 4.0, 0.9);
    flagMeshes.push(f);
    g.add(f);
  });
  g.add(new THREE.Mesh(merge(flags), mat('#C9CED6', { metalness: 0.6, roughness: 0.3 })));

  g.userData.update = (t, excite = 0) => {
    people.forEach((p, i) => {
      const jump = Math.max(0, Math.sin(t * (3 + excite * 6) + p.ph)) * (0.02 + excite * 0.22);
      m.makeTranslation(p.x, p.y + jump, p.z);
      bodies.setMatrixAt(i, m);
      heads.setMatrixAt(i, m);
    });
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    // Flags ripple.
    for (const f of flagMeshes) {
      const pa = f.geometry.attributes.position;
      for (let k = 0; k < pa.count; k++) {
        const x = pa.getX(k);
        pa.setZ(k, Math.sin(x * 3 - t * 5 + f.position.x) * 0.12 * (x / 1.4));
      }
      pa.needsUpdate = true;
    }
  };
  return g;
}

// ---- Watch tower -----------------------------------------------------------------------------

// Race control tower: glass lobby, tapered shaft with glazing strips, flared
// observation pod with a wraparound glass band and balcony, roof and mast with
// a beacon, plus a live timing board on the shaft.
export function buildWatchTower() {
  const g = new THREE.Group();
  const white = mat('#F1EFEA', { roughness: 0.45 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#2f4c5c', roughness: 0.08, metalness: 0.4, clearcoat: 1, envMapIntensity: 1.4 });
  const steel = mat('#C9CED6', { metalness: 0.7, roughness: 0.3 });
  // Plaza and lobby.
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.4, 0.3, 40).translate(0, 0.15, 0), mat('#CFCAC0', { roughness: 0.85 }));
  plaza.receiveShadow = true;
  const lobby = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 3.6, 32).translate(0, 2.1, 0), glass);
  const lobbyRoof = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 0.4, 32).translate(0, 4.1, 0), white);
  const mullions = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    mullions.push(rod(V(Math.cos(a) * 5.02, 0.3, Math.sin(a) * 5.02), V(Math.cos(a) * 5.02, 3.9, Math.sin(a) * 5.02), 0.05, 4));
  }
  // Shaft: a lathe with a gentle taper and waist.
  const H = TOWER_H;
  const prof = [[3.2, 4.2], [2.6, 10], [2.2, 17], [2.3, 22], [2.8, H]].map(([r, y]) => new THREE.Vector2(r, y));
  const shaft = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), white);
  shaft.castShadow = true;
  // Vertical glazing strips.
  const strips = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    const pts = prof.map((p) => V(Math.cos(a) * (p.x + 0.02), p.y, Math.sin(a) * (p.x + 0.02)));
    for (let i = 1; i < pts.length - 1; i++) strips.push(rod(pts[i], pts[i + 1], 0.22, 4));
  }
  // Observation pod: flared frustum, glass band, balcony.
  const podBase = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 3.2, 2.2, 40).translate(0, H + 1.1, 0), white);
  const podGlass = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.6, 3.2, 40, 1, true).translate(0, H + 3.8, 0), glass);
  const podRoof = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 6.4, 0.7, 40).translate(0, H + 5.75, 0), white);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.6, 0.25, 40).translate(0, H + 2.3, 0), white);
  const rail = [];
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    const b = ((k + 1) / 48) * Math.PI * 2;
    rail.push(rod(V(Math.cos(a) * 7.5, H + 3.3, Math.sin(a) * 7.5), V(Math.cos(b) * 7.5, H + 3.3, Math.sin(b) * 7.5), 0.04, 4));
    rail.push(rod(V(Math.cos(a) * 7.5, H + 2.4, Math.sin(a) * 7.5), V(Math.cos(a) * 7.5, H + 3.3, Math.sin(a) * 7.5), 0.025, 4));
  }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    rail.push(rod(V(Math.cos(a) * 6.45, H + 2.3, Math.sin(a) * 6.45), V(Math.cos(a) * 6.3, H + 5.4, Math.sin(a) * 6.3), 0.07, 4));
  }
  // Mast and beacon.
  const mast = [rod(V(0, H + 6, 0), V(0, H + 15, 0), 0.18, 8), rod(V(0, H + 15, 0), V(0, H + 19, 0), 0.07, 6)];
  for (let y = H + 7; y < H + 15; y += 2) mast.push(rod(V(-0.8, y, 0), V(0.8, y, 0), 0.04, 4));
  const beaconMat = new THREE.MeshStandardMaterial({ color: '#ff3b30', emissive: '#ff3b30', emissiveIntensity: 2 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), beaconMat);
  beacon.position.set(0, H + 19.2, 0);

  // Signage and live timing board (canvas, redrawn by the game).
  const signTex = textTexture(['RACE CONTROL'], { w: 1024, h: 128, bg: '#0E1B2B', fg: '#F4F5F7' });
  const sign = new THREE.Mesh(new THREE.CylinderGeometry(7.42, 7.42, 0.9, 48, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ map: signTex, side: THREE.DoubleSide, roughness: 0.5 }));
  sign.position.y = H + 5.75;
  sign.scale.set(1.001, 1, 1.001);
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 256;
  boardCanvas.height = 512;
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3, 6), new THREE.MeshStandardMaterial({ map: boardTex, emissive: '#ffffff', emissiveMap: boardTex, emissiveIntensity: 0.7, roughness: 0.4 }));
  board.position.set(0, 13, 2.75);
  board.rotation.x = 0.06;
  const boardFrame = new THREE.Mesh(bevelBox(3.3, 6.3, 0.3, 0.05).translate(0, 13, 2.55), mat('#1C1D20'));

  for (const m of [lobby, lobbyRoof, podBase, podRoof, deck, boardFrame]) m.castShadow = true;
  g.add(plaza, lobby, lobbyRoof, new THREE.Mesh(merge(mullions), steel), shaft, new THREE.Mesh(merge(strips), glass), podBase, podGlass, podRoof, deck, new THREE.Mesh(merge(rail), steel), new THREE.Mesh(merge(mast), steel), beacon, sign, board, boardFrame);

  g.userData.topY = H + 3.5;
  g.userData.drawBoard = (rows) => {
    const ctx = boardCanvas.getContext('2d');
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
    boardTex.needsUpdate = true;
  };
  g.userData.update = (t) => {
    beaconMat.emissiveIntensity = Math.sin(t * 3) > 0.6 ? 4 : 0.6;
  };
  return g;
}

// ---- Start light gantry and trackside boards ------------------------------------------------

// Five-light start gantry spanning the straight.
export function buildStartGantry(x, z) {
  const g = new THREE.Group();
  const steel = mat('#2B2F36', { metalness: 0.5, roughness: 0.4 });
  const span = TRACK_WIDTH + 3;
  const parts = [rod(V(0, 0, -span / 2), V(0, 6.5, -span / 2), 0.25, 8), rod(V(0, 0, span / 2), V(0, 6.5, span / 2), 0.25, 8), bevelBox(0.8, 1.1, span + 0.6, 0.08).translate(0, 6.6, 0)];
  const body = new THREE.Mesh(merge(parts), steel);
  body.castShadow = true;
  g.add(body);
  const lightMat = new THREE.MeshStandardMaterial({ color: '#ff3b30', emissive: '#ff3b30', emissiveIntensity: 1.2 });
  for (let k = 0; k < 5; k++) {
    const pod = new THREE.Mesh(bevelBox(0.5, 0.9, 0.7, 0.05), mat('#1C1D20'));
    pod.position.set(-0.45, 6.6, -2.4 + k * 1.2);
    const l1 = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), lightMat);
    l1.position.set(-0.71, 6.8, -2.4 + k * 1.2);
    l1.rotation.y = -Math.PI / 2;
    const l2 = l1.clone();
    l2.position.y = 6.4;
    g.add(pod, l1, l2);
  }
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(span - 2, 0.9), new THREE.MeshStandardMaterial({ map: textTexture(['SKY CIRCUIT'], { w: 1024, h: 96, bg: '#0E1B2B', fg: '#F4F5F7' }), side: THREE.DoubleSide }));
  banner.rotation.y = Math.PI / 2;
  banner.position.set(0.45, 7.6, 0);
  banner.material.side = THREE.FrontSide;
  const banner2 = banner.clone();
  banner2.rotation.y = -Math.PI / 2;
  banner2.position.x = -0.45;
  g.add(banner, banner2);
  g.position.set(x, 0, z);
  return g;
}

// Advertising boards (invented sponsors) along stretches of track on islands.
// All boards share one atlas texture and merge into two meshes.
export function buildTrackBoards(track, ranges, onIsland) {
  const brands = [['TREADLINE', '#F5C518', '#1C1D20'], ['BEANLOFT', '#6B3E26', '#F4E9D8'], ['HALCYON', '#0E2A47', '#F5FAFA'], ['SKY CIRCUIT', '#F4F5F7', '#0E1B2B'], ['NORTHWIND AIR', '#1FB5B0', '#ffffff']];
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64 * brands.length;
  const ctx = c.getContext('2d');
  brands.forEach(([t, bg, fg], i) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, i * 64, 512, 64);
    ctx.fillStyle = fg;
    ctx.font = '900 40px Nunito, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, 256, i * 64 + 32);
  });
  const atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  const faces = [];
  const backs = [];
  const placed = [];
  const smp = {};
  let k = 0;
  for (const [a, b, side] of ranges) {
    for (let s = a; s < b; s += 7) {
      track.at(s, smp);
      const n = V(smp.tan.z, 0, -smp.tan.x);
      // Skip the inside of bends (boards would cross) and keep boards apart.
      if (Math.sign(smp.curv) === side && Math.abs(smp.curv) > 0.02) continue;
      if (Math.abs(smp.curv) > 0.06) continue;
      const p = smp.pos.clone().addScaledVector(n, side * (TRACK_WIDTH / 2 + 2.2));
      if (!onIsland(p.x, p.z)) continue;
      if (placed.some((q) => q.distanceTo(p) < 7.2)) continue;
      placed.push(p);
      const rot = Math.atan2(-side * n.x, -side * n.z);
      const row = k++ % brands.length;
      const face = new THREE.PlaneGeometry(6.4, 0.8);
      const uv = face.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (row + 1 - uv.getY(i)) / brands.length);
      face.rotateY(rot).translate(p.x, 0.75, p.z);
      faces.push(face);
      backs.push(bevelBox(6.5, 0.9, 0.12, 0.02).translate(0, 0, -0.07).rotateY(rot).translate(p.x, 0.75, p.z));
    }
  }
  const g = new THREE.Group();
  if (!faces.length) return g;
  g.add(new THREE.Mesh(merge(faces, { uv: true }), new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.6 })));
  const back = new THREE.Mesh(merge(backs), mat('#2B2F36'));
  back.castShadow = true;
  g.add(back);
  return g;
}

function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

