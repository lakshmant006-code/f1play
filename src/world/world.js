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

const clamp01 = (x) => Math.min(1, Math.max(0, x));

// ---- Procedural noise for the rock -------------------------------------------

function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w
  ) * 2 - 1;
}
// Fractal noise in -1..1.
export function fbm(x, y, z, oct = 4) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, y * f, z * f);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

// Rock surface detail: cracks and grain as a tiling bump map.
let rockBump = null;
function rockBumpTexture() {
  if (rockBump) return rockBump;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // Tileable by sampling noise on a torus.
      const a = (x / S) * Math.PI * 2;
      const b = (y / S) * Math.PI * 2;
      const nx = Math.cos(a) * 2, ny = Math.sin(a) * 2, nz = Math.cos(b) * 2 + Math.sin(b) * 1.3;
      let v = fbm(nx, ny + Math.sin(b) * 2, nz, 5) * 0.5 + 0.5;
      // Horizontal strata lines and a few crack ridges.
      v -= Math.pow(Math.abs(Math.sin(b * 6 + fbm(nx, ny, nz) * 3)), 18) * 0.35;
      v -= Math.pow(1 - Math.abs(fbm(nx * 2, ny * 2, nz * 2, 3)), 12) * 0.4;
      const g = Math.max(0, Math.min(255, v * 255));
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  rockBump = new THREE.CanvasTexture(c);
  rockBump.wrapS = rockBump.wrapT = THREE.RepeatWrapping;
  rockBump.anisotropy = 8;
  return rockBump;
}

let islandMats = null;
export function islandMaterials() {
  if (islandMats) return islandMats;
  islandMats = {
    grass: new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 0.97 }),
    soil: new THREE.MeshStandardMaterial({ color: SCENERY.soil, roughness: 1 }),
    rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, bumpMap: rockBumpTexture(), bumpScale: 2.2 }),
  };
  return islandMats;
}

// Resample a closed outline to even spacing, then relax it so rims are smooth.
function smoothOutline(outline, spacing = 1.6, passes = 6) {
  const pts = outline.map((p) => p.clone());
  let per = 0;
  for (let i = 0; i < pts.length; i++) per += pts[i].distanceTo(pts[(i + 1) % pts.length]);
  const n = Math.max(24, Math.min(360, Math.round(per / spacing)));
  const out = [];
  let seg = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * per;
    while (seg < pts.length) {
      const a = pts[seg];
      const b = pts[(seg + 1) % pts.length];
      const len = a.distanceTo(b);
      if (acc + len >= target) {
        out.push(a.clone().lerp(b, len ? (target - acc) / len : 0));
        break;
      }
      acc += len;
      seg++;
    }
  }
  let cur = out;
  for (let p = 0; p < passes; p++) {
    cur = cur.map((q, i) => {
      const a = cur[(i - 1 + cur.length) % cur.length];
      const b = cur[(i + 1) % cur.length];
      return new THREE.Vector2((a.x + q.x * 2 + b.x) / 4, (a.y + q.y * 2 + b.y) / 4);
    });
  }
  return cur;
}

