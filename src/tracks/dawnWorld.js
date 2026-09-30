// Caspian Dawn, the second circuit: builds its world (two floating islands,
// the road with its heights, both bridges, the old city, the waterfall arch,
// the boulevard and its flame towers, a dawn sky) and runs its live parts
// (falling water, the DRS lights, the splash when you drive through the
// waterfall). The Game shows it in place of the Sky Circuit while you drive it.

import * as THREE from 'three';
import { bevelBox, merge, tint, rod } from '../geo.js';
import { buildIsland, buildClouds, asphaltTexture, textTexture, fbm } from '../world/world.js';
import { buildGrandstandHD, buildStartGantry, contour } from '../world/circuit.js';
import { buildDawnTrack, dawnFeatures, dawnWidth, GAP } from './dawnLayout.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
const VERGE = 1.5; // paved strip between the road edge and the barrier
const SUN_DIR = V(0.35, 0.09, 1).normalize(); // sunrise ahead, down the boulevard
const LIGHT_DIR = V(1, 0.7, 0.15).normalize();

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ---- Frames along the lap ---------------------------------------------------------------

function buildFrames(track, width, onIsland, step = 1) {
  const N = Math.round(track.length / step);
  const smp = {};
  const out = [];
  for (let i = 0; i < N; i++) {
    const s = (i * track.length) / N;
    track.at(s, smp);
    const t = smp.tan;
    const l = Math.hypot(t.x, t.z) || 1;
    const n = V(t.z / l, 0, -t.x / l); // left normal, level
    const p = smp.pos.clone();
    const hw = width(s) / 2;
    out.push({ s, p, n, hw, E: hw + VERGE, curv: smp.curv, island: onIsland(p.x, p.z) });
  }
  return out;
}

// Contiguous runs of frames where pred holds (the lap is a loop).
function runs(frames, pred) {
  const N = frames.length;
  const ok = frames.map(pred);
  if (ok.every(Boolean)) return [{ list: frames, closed: true }];
  let start = ok.findIndex((x) => !x);
  const out = [];
  let cur = null;
  for (let k = 1; k <= N; k++) {
    const i = (start + k) % N;
    if (ok[i]) (cur ||= []).push(frames[i]);
    else if (cur) {
      out.push({ list: cur, closed: false });
      cur = null;
    }
  }
  if (cur) out.push({ list: cur, closed: false });
  return out;
}

// A strip swept along frames: prof(f) gives [lateral, y] points (same count
// for every frame, y absolute). Optional per-frame color and UVs.
function strip(list, prof, { closed = false, color = null, uv = null } = {}) {
  const pos = [];
  const cols = [];
  const uvs = [];
  const idx = [];
  const P = prof(list[0]).length;
  list.forEach((f) => {
    const pts = prof(f);
    pts.forEach(([lat, y], j) => {
      pos.push(f.p.x + f.n.x * lat, y, f.p.z + f.n.z * lat);
      if (color) {
        const c = color(f, j);
        cols.push(c.r, c.g, c.b);
      }
      if (uv) uvs.push(...uv(f, j, lat));
    });
  });
  const K = list.length;
  const last = closed ? K : K - 1;
  for (let k = 0; k < last; k++) {
    const k2 = (k + 1) % K;
    for (let j = 0; j < P - 1; j++) {
      const a = k * P + j;
      const b = k2 * P + j;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (color) g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Make a flat strip face up whichever way the lap winds.
function faceUp(g) {
  if (g.attributes.normal.getY(0) < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
    g.computeVertexNormals();
  }
  return g;
}

// A lumpy boulder (icosahedron pushed about by noise).
function boulder(r, seed, squash = 1) {
  const g = new THREE.IcosahedronGeometry(r, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + (fbm(x * 0.35 + seed, y * 0.35, z * 0.35 - seed, 3) - 0.5) * 0.7;
    p.setXYZ(i, x * k, y * k * squash, z * k);
  }
  g.computeVertexNormals();
  return g;
}

// ---- Island shapes -------------------------------------------------------------------------

// Two islands: everything within reach of the road on each side of the sky
// channel, plus the infield each half of the figure of eight wraps around.
function islandShapes(track) {
  const CELL = 2;
  const x0 = -250;
  const z0 = -170;
  const W = Math.ceil(500 / CELL);
  const H = Math.ceil(410 / CELL);
  const MARGIN = 17;
  const mask = new Int8Array(W * H).fill(-1);
  const sides = [-1, 1]; // west, east
  sides.forEach((side, k) => {
    const own = (x) => side * x > GAP;
    const pts = [];
    for (let s = 0; s < track.length; s += 2) {
      const p = track.at(s).pos;
      if (own(p.x)) pts.push(p);
    }
    // Stamp a disc around each road sample.
    const R = Math.ceil(MARGIN / CELL);
    for (const p of pts) {
      const ci = Math.round((p.x - x0) / CELL);
      const cj = Math.round((p.z - z0) / CELL);
      for (let dj = -R; dj <= R; dj++) {
        for (let di = -R; di <= R; di++) {
          if (di * di + dj * dj > R * R) continue;
          const i = ci + di;
          const j = cj + dj;
          if (i < 0 || j < 0 || i >= W || j >= H) continue;
          if (own(x0 + i * CELL)) mask[j * W + i] = k;
        }
      }
    }
    // Fill the infield: this island's stretch of road, closed along the channel.
    const loop = [];
    let s0 = 0;
    for (let s = 0; s < track.length; s += 2) if (!own(track.at(s).pos.x) && own(track.at(s + 2).pos.x)) s0 = s + 2;
    for (let s = s0; s < s0 + track.length; s += 2) {
      const p = track.at(s).pos;
      if (!own(p.x)) break;
      loop.push(p);
    }
    for (let j = 0; j < H; j++) {
      const z = z0 + j * CELL;
      const xs = [];
      for (let a = 0; a < loop.length; a++) {
        const p = loop[a];
        const q = loop[(a + 1) % loop.length];
        if ((p.z <= z && q.z > z) || (q.z <= z && p.z > z)) xs.push(p.x + ((z - p.z) / (q.z - p.z)) * (q.x - p.x));
      }
      xs.sort((a, b) => a - b);
      for (let a = 0; a + 1 < xs.length; a += 2) {
        for (let i = Math.ceil((xs[a] - x0) / CELL); i <= Math.floor((xs[a + 1] - x0) / CELL); i++) {
          if (i >= 0 && i < W && own(x0 + i * CELL)) mask[j * W + i] = k;
        }
      }
    }
  });
  const at = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? -1 : mask[j * W + i]);
  const outlines = sides.map((_, k) => contour(W, H, (i, j) => at(i, j) === k, x0, z0, CELL));
  const onIsland = (x, z) => at(Math.round((x - x0) / CELL), Math.round((z - z0) / CELL)) >= 0;
  return { outlines, onIsland };
}

// ---- Sky -------------------------------------------------------------------------------------

function dawnSky() {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color('#2C3F82') },
      mid: { value: new THREE.Color('#F2A48E') },
      bottom: { value: new THREE.Color('#D99AA8') },
      sunCol: { value: new THREE.Color('#FFD39A') },
      sunDir: { value: SUN_DIR.clone() },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunCol; uniform vec3 sunDir;
      varying vec3 vP;
      void main(){
        vec3 d = normalize(vP);
        float h = d.y;
        vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.55)) : mix(mid, bottom, pow(-h, 0.5));
        float sd = max(dot(d, sunDir), 0.0);
        c += sunCol * (step(0.9993, sd) * 1.6 + pow(sd, 400.0) * 1.2 + pow(sd, 14.0) * 0.4 + pow(sd, 3.0) * 0.18 * (1.0 - abs(h)));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(950, 32, 16), m);
  sky.renderOrder = -1;
  return sky;
}