// Grass top over a band of soil, then a dense craggy rock underside: noise
// carved ledges and strata, several hanging lobes and spurs, crevice shading,
// a bump map for cracks, and a few loose boulders drifting underneath.
export function buildIsland(rawOutline, { depth = 30, seed = 1, grassH = 1.2 } = {}) {
  const rand = rng(seed);
  const M = islandMaterials();
  const g = new THREE.Group();
  const outline = smoothOutline(rawOutline);
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, -p.y)));
  const top = new THREE.ExtrudeGeometry(shape, { depth: grassH, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.6, bevelSegments: 4, curveSegments: 4 });
  top.rotateX(-Math.PI / 2);
  top.translate(0, -grassH - 0.36, 0); // bevel adds 0.35 m above the slab; keep the top just under y = 0
  const grass = new THREE.Mesh(top, [M.grass, M.soil]);
  grass.receiveShadow = true;
  g.add(grass);

  // Rock grid: rings from the rim down, columns around the outline.
  const c = outline.reduce((a, p) => a.add(p), new THREE.Vector2()).multiplyScalar(1 / outline.length);
  const n = outline.length;
  const R = 30;
  const sd = seed * 17.3;
  // Hanging lobes: a few angular bumps that push the underside deeper.
  const lobes = Array.from({ length: 4 + Math.floor(rand() * 3) }, () => ({ a: rand() * Math.PI * 2, w: 0.35 + rand() * 0.5, d: 0.25 + rand() * 0.55 }));
  const lobe = (ang) => lobes.reduce((m, l) => Math.max(m, l.d * Math.exp(-Math.pow(Math.atan2(Math.sin(ang - l.a), Math.cos(ang - l.a)) / l.w, 2))), 0);
  const top0 = -grassH - 0.3;
  const pos = new Float32Array((R + 1) * n * 3 + 3);
  const uv = new Float32Array((R + 1) * n * 2 + 2);
  const shade = new Float32Array((R + 1) * n + 1);
  let perim = 0;
  const along = [0];
  for (let i = 1; i <= n; i++) along.push((perim += outline[i - 1].distanceTo(outline[i % n])));
  for (let k = 0; k <= R; k++) {
    const t = k / R;
    for (let i = 0; i < n; i++) {
      const p = outline[i];
      const dx = p.x - c.x;
      const dz = p.y - c.y;
      const ang = Math.atan2(dz, dx);
      const L = lobe(ang);
      // Profile: short near-vertical cliff, a slight bulge, then a long taper.
      const cliff = Math.min(1, t / 0.08);
      const taper = t < 0.08 ? 1 : Math.max(0.02, Math.pow(1 - (t - 0.08) / 0.92, 0.9 + (1 - L) * 0.5));
      let s = (t < 0.08 ? 1 - cliff * 0.05 : 0.95 * taper) * (1 + 0.05 * Math.sin(t * Math.PI));
      const colDepth = depth * (0.62 + L * 0.75 + fbm(Math.cos(ang) * 1.3 + sd, Math.sin(ang) * 1.3, 0.5) * 0.18);
      let y = top0 - (t < 0.08 ? cliff * depth * 0.07 : depth * 0.07 + (colDepth - depth * 0.07) * Math.pow((t - 0.08) / 0.92, 1.05));
      // Crags: fractal noise pushes the surface in and out; strata make ledges.
      const wx = c.x + dx * s;
      const wz = c.y + dz * s;
      const nz = fbm(wx * 0.07 + sd, y * 0.09, wz * 0.07, 5);
      const strata = Math.pow(Math.abs(Math.sin(y * 0.55 + fbm(wx * 0.03, 0, wz * 0.03) * 2)), 6) * 0.06;
      const crag = k === 0 ? 0 : nz * 0.16 * Math.min(1, t * 6) - strata * Math.min(1, t * 6);
      s *= 1 + crag;
      if (k > 0) y += fbm(wx * 0.05, sd, wz * 0.05, 3) * depth * 0.05 * t;
      const j = k * n + i;
      pos[j * 3] = c.x + dx * s;
      pos[j * 3 + 1] = y;
      pos[j * 3 + 2] = c.y + dz * s;
      uv[j * 2] = along[i] / 9;
      uv[j * 2 + 1] = -y / 9;
      shade[j] = crag;
    }
  }
  // Tip.
  const tipIdx = (R + 1) * n;
  pos[tipIdx * 3] = c.x;
  pos[tipIdx * 3 + 1] = top0 - depth * 1.15;
  pos[tipIdx * 3 + 2] = c.y;
  const idx = [];
  for (let k = 0; k < R; k++) {
    for (let i = 0; i < n; i++) {
      const a = k * n + i;
      const b = k * n + ((i + 1) % n);
      const cc = (k + 1) * n + i;
      const d = (k + 1) * n + ((i + 1) % n);
      idx.push(a, b, cc, b, d, cc);
    }
  }
  for (let i = 0; i < n; i++) idx.push(R * n + i, R * n + ((i + 1) % n), tipIdx);
  const rock = new THREE.BufferGeometry();
  rock.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rock.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  rock.setIndex(idx);
  rock.computeVertexNormals();
  // Where rings converge toward the tip, triangles collapse; give those
  // vertices a straight-down normal instead of NaN.
  const nrm = rock.attributes.normal;
  for (let j = 0; j < nrm.count; j++) {
    const x = nrm.getX(j), y = nrm.getY(j), z = nrm.getZ(j);
    if (!(x * x + y * y + z * z > 1e-6)) nrm.setXYZ(j, 0, -1, 0);
  }
  // Colors: soil under the lip, warm rock fading to dark earth, crevices darker.
  const col = new Float32Array(pos.length);
  const soil = new THREE.Color(SCENERY.soil);
  const mid = new THREE.Color(SCENERY.cliff);
  const dark = new THREE.Color(SCENERY.cliffDark);
  const warm = new THREE.Color('#8A6546');
  const tmp = new THREE.Color();
  for (let j = 0; j <= tipIdx; j++) {
    const y = -pos[j * 3 + 1];
    const t = Math.min(1, y / (depth * 1.1));
    const band = fbm(pos[j * 3] * 0.02, y * 0.35, pos[j * 3 + 2] * 0.02, 2) * 0.18;
    if (y < grassH + 1.6) tmp.copy(soil);
    else tmp.copy(warm).lerp(mid, clamp01(t * 1.6 + band)).lerp(dark, clamp01(t * 1.15 - 0.2 + band));
    const ao = 1 + Math.min(0, shade[j] || 0) * 2.2 + Math.max(0, shade[j] || 0) * 0.6;
    tmp.multiplyScalar(Math.max(0.45, Math.min(1.15, ao)));
    col[j * 3] = tmp.r;
    col[j * 3 + 1] = tmp.g;
    col[j * 3 + 2] = tmp.b;
  }
  rock.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const rockMesh = new THREE.Mesh(rock, M.rock);
  rockMesh.receiveShadow = true;
  g.add(rockMesh);

  // Spurs: smaller hanging rock spikes around the underside, and loose boulders.
  const spurs = [];
  const nSpurs = 5 + Math.floor(perim / 60);
  for (let q = 0; q < nSpurs; q++) {
    const i = Math.floor(rand() * n);
    const k = Math.floor(R * (0.25 + rand() * 0.45));
    const j = k * n + i;
    const px = pos[j * 3], py = pos[j * 3 + 1], pz = pos[j * 3 + 2];
    const len = depth * (0.12 + rand() * 0.22);
    const rad = len * (0.18 + rand() * 0.1);
    const cone = new THREE.ConeGeometry(rad, len, 9, 6);
    const cp = cone.attributes.position;
    for (let v = 0; v < cp.count; v++) {
      const f = 1 + fbm(cp.getX(v) * 0.6 + q, cp.getY(v) * 0.4, cp.getZ(v) * 0.6, 3) * 0.3;
      cp.setX(v, cp.getX(v) * f);
      cp.setZ(v, cp.getZ(v) * f);
    }
    cone.rotateX(Math.PI);
    cone.translate(px + (c.x - px) * 0.08, py - len / 2 + rad * 0.6, pz + (c.y - pz) * 0.08);
    spurs.push(tint(cone, rand() < 0.5 ? SCENERY.cliff : '#5A4131'));
  }
  const boulders = [];
  const nB = 3 + Math.floor(rand() * 4);
  for (let q = 0; q < nB; q++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(perim / Math.PI / 2) * (0.35 + rand() * 0.6);
    const size = 1.2 + rand() * 3.2;
    const b = new THREE.IcosahedronGeometry(size, 2);
    const bp = b.attributes.position;
    for (let v = 0; v < bp.count; v++) {
      const f = 1 + fbm(bp.getX(v) * 0.5 + q * 3, bp.getY(v) * 0.5, bp.getZ(v) * 0.5, 3) * 0.35;
      bp.setXYZ(v, bp.getX(v) * f, bp.getY(v) * f * 0.8, bp.getZ(v) * f);
    }
    b.computeVertexNormals(); // boulders are closed and smooth, so this is safe
    b.translate(c.x + Math.cos(a) * r, top0 - depth * (0.35 + rand() * 0.7), c.y + Math.sin(a) * r);
    boulders.push(tint(b, rand() < 0.5 ? SCENERY.cliff : '#6A4C37'));
  }
  const extra = new THREE.Mesh(merge([...spurs, ...boulders], { color: true, uv: true }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, bumpMap: rockBumpTexture(), bumpScale: 1.5 }));
  g.add(extra);
  g.userData.outline = outline;
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

  // Kerbs: continuous strips swept along the track edge through each corner,
  // with a raised rounded profile and crisp red/white stripes that follow the
  // curve, so nothing overlaps or flickers. One vertex-colored mesh.
  const smp = {};
  const STEP = 0.5;
  const N = Math.ceil(track.length / STEP);
  const kerbGeos = [];
  for (const side of [1, -1]) {
    // Where this side needs a kerb: the inside of every corner, the outside of tight ones.
    let on = Array.from({ length: N }, (_, i) => {
      track.at(i * STEP, smp);
      const k = smp.curv;
      return Math.abs(k) > 0.035 && (Math.sign(k) === side || Math.abs(k) > 0.06);
    });
    // Grow each run a little and close small gaps so kerbs start and end cleanly.
    const grow = Math.round(3 / STEP);
    on = on.map((_, i) => {
      for (let d = -grow; d <= grow; d++) if (on[(i + d + N) % N]) return true;
      return false;
    });
    // Sweep each stripe (1.5 m, colored by its index along the lap).
    const STRIPE = 1.5;
    const profile = [[-0.05, 0.034], [0.18, 0.075], [0.92, 0.075], [1.12, 0.03]];
    const red = new THREE.Color(PALETTE.kerbRed);
    const white = new THREE.Color(PALETTE.kerbWhite);
    for (let st = 0; st < track.length / STRIPE; st++) {
      const s0 = st * STRIPE;
      const s1 = Math.min(track.length, s0 + STRIPE);
      if (!on[Math.floor(((s0 + s1) / 2) / STEP) % N]) continue;
      const color = st % 2 ? red : white;
      const pos = [];
      const idx = [];
      const cols = [];
      const steps = 4;
      for (let k = 0; k <= steps; k++) {
        track.at(s0 + ((s1 - s0) * k) / steps, smp);
        const nx = smp.tan.z * side;
        const nz = -smp.tan.x * side;
        for (const [lat, y] of profile) {
          const off = TRACK_WIDTH / 2 + lat;
          pos.push(smp.pos.x + nx * off, y, smp.pos.z + nz * off);
          cols.push(color.r, color.g, color.b);
        }
        if (k) {
          const P = profile.length;
          for (let j = 0; j < P - 1; j++) {
            const a0 = (k - 1) * P + j;
            const b0 = k * P + j;
            if (side > 0) idx.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
            else idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
          }
        }
      }
      const kg = new THREE.BufferGeometry();
      kg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      kg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      kg.setIndex(idx);
      kg.computeVertexNormals();
      // Guarantee upward-facing normals whichever way the path winds.
      if (kg.attributes.normal.getY(1) < 0) {
        const ix = kg.index.array;
        for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
        kg.computeVertexNormals();
      }
      kerbGeos.push(kg);
    }
  }
  if (kerbGeos.length) {
    const kerbs = new THREE.Mesh(merge(kerbGeos, { color: true }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }));
    kerbs.receiveShadow = true;
    g.add(kerbs);
  }
  const m = new THREE.Matrix4();
  const col = new THREE.Color();

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
  const tireGeo = new THREE.TorusGeometry(0.36, 0.17, 5, 10).rotateX(Math.PI / 2);
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
  const count = 22;
  const per = 6;
  const inst = new THREE.InstancedMesh(puff, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: '#F2EBDD', emissiveIntensity: 0.35 }), count * per);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const clouds = [];
  for (let k = 0; k < count; k++) {
    const a = rand() * Math.PI * 2;
    const r = 130 + rand() * 210;
    // Close clouds sit below the islands so they never block the view of them.
    const y = r < 230 ? -55 + rand() * 30 : -30 + rand() * 75;
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