// ---- Materials with a life of their own ---------------------------------------------------

function waterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, speed: { value: 1.6 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform float time; uniform float speed; varying vec2 vUv;
      float h(float n){ return fract(sin(n) * 43758.5453); }
      void main(){
        // Soft falling strands: neighbouring columns blended so it reads as a sheet.
        float x = vUv.x * 160.0;
        float col = floor(x);
        float fx = fract(x);
        float y0 = vUv.y * 2.5 + time * speed * (0.8 + h(col) * 0.7) + h(col * 1.7) * 5.0;
        float y1 = vUv.y * 2.5 + time * speed * (0.8 + h(col + 1.0) * 0.7) + h((col + 1.0) * 1.7) * 5.0;
        float s0 = smoothstep(0.35, 0.95, fract(y0)) * (1.0 - smoothstep(0.95, 1.0, fract(y0)));
        float s1 = smoothstep(0.35, 0.95, fract(y1)) * (1.0 - smoothstep(0.95, 1.0, fract(y1)));
        float streak = mix(s0, s1, smoothstep(0.2, 0.8, fx));
        float a = 0.42 + 0.45 * streak;
        a *= 0.75 + 0.25 * smoothstep(0.0, 0.25, vUv.y);
        a *= smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
        vec3 c = mix(vec3(0.55, 0.74, 0.86), vec3(0.97, 0.99, 1.0), streak);
        c = mix(c, vec3(1.0, 0.86, 0.78), 0.18);
        gl_FragColor = vec4(c, a);
        #include <colorspace_fragment>
      }`,
  });
}

// LED strip on the barrier tops through the DRS zone: dim dashes when idle,
// amber pulses when DRS is available, a fast green chase when it is open.
function ledMaterial() {
  return new THREE.ShaderMaterial({
    toneMapped: false,
    uniforms: { time: { value: 0 }, state: { value: 0 }, carS: { value: 0 } },
    vertexShader: 'attribute float along; varying float vA; void main(){ vA = along; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform float time; uniform float state; uniform float carS; varying float vA;
      void main(){
        vec3 dark = vec3(0.05, 0.06, 0.07);
        vec3 c;
        if (state < 0.5) {
          c = mix(dark, vec3(0.1, 0.45, 0.25), step(0.6, fract(vA / 4.0)) * 0.6);
        } else if (state < 1.5) {
          float pulse = 0.5 + 0.5 * sin(time * 7.0);
          c = mix(dark, vec3(1.0, 0.62, 0.08) * (1.2 + pulse), step(0.5, fract(vA / 3.0)));
        } else {
          float chase = step(0.55, fract(vA / 5.0 - time * 7.0));
          float near = exp(-abs(vA - carS) / 22.0);
          c = mix(dark, vec3(0.15, 1.0, 0.45) * (1.3 + near * 1.8), max(chase, near * 0.9));
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

function panelTexture(text, on) {
  return textTexture([text], { w: 512, h: 128, bg: on ? '#0e3b1d' : '#11151b', fg: on ? '#46ff7e' : '#5b636e' });
}

// ---- The circuit ----------------------------------------------------------------------------

export class DawnCircuit {
  constructor(game) {
    this.game = game;
    this.id = 'dawn';
    this.name = 'Caspian Dawn';
    this.bestKey = 'skycircuit.bestLap.dawn';
    this.track = buildDawnTrack();
    this.features = dawnFeatures(this.track);
    this.width = dawnWidth(this.features);
    this.drsZones = this.features.drs;
    this.time = 0;
    const { outlines, onIsland } = islandShapes(this.track);
    this.onIsland = onIsland;
    this.frames = buildFrames(this.track, this.width, onIsland);
    this.group = new THREE.Group();
    this.group.name = 'dawn-circuit';
    this.group.visible = false;
    this.water = waterMaterial();
    this.led = ledMaterial();
    this.build(outlines);
    game.hdTextures?.(this.group);
  }

  // How far the car's centre can go from the centreline before it meets the barrier.
  limit(s) {
    return this.width(s) / 2 + 0.05;
  }

  // Grip: the road is wet for a few meters either side of the waterfall.
  grip(s) {
    return this.nearWaterfall(s, 14) ? 0.82 : 1;
  }

  nearWaterfall(s, r) {
    const L = this.track.length;
    const d = Math.abs(((s - this.features.waterfall + L * 1.5) % L) - L / 2);
    return d < r;
  }

  inDrs(s) {
    return this.drsZones.some(([a, b]) => (a <= b ? s >= a && s <= b : s >= a || s <= b));
  }

  build(outlines) {
    const g = this.group;
    const sky = dawnSky();
    sky.userData.shadow = false;
    sky.frustumCulled = false;
    this.sky = sky; // kept centred on the camera, so zoomed out it never clips
    g.add(sky);
    this.clouds = buildClouds(rng(33));
    this.clouds.traverse((o) => (o.userData.shadow = false));
    this.clouds.scale.set(1.5, 1, 1.5);
    this.clouds.traverse((o) => {
      if (o.material) {
        o.material = o.material.clone();
        o.material.emissive.set('#F7B7A3');
        o.material.emissiveIntensity = 0.45;
      }
    });
    g.add(this.clouds);
    outlines.forEach((o, k) => {
      if (o.length > 8) g.add(buildIsland(o, { depth: 42, seed: 40 + k * 9 }));
    });
    this.buildRoad();
    this.buildStructures();
    this.buildBridges();
    this.buildTrackside();
    this.buildOldCity();
    this.buildWaterfall();
    this.buildBoulevard();
    g.traverse((o) => {
      if (o.isMesh && !o.material?.transparent && o.userData.shadow !== false) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  // Road surface, painted lines and kerbs.
  buildRoad() {
    const g = this.group;
    const F = this.frames;
    const asphalt = new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.86 });
    const road = faceUp(strip(F, (f) => [[f.hw, f.p.y + 0.03], [-f.hw, f.p.y + 0.03]], { closed: true, uv: (f, j) => [j, f.s / 4] }));
    const roadMesh = new THREE.Mesh(road, asphalt);
    roadMesh.userData.shadow = false;
    g.add(roadMesh);
    // Paint sits a few mm over the asphalt: a depth offset keeps it crisp from far away.
    const white = mat('#F2F2EE', { roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const lines = [];
    for (const side of [1, -1]) lines.push(faceUp(strip(F, (f) => [[side * (f.hw - 0.23), f.p.y + 0.045], [side * (f.hw - 0.47), f.p.y + 0.045]], { closed: true })));
    const lineMesh = new THREE.Mesh(merge(lines), white);
    lineMesh.userData.shadow = false;
    g.add(lineMesh);

    // Kerbs on the inside of corners (and both sides of tight ones), striped.
    const red = new THREE.Color('#D8312B');
    const wh = new THREE.Color('#F2F2EE');
    const kerbs = [];
    for (const side of [1, -1]) {
      const need = (f) => Math.abs(f.curv) > 0.03 && (Math.sign(f.curv) === side || Math.abs(f.curv) > 0.055);
      const grown = F.map((_, i) => {
        for (let d = -3; d <= 3; d++) if (need(F[(i + d + F.length) % F.length])) return true;
        return false;
      });
      for (const r of runs(F, (_, i) => grown[i])) {
        if (r.list.length < 3) continue;
        kerbs.push(
          faceUp(
            strip(r.list, (f) => [[side * (f.hw - 0.05), f.p.y + 0.04], [side * (f.hw + 0.25), f.p.y + 0.09], [side * (f.hw + 1.0), f.p.y + 0.09], [side * (f.hw + 1.15), f.p.y + 0.035]], {
              closed: r.closed,
              color: (f) => (Math.floor(f.s / 1.5) % 2 ? red : wh),
            })
          )
        );
      }
    }
    const kerbMesh = new THREE.Mesh(merge(kerbs, { color: true }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    kerbMesh.userData.shadow = false;
    g.add(kerbMesh);

    // Start / finish checkers and grid slots, DRS lines and letters.
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
    g.add(this.decal(0, DAWN_W(this) - 0.6, 1.2, new THREE.MeshStandardMaterial({ map: ct, roughness: 0.7 })));
    const slots = [];
    for (let i = 1; i <= 6; i++) {
      const f = this.frameAt(this.track.length - i * 8);
      const side = i % 2 ? 1 : -1;
      // A bracket: a bar across the slot and two arms trailing back.
      const lat = side * 2.6;
      slots.push(this.decalGeo(f, lat, 2.2, 0.15, 0.05), this.decalGeo(f, lat - 1.05, 0.15, 1.2, 0.05, -0.6), this.decalGeo(f, lat + 1.05, 0.15, 1.2, 0.05, -0.6));
    }
    g.add(new THREE.Mesh(merge(slots), white));
    const [zoneA] = this.drsZones[0];
    const lineGeo = [this.decalGeo(this.frameAt(this.features.drsDetect), 0, 12, 0.35, 0.05), this.decalGeo(this.frameAt(zoneA), 0, 12, 0.5, 0.05)];
    g.add(new THREE.Mesh(merge(lineGeo), white));
    const drsTex = textTexture(['DRS'], { w: 512, h: 256, bg: 'rgba(0,0,0,0)', fg: '#F2F2EE' });
    const drsMat = new THREE.MeshStandardMaterial({ map: drsTex, transparent: true, roughness: 0.6, depthWrite: false });
    const letters = this.decal(zoneA + 10, 7, 4.4, drsMat);
    letters.renderOrder = 1;
    g.add(letters);
    // Wet patch under the waterfall.
    const ws = this.features.waterfall;
    const wet = runs(F, (f) => this.nearWaterfall(f.s, 16))[0];
    if (wet) {
      const wetGeo = faceUp(strip(wet.list, (f) => [[f.hw + 0.9, f.p.y + 0.05], [-f.hw - 0.9, f.p.y + 0.05]]));
      const wetMesh = new THREE.Mesh(wetGeo, new THREE.MeshStandardMaterial({ color: '#27313b', roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.55, depthWrite: false }));
      wetMesh.renderOrder = 1;
      g.add(wetMesh);
    }
    this.waterfallFrame = this.frameAt(ws);
  }

  frameAt(s) {
    const L = this.track.length;
    const i = Math.round((((s % L) + L) % L) / (L / this.frames.length)) % this.frames.length;
    return this.frames[i];
  }

  // A flat rectangle painted on the road at a frame: across (lateral) by along, centred at lat.
  decalGeo(f, lat, across, along, lift, dAlong = 0) {
    const geo = new THREE.PlaneGeometry(across, along).rotateX(-Math.PI / 2);
    const fwd = V(-f.n.z, 0, f.n.x); // left normal turned back to the heading
    const m = new THREE.Matrix4().makeBasis(f.n.clone().negate(), V(0, 1, 0), fwd.clone().negate());
    geo.applyMatrix4(m);
    const c = f.p.clone().addScaledVector(f.n, lat).addScaledVector(fwd, dAlong);
    geo.translate(c.x, f.p.y + lift, c.z);
    return geo;
  }

  decal(s, across, along, material) {
    const m = new THREE.Mesh(this.decalGeo(this.frameAt(s), 0, across, along, 0.055), material);
    m.userData.shadow = false;
    return m;
  }

  // The road's body: raised on stone where it climbs, on columns where it is
  // high, a deck over the sky; jersey barriers along both sides.
  buildStructures() {
    const g = this.group;
    const F = this.frames;
    const bottom = (f) => (f.island ? (f.p.y > 3.2 ? f.p.y - 1.4 : -0.9) : f.p.y - 1.8);
    const body = strip(F, (f) => [[f.E, f.p.y - 0.02], [f.E, bottom(f)], [-f.E, bottom(f)], [-f.E, f.p.y - 0.02]], { closed: true });
    g.add(new THREE.Mesh(body, mat('#CDB799', { roughness: 0.9, side: THREE.DoubleSide })));
    // Paving only beside the road (not under it, where the two would flicker from afar).
    const paving = merge([1, -1].map((side) => faceUp(strip(F, (f) => [[side * f.E, f.p.y + 0.012], [side * (f.hw - 0.05), f.p.y + 0.012]], { closed: true }))));
    const pave = new THREE.Mesh(paving, mat('#B9AE9E', { roughness: 0.9 }));
    pave.userData.shadow = false;
    g.add(pave);
    // Columns under the high road on the islands.
    const cols = [];
    let last = -99;
    for (const f of F) {
      if (!f.island || f.p.y < 3.4 || f.s - last < 11) continue;
      last = f.s;
      for (const side of [1, -1]) {
        const b = f.p.clone().addScaledVector(f.n, side * (f.hw - 1.2));
        cols.push(rod(b.clone().setY(-0.8), b.clone().setY(f.p.y - 1.3), 0.75, 10));
      }
      cols.push(bevelBox(2 * f.hw, 0.9, 1.6, 0.08).applyMatrix4(new THREE.Matrix4().makeBasis(f.n, V(0, 1, 0), V(-f.n.z, 0, f.n.x).negate())).translate(f.p.x, f.p.y - 1.6, f.p.z));
    }
    if (cols.length) g.add(new THREE.Mesh(merge(cols), mat('#D9CDBB', { roughness: 0.8 })));
    // Barriers: white concrete with a red cap band on the islands, and the band teal on the bridges.
    const jersey = [[0, 0], [0.55, 0], [0.45, 0.25], [0.18, 0.4], [0.15, 0.95], [0, 0.95]];
    const walls = [];
    const wallCol = new THREE.Color('#EFEBE4');
    for (const side of [1, -1]) {
      walls.push(strip(F, (f) => jersey.map(([x, y]) => [side * (f.E - x), f.p.y + y]), { closed: true, color: () => wallCol }));
      const band = (f) => new THREE.Color(f.island ? '#C8372D' : '#1FB5B0');
      walls.push(strip(F, (f) => [[side * (f.E - 0.15), f.p.y + 0.8], [side * (f.E - 0.15), f.p.y + 0.97], [side * (f.E + 0.01), f.p.y + 0.97]], { closed: true, color: band }));
    }
    g.add(new THREE.Mesh(merge(walls, { color: true }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide })));
    // DRS LED strips along the barrier tops.
    const leds = [];
    for (const [a, b] of this.drsZones) {
      const list = runs(F, (f) => (a <= b ? f.s >= a && f.s <= b : f.s >= a || f.s <= b))[0]?.list;
      if (!list) continue;
      for (const side of [1, -1]) {
        const geo = strip(list, (f) => [[side * (f.E - 0.16), f.p.y + 0.98], [side * (f.E - 0.16), f.p.y + 1.1]]);
        const along = [];
        list.forEach((f) => along.push(f.s, f.s));
        geo.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
        leds.push(geo);
      }
    }
    if (leds.length) {
      const m = new THREE.Mesh(mergeWith(leds, ['along']), this.led);
      m.userData.shadow = false;
      g.add(m);
    }
  }

  // The high bridge (cable-stayed, pylons on both rims) and the low bridge
  // (steel arches hanging below), both with catch fencing.
  buildBridges() {
    const g = this.group;
    const F = this.frames;
    const steel = mat('#E4E7EA', { roughness: 0.35, metalness: 0.55 });
    const parts = [];
    const fences = [];
    for (const r of runs(F, (f) => !f.island)) {
      const L = r.list;
      const high = L[Math.floor(L.length / 2)].p.y > 4;
      for (const side of [1, -1]) {
        fences.push(strip(L, (f) => [[side * (f.E - 0.1), f.p.y + 0.95], [side * (f.E - 0.1), f.p.y + 3.6]]));
        for (let k = 0; k < L.length; k += 4) {
          const f = L[k];
          const b = f.p.clone().addScaledVector(f.n, side * (f.E - 0.1)).setY(f.p.y + 0.9);
          parts.push(rod(b, b.clone().setY(f.p.y + 3.7), 0.05, 5));
        }
      }
      if (high) {
        // Pylons just back from each rim, cables fanned to the deck.
        for (const end of [0, L.length - 1]) {
          const f = L[end];
          const inward = end === 0 ? 1 : -1;
          const topY = f.p.y + 22;
          const tops = [];
          for (const side of [1, -1]) {
            const base = f.p.clone().addScaledVector(f.n, side * (f.E + 1.2));
            const top = base.clone().addScaledVector(f.n, -side * 2.2).setY(topY);
            parts.push(rod(base.clone().setY(-1), top, 0.7, 10));
            tops.push(top);
            for (let c = 1; c <= 5; c++) {
              const ff = L[Math.max(0, Math.min(L.length - 1, end + inward * c * 6))];
              const anchor = ff.p.clone().addScaledVector(ff.n, side * (ff.E - 0.4)).setY(ff.p.y + 0.9);
              parts.push(rod(top.clone().setY(topY - c * 0.9), anchor, 0.06, 4));
              const back = this.frameAt(f.s - inward * c * 6);
              const banchor = back.p.clone().addScaledVector(back.n, side * (back.E - 0.4)).setY(back.p.y + 0.9);
              parts.push(rod(top.clone().setY(topY - c * 0.9), banchor, 0.06, 4));
            }
          }
          parts.push(rod(tops[0], tops[1], 0.5, 8));
          parts.push(rod(tops[0].clone().setY(f.p.y + 12), tops[1].clone().setY(f.p.y + 12), 0.4, 8));
        }
      } else {
        // Arches below the deck between the rims.
        const sag = Math.min(14, 4 + L.length * 0.14);
        for (const side of [1, -1]) {
          const arch = L.map((f, k) => f.p.clone().addScaledVector(f.n, side * (f.hw - 0.8)).setY(f.p.y - 1.8 - sag * Math.sin((Math.PI * k) / (L.length - 1))));
          for (let k = 0; k < arch.length - 1; k += 1) parts.push(rod(arch[k], arch[k + 1], 0.36, 8));
          for (let k = 3; k < arch.length - 3; k += 4) parts.push(rod(arch[k], arch[k].clone().setY(L[k].p.y - 1.75), 0.08, 5));
          if (side > 0) for (let k = 4; k < arch.length - 4; k += 8) parts.push(rod(arch[k], arch[k].clone().addScaledVector(L[k].n, -2 * (L[k].hw - 0.8)), 0.08, 5));
        }
      }
    }
    const st = new THREE.Mesh(merge(parts), steel);
    g.add(st);
    const fence = new THREE.Mesh(merge(fences), new THREE.MeshStandardMaterial({ color: '#3a3f47', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    g.add(fence);
  }

  // Street lamps, the start gantry, DRS gantries and the grandstand.
  buildTrackside() {
    const g = this.group;
    const F = this.frames;
    // Lamps on the barrier tops, leaning over the road; warm heads still lit at dawn.
    const post = merge([rod(V(0, 0, 0), V(0, 7.2, 0), 0.1, 6), rod(V(0, 7.2, 0), V(-2.2, 7.6, 0), 0.07, 5)]);
    const head = bevelBox(0.9, 0.18, 0.4, 0.05).translate(-2.3, 7.5, 0);
    const spots = [];
    for (let k = 0, i = 0; k < F.length; k += 34, i++) {
      const f = F[k];
      const side = i % 2 ? 1 : -1;
      const b = f.p.clone().addScaledVector(f.n, side * (f.E - 0.1)).setY(f.p.y + 0.95);
      const x = f.n.clone().multiplyScalar(side);
      spots.push(new THREE.Matrix4().makeBasis(x, V(0, 1, 0), x.clone().cross(V(0, 1, 0))).setPosition(b));
    }
    const posts = new THREE.InstancedMesh(post, mat('#2B2F36', { roughness: 0.5, metalness: 0.4 }), spots.length);
    const heads = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ color: '#fff3dc', emissive: '#ffcf8a', emissiveIntensity: 2.2 }), spots.length);
    spots.forEach((m, i) => {
      posts.setMatrixAt(i, m);
      heads.setMatrixAt(i, m);
    });
    g.add(posts, heads);

    // Start lights over the line (the gantry spans the road; the straight runs south).
    const f0 = this.frameAt(0);
    const sg = buildStartGantry(0, 0);
    const fwd0 = V(-f0.n.z, 0, f0.n.x);
    sg.rotation.y = Math.atan2(-fwd0.z, fwd0.x); // its lights face the grid
    sg.position.set(f0.p.x, f0.p.y, f0.p.z);
    g.add(sg);

    // DRS gantries: detection, and the zone start whose panel turns green.
    this.panels = [];
    const gantry = (s, label) => {
      const f = this.frameAt(s);
      const parts = [];
      for (const side of [1, -1]) {
        const b = f.p.clone().addScaledVector(f.n, side * (f.E + 0.4));
        parts.push(rod(b.clone().setY(f.p.y - 0.5), b.clone().setY(f.p.y + 7.4), 0.22, 8));
      }
      const a = f.p.clone().addScaledVector(f.n, f.E + 0.4).setY(f.p.y + 7);
      const b = f.p.clone().addScaledVector(f.n, -(f.E + 0.4)).setY(f.p.y + 7);
      parts.push(rod(a, b, 0.3, 8), rod(a.clone().setY(f.p.y + 7.6), b.clone().setY(f.p.y + 7.6), 0.14, 6));
      g.add(new THREE.Mesh(merge(parts), mat('#2B2F36', { roughness: 0.4, metalness: 0.5 })));
      const off = panelTexture(label, false);
      const on = panelTexture(label, true);
      const pm = new THREE.MeshBasicMaterial({ map: off, toneMapped: false });
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), pm);
      const fwd = V(-f.n.z, 0, f.n.x);
      panel.position.copy(f.p).setY(f.p.y + 6.2).addScaledVector(fwd, -0.35);
      panel.lookAt(panel.position.clone().addScaledVector(fwd, -1));
      const back = new THREE.Mesh(bevelBox(6.3, 1.8, 0.3, 0.05), mat('#1C1D20'));
      back.position.copy(panel.position).addScaledVector(fwd, 0.18);
      back.quaternion.copy(panel.quaternion);
      g.add(back, panel);
      this.panels.push({ pm, off, on });
    };
    gantry(this.features.drsDetect, 'DRS DETECTION');
    gantry(this.drsZones[0][0], 'DRS ZONE');

    // Grandstand facing the boulevard straight from the infield.
    const fs = this.frameAt(this.track.nearest(V(200, 0, 70)));
    this.stand = buildGrandstandHD({ len: 40 });
    const inward = fs.n.clone().negate(); // infield side of the southbound straight
    this.stand.position.copy(fs.p).addScaledVector(inward, fs.E + 3.4).setY(0);
    this.stand.rotation.y = Math.atan2(-inward.x, -inward.z);
    g.add(this.stand);
  }

  // Old city: crenellated walls along the climb and the horseshoe, a stone
  // tower, a minaret and flat-roofed sandstone houses in the infield.
  buildOldCity() {
    const g = this.group;
    const F = this.frames;
    const [a] = this.features.castle;
    const [, b] = this.features.horseshoe;
    const stone = [];
    const r = rng(12);
    const wallF = F.filter((f) => f.s >= a - 20 && f.s <= b + 16);
    let bast = 0;
    for (let k = 0; k < wallF.length; k += 3) {
      const f = wallF[k];
      const lat = -(f.E + 2.8);
      const c = f.p.clone().addScaledVector(f.n, lat);
      const top = Math.max(0, f.p.y) + 4.6;
      const yaw = Math.atan2(-f.n.x, -f.n.z); // box length along the road
      stone.push(tint(bevelBox(3.3, top + 1, 1.6, 0.08).rotateY(yaw).translate(c.x, top / 2 - 0.5, c.z), '#D2B488'));
      for (const d of [-0.8, 0.8]) {
        const along = V(-f.n.z, 0, f.n.x).multiplyScalar(d);
        stone.push(tint(bevelBox(0.9, 1.1, 1.6, 0.05).rotateY(yaw).translate(c.x + along.x, top + 0.55, c.z + along.z), '#C9A97B'));
      }
      if (f.s - bast > 46) {
        bast = f.s;
        const t = f.p.clone().addScaledVector(f.n, lat - 1.2);
        stone.push(tint(new THREE.CylinderGeometry(3, 3.4, top + 3, 16).translate(t.x, (top + 3) / 2 - 0.5, t.z), '#CCAE82'));
        for (let m = 0; m < 10; m++) {
          const ang = (m / 10) * Math.PI * 2;
          stone.push(tint(bevelBox(0.9, 1, 0.9, 0.05).translate(t.x + Math.cos(ang) * 2.8, top + 3, t.z + Math.sin(ang) * 2.8), '#C9A97B'));
        }
      }
    }
    // The stone tower (a round keep with a buttress), in the infield.
    const tp = this.findClear(V(-165, 0, -40), 16);
    stone.push(tint(new THREE.CylinderGeometry(7.5, 8.2, 30, 28).translate(tp.x, 14.5, tp.z), '#CFB083'));
    stone.push(tint(bevelBox(6, 26, 7, 0.2).translate(tp.x + 8.5, 12.5, tp.z), '#C8A87A'));
    for (let m = 0; m < 16; m++) {
      const ang = (m / 16) * Math.PI * 2;
      stone.push(tint(bevelBox(1.1, 1.1, 1.1, 0.05).translate(tp.x + Math.cos(ang) * 7.2, 30, tp.z + Math.sin(ang) * 7.2), '#C9A97B'));
    }
    const slits = [];
    for (let m = 0; m < 14; m++) {
      const ang = r() * Math.PI * 2;
      const y = 5 + r() * 22;
      slits.push(new THREE.BoxGeometry(0.5, 1.6, 0.5).translate(tp.x + Math.cos(ang) * 7.6, y, tp.z + Math.sin(ang) * 7.6));
    }
    // A minaret.
    const mp = this.findClear(V(-150, 0, 20), 8);
    stone.push(tint(new THREE.CylinderGeometry(1.7, 2.2, 24, 14).translate(mp.x, 11.5, mp.z), '#DCC49C'));
    stone.push(tint(new THREE.CylinderGeometry(2.8, 2.1, 1.2, 14).translate(mp.x, 18, mp.z), '#CDB088'));
    stone.push(tint(new THREE.ConeGeometry(1.8, 4, 14).translate(mp.x, 25.5, mp.z), '#5C8E86'));
    // Houses.
    this.houseSpots = [];
    for (let tries = 0; tries < 400 && this.houseSpots.length < 46; tries++) {
      const p = V(-196 + r() * 150, 0, -110 + r() * 250);
      if (!this.onIsland(p.x, p.z)) continue;
      const w = 5 + r() * 5;
      const d = 5 + r() * 5;
      if (!this.clearOf(p, Math.max(w, d) * 0.75 + 4)) continue;
      if (p.distanceTo(tp) < 16 || p.distanceTo(mp) < 8) continue;
      if (this.houseSpots.some((q) => q.distanceTo(p) < 9)) continue;
      if (this.waterfallFrame && p.distanceTo(this.waterfallFrame.p.clone().setY(0)) < 34) continue;
      this.houseSpots.push(p);
      const h = 3.5 + r() * 5.5;
      const col = ['#DCC39B', '#D4B68B', '#E3CFAE', '#CFAE84'][Math.floor(r() * 4)];
      const yaw = r() * Math.PI;
      stone.push(tint(bevelBox(w, h, d, 0.12).rotateY(yaw).translate(p.x, h / 2 - 0.2, p.z), col));
      stone.push(tint(bevelBox(w + 0.3, 0.45, d + 0.3, 0.06).rotateY(yaw).translate(p.x, h, p.z), '#B99B72'));
      for (let m = 0; m < 3; m++) {
        const side = r() < 0.5 ? 1 : -1;
        const wx = (r() - 0.5) * (w - 1.5);
        const wy = 1.6 + r() * Math.max(0.1, h - 3);
        slits.push(new THREE.BoxGeometry(0.9, 1.3, 0.2).translate(wx, wy, side * (d / 2 + 0.02)).rotateY(yaw).translate(p.x, 0, p.z));
      }
    }
    g.add(new THREE.Mesh(merge(stone, { color: true }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })));
    g.add(new THREE.Mesh(merge(slits), mat('#3a2e27', { roughness: 1 })));
  }

  // Is p at least `r` meters clear of the road (edge, verge and barrier included)?
  clearOf(p, r) {
    for (const f of this.frames) {
      if (Math.abs(f.p.x - p.x) > r + 12 || Math.abs(f.p.z - p.z) > r + 12) continue;
      if (Math.hypot(f.p.x - p.x, f.p.z - p.z) < f.E + r) return false;
    }
    return true;
  }

  findClear(p, r) {
    const q = p.clone();
    for (let k = 0; k < 60 && !this.clearOf(q, r); k++) q.set(p.x + Math.cos(k) * k * 1.5, 0, p.z + Math.sin(k) * k * 1.5);
    return q;
  }

  // A natural rock arch over the road with water pouring off it across the
  // whole width, fed by a cascade down a rocky hill in the infield.
  buildWaterfall() {
    const g = this.group;
    const f = this.waterfallFrame;
    const fwd = V(-f.n.z, 0, f.n.x);
    const rocks = [];
    const R = rng(5);
    const top = f.p.y + 7.2;
    for (const side of [1, -1]) {
      for (let k = 0; k < 4; k++) {
        const c = f.p.clone().addScaledVector(f.n, side * (f.E + 1.4 + R() * 1.2)).addScaledVector(fwd, (R() - 0.5) * 3);
        const y = k * 2.6;
        rocks.push(boulder(2.6 + R() * 0.8, k * 7 + side, 1.1).translate(c.x, y, c.z));
      }
    }
    // The lintel, a run of boulders across the top.
    for (let k = -5; k <= 5; k++) {
      const lat = (k / 5) * (f.E + 2);
      const c = f.p.clone().addScaledVector(f.n, lat);
      rocks.push(boulder(2.4 + R() * 0.6, 30 + k, 0.8).translate(c.x, top + 1.6 + R() * 0.5, c.z));
    }
    // The hill it pours from, on the infield side.
    const hill = f.p.clone().addScaledVector(f.n, f.E + 13).setY(0);
    for (let k = 0; k < 14; k++) {
      const a = R() * Math.PI * 2;
      const d = R() * 9;
      const r = 4 + R() * 4;
      rocks.push(boulder(r, 60 + k, 0.9).translate(hill.x + Math.cos(a) * d, r * 0.5 + (9 - d) * 0.9, hill.z + Math.sin(a) * d));
    }
    const rockMesh = new THREE.Mesh(merge(rocks), new THREE.MeshStandardMaterial({ color: '#9C7C60', roughness: 0.95, flatShading: true }));
    g.add(rockMesh);
    // Moss and a few shrubs on the rocks.
    const moss = [];
    for (let k = 0; k < 22; k++) {
      const a = R() * Math.PI * 2;
      const d = 3 + R() * 10;
      moss.push(new THREE.IcosahedronGeometry(1 + R() * 1.2, 1).translate(hill.x + Math.cos(a) * d, 8 + R() * 8 - d * 0.4, hill.z + Math.sin(a) * d));
    }
    g.add(new THREE.Mesh(merge(moss), mat('#5E8A45', { flatShading: true })));

    // Water: the curtain across the road, a stream over the lintel from the
    // hill, and the cascade down the hill face.
    const across = 2 * f.E + 1.5;
    const curtain = new THREE.PlaneGeometry(across, top - f.p.y + 0.2, 1, 1);
    const basis = new THREE.Matrix4().makeBasis(f.n.clone().negate(), V(0, 1, 0), fwd.clone().negate());
    for (const off of [-0.25, 0.25]) {
      const m = new THREE.Mesh(curtain.clone().applyMatrix4(basis), this.water);
      m.position.copy(f.p).addScaledVector(fwd, off).setY((top + f.p.y) / 2);
      m.renderOrder = 2;
      g.add(m);
    }
    const cascade = new THREE.PlaneGeometry(6, 11, 1, 1);
    const cm = new THREE.Mesh(cascade, this.water);
    const face = f.p.clone().addScaledVector(f.n, f.E + 6.5);
    cm.position.set(face.x, 5.5, face.z);
    cm.lookAt(f.p.x, 5.5, f.p.z);
    cm.rotateX(-0.18);
    cm.renderOrder = 2;
    g.add(cm);
    this.mistAt = [f.p.clone().setY(f.p.y + 0.4), face.clone().setY(0.6)];
    this.waterfallFwd = fwd;
  }

  // The boulevard: palms along the straight, and three flame towers in the infield.
  buildBoulevard() {
    const g = this.group;
    const F = this.frames;
    const R = rng(8);
    // Palms.
    const trunk = new THREE.CylinderGeometry(0.22, 0.38, 8, 7, 6);
    const tp = trunk.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const y = tp.getY(i) + 4;
      tp.setX(i, tp.getX(i) + (y / 8) ** 2 * 0.9);
      tp.setY(i, y);
    }
    trunk.computeVertexNormals();
    const leaves = [];
    for (let k = 0; k < 8; k++) {
      const leaf = new THREE.PlaneGeometry(1.1, 5, 1, 5).translate(0, 2.5, 0);
      const lp = leaf.attributes.position;
      for (let i = 0; i < lp.count; i++) {
        const t = lp.getY(i) / 5;
        lp.setZ(i, -t * t * 2.2);
        lp.setX(i, lp.getX(i) * (1 - t * 0.7));
      }
      leaf.rotateX(-Math.PI / 2 + 0.5).rotateY((k / 8) * Math.PI * 2).translate(0.9, 8, 0);
      leaves.push(leaf);
    }
    const crown = merge(leaves);
    crown.computeVertexNormals();
    const spots = [];
    const straight = F.filter((f) => Math.abs(f.p.x - 200) < 4 && f.p.z > -60 && f.p.z < 170);
    for (let k = 0; k < straight.length; k += 13) {
      const f = straight[k];
      for (const side of [1, -1]) {
        const p = f.p.clone().addScaledVector(f.n, side * (f.E + 3.5 + R() * 1.5)).setY(0);
        if (side < 0 && p.distanceTo(this.stand.position) < 32) continue;
        if (!this.onIsland(p.x, p.z)) continue;
        spots.push(new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), R() * 6.28), V(1, 0.9 + R() * 0.3, 1)));
      }
    }
    const trunks = new THREE.InstancedMesh(trunk, mat('#8B6B4A', { roughness: 0.95 }), spots.length);
    const crowns = new THREE.InstancedMesh(crown, mat('#4F8A3E', { roughness: 0.8, side: THREE.DoubleSide }), spots.length);
    spots.forEach((m, i) => {
      trunks.setMatrixAt(i, m);
      crowns.setMatrixAt(i, m);
    });
    g.add(trunks, crowns);

    // Flame towers: curved glass blades catching the sunrise.
    const winTex = (() => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 256;
      const x = c.getContext('2d');
      x.fillStyle = '#000';
      x.fillRect(0, 0, 64, 256);
      const rr = rng(4);
      for (let j = 0; j < 64; j++) for (let i = 0; i < 16; i++) {
        const v = rr();
        x.fillStyle = v > 0.82 ? '#ffd9a0' : v > 0.5 ? '#6b4a3a' : '#2a2230';
        x.fillRect(i * 4 + 1, j * 4 + 1, 2, 2);
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(3, 2);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const glass = new THREE.MeshStandardMaterial({ color: '#4F6C9E', metalness: 0.35, roughness: 0.22, emissive: '#FFB27A', emissiveMap: winTex, emissiveIntensity: 1.5 });
    const flame = (H, R0, lean) => {
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const r = R0 * (0.82 + 0.3 * Math.sin(Math.PI * Math.min(1, t * 1.25))) * (1 - Math.pow(t, 2.4)) + 0.2;
        pts.push(new THREE.Vector2(r, t * H));
      }
      const geo = new THREE.LatheGeometry(pts, 28);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = p.getY(i) / H;
        p.setZ(i, p.getZ(i) * 0.62);
        p.setX(i, p.getX(i) + t * t * lean);
      }
      geo.computeVertexNormals();
      return geo;
    };
    const centre = this.findClear(V(118, 0, 60), 26);
    const towers = [
      [0, 0, 62, 11, 7, 0.2],
      [-22, 18, 52, 10, -6, 2.4],
      [20, 22, 56, 10.5, 6, 4.3],
    ];
    const plinth = [];
    for (const [dx, dz, H, R0, lean, yaw] of towers) {
      const m = new THREE.Mesh(flame(H, R0, lean), glass);
      m.position.set(centre.x + dx, 0, centre.z + dz);
      m.rotation.y = yaw;
      g.add(m);
      plinth.push(new THREE.CylinderGeometry(R0 + 3, R0 + 3.6, 1.2, 24).translate(centre.x + dx, 0.2, centre.z + dz));
    }
    g.add(new THREE.Mesh(merge(plinth), mat('#D7CCBC')));
  }

  // ---- Enter / leave / update ---------------------------------------------------------------

  // Show this world in place of the Sky Circuit: its scenery hidden (except
  // `keep`), the dawn light and fog on. Used both for driving and for just
  // looking round the islands from the main page.
  show(keep = []) {
    if (this.shown) return;
    this.shown = true;
    const game = this.game;
    const scene = game.scene;
    if (!this.group.parent) scene.add(this.group);
    const keepSet = new Set([this.group, game.particles.points, game.hemi, game.sun, game.sun.target, ...keep]);
    this.hidden = scene.children.filter((o) => o.visible && !keepSet.has(o) && !o.isLight);
    this.hidden.forEach((o) => (o.visible = false));
    this.group.visible = true;
    // Dawn light: a low, warm sun ahead down the boulevard, a pink sky fill.
    const sun = game.sun;
    this.saved = {
      sunColor: sun.color.clone(),
      sunI: sun.intensity,
      hemiSky: game.hemi.color.clone(),
      hemiGround: game.hemi.groundColor.clone(),
      hemiI: game.hemi.intensity,
      fog: scene.fog.color.clone(),
      near: scene.fog.near,
      far: scene.fog.far,
      clear: game.renderer.getClearColor(new THREE.Color()),
      env: scene.environmentIntensity,
      envRot: scene.environmentRotation.clone(),
      shadow: { l: sun.shadow.camera.left, r: sun.shadow.camera.right, t: sun.shadow.camera.top, b: sun.shadow.camera.bottom, far: sun.shadow.camera.far },
      sunPos: sun.position.clone(),
      target: sun.target.position.clone(),
      sat: game.post.grade.uniforms.saturation.value,
    };
    sun.color.set('#FFB98C');
    sun.intensity = 2.2;
    game.hemi.color.set('#FFD9C7');
    game.hemi.groundColor.set('#4B3E5E');
    game.hemi.intensity = 0.95;
    scene.fog.color.set('#EDB4A3');
    scene.fog.near = 260;
    scene.fog.far = 1000;
    game.renderer.setClearColor('#EDB4A3');
    scene.environmentIntensity = 0.42;
    scene.environmentRotation.set(0, Math.PI / 2, 0); // keeps the studio lights out of the nose reflection down the boulevard
    game.post.grade.uniforms.saturation.value = 1.08;
    this.setShadow(false);
  }

  hide() {
    if (!this.shown) return;
    this.shown = false;
    const game = this.game;
    const scene = game.scene;
    this.group.visible = false;
    this.hidden?.forEach((o) => (o.visible = true));
    this.hidden = null;
    const s = this.saved;
    const sun = game.sun;
    sun.color.copy(s.sunColor);
    sun.intensity = s.sunI;
    game.hemi.color.copy(s.hemiSky);
    game.hemi.groundColor.copy(s.hemiGround);
    game.hemi.intensity = s.hemiI;
    scene.fog.color.copy(s.fog);
    scene.fog.near = s.near;
    scene.fog.far = s.far;
    game.renderer.setClearColor(s.clear);
    scene.environmentIntensity = s.env;
    scene.environmentRotation.copy(s.envRot);
    game.post.grade.uniforms.saturation.value = s.sat;
    const sc = sun.shadow.camera;
    Object.assign(sc, { left: s.shadow.l, right: s.shadow.r, top: s.shadow.t, bottom: s.shadow.b, far: s.shadow.far });
    sc.updateProjectionMatrix();
    sun.position.copy(s.sunPos);
    sun.target.position.copy(s.target);
    this.saved = null;
  }

  // Shadows: a tight box that follows the car while driving, or one box over
  // both islands when looking round.
  setShadow(follow) {
    const sun = this.game.sun;
    const sc = sun.shadow.camera;
    const r = follow ? 70 : 250;
    sc.left = sc.bottom = -r;
    sc.right = sc.top = r;
    sc.far = follow ? 700 : 1100;
    sc.updateProjectionMatrix();
    if (!follow) {
      sun.target.position.set(0, 0, 30);
      sun.position.copy(sun.target.position).addScaledVector(LIGHT_DIR, 520);
    }
  }

  enter(player) {
    this.show([player.car.root]);
    this.player = player;
    player.car.root.visible = true;
    this.setShadow(true);
    this.passedWaterfall = false;
  }

  // Leaving the car: back to looking round this world if the main page is
  // showing it, otherwise back to the Sky Circuit.
  exit() {
    const game = this.game;
    const car = this.player?.car;
    this.player = null;
    game.ui.root.querySelector('.splash-fx')?.remove();
    document.body.classList.remove('drs-open');
    if (game.world === this.id) {
      if (car && this.hidden?.includes(car.root)) car.root.visible = false;
      this.setShadow(false);
    } else this.hide();
  }

  update(dt, player = this.player) {
    this.time += dt;
    const game = this.game;
    this.water.uniforms.time.value = this.time;
    this.led.uniforms.time.value = this.time;
    this.sky.position.copy(game.camera.position);
    this.clouds.userData.update?.(this.time);
    this.stand.userData.update?.(this.time, player?.drs ? 0.8 : 0.2);
    const cam = game.camera.position;
    if (cam.distanceTo(this.mistAt[0]) < 160 && Math.random() < dt * 30) {
      for (const m of this.mistAt) game.particles.emit({ pos: m, vel: V(0, 0.8, 0), color: ['#ffffff', '#e9f4fb', '#f7e6df'], life: 1.4, size: 1.1, gravity: 0.2, drag: 1.2, spread: 2.2, count: 2, jitter: 5 });
    }
    if (!player) {
      this.led.uniforms.state.value = 0;
      return;
    }
    // Shadows follow the car.
    const sun = game.sun;
    sun.target.position.copy(player.pos);
    // The light comes from higher and further east than the sun disc, so the
    // glossy nose does not flare straight back into the cockpit camera.
    sun.position.copy(player.pos).addScaledVector(LIGHT_DIR, 320);
    // DRS lights and panels.
    const inZone = this.inDrs(player.s);
    const state = player.drs ? 2 : inZone && player.v > 18 ? 1 : 0;
    this.led.uniforms.state.value = state;
    this.led.uniforms.carS.value = player.s;
    for (const p of this.panels) {
      const want = state === 2 ? p.on : p.off;
      if (p.pm.map !== want) {
        p.pm.map = want;
        p.pm.needsUpdate = true;
      }
    }
    document.body.classList.toggle('drs-open', !!player.drs);
    // Driving through the waterfall soaks you.
    const through = this.nearWaterfall(player.s, 2.5) && Math.abs(player.lat ?? 0) < this.waterfallFrame.E;
    if (through && !this.passedWaterfall) this.splash(player);
    if (!this.nearWaterfall(player.s, 12)) this.passedWaterfall = false;
  }

  // Driving through the curtain: spray, water on the lens, a whoosh.
  splash(player) {
    this.passedWaterfall = true;
    const game = this.game;
    const v = Math.max(8, Math.abs(player.v));
    const fwd = V(Math.sin(player.heading), 0, Math.cos(player.heading));
    for (let k = 0; k < 6; k++) {
      game.particles.emit({ pos: player.pos.clone().setY(player.pos.y + 1.2), vel: fwd.clone().multiplyScalar(v * 0.35).setY(2.5), color: ['#ffffff', '#dff1fb', '#cfe8f6'], life: 1.1, size: 0.55, gravity: -6, drag: 1.5, spread: 6, count: 8, jitter: 3 });
    }
    game.audio?.splash?.();
    player.shake = Math.max(player.shake || 0, 0.3);
    game.ui.root.querySelector('.splash-fx')?.remove();
    const fx = document.createElement('div');
    fx.className = 'splash-fx';
    fx.setAttribute('aria-hidden', 'true');
    const r = rng(Math.floor(this.time * 1000));
    for (let k = 0; k < 26; k++) {
      const d = document.createElement('i');
      const size = 18 + r() * 60;
      Object.assign(d.style, { left: `${r() * 100}%`, top: `${r() * 100}%`, width: `${size}px`, height: `${size * (1 + r() * 0.5)}px`, animationDelay: `${r() * 0.4}s` });
      fx.append(d);
    }
    game.ui.root.append(fx);
    setTimeout(() => fx.remove(), 3200);
    if (!this.toldWaterfall) {
      this.toldWaterfall = true;
      game.ui.toast('Through the waterfall! The road stays wet for a few meters.', { icon: '💦', duration: 2200 });
    }
  }
}

// The road width at the start line, for the checkers.
function DAWN_W(c) {
  return c.width(0);
}

// Merge geometries that carry extra float attributes (kept by name).
function mergeWith(list, names) {
  const plain = list.map((g) => {
    const out = g.index ? g.toNonIndexed() : g;
    for (const n of Object.keys(out.attributes)) if (n !== 'position' && n !== 'normal' && !names.includes(n)) out.deleteAttribute(n);
    return out;
  });
  const total = plain.reduce((a, g) => a + g.attributes.position.count, 0);
  const g = new THREE.BufferGeometry();
  for (const n of ['position', 'normal', ...names]) {
    const size = plain[0].attributes[n].itemSize;
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const p of plain) {
      arr.set(p.attributes[n].array, o);
      o += p.attributes[n].array.length;
    }
    g.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  return g;
}
