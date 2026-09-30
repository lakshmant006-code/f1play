// Track 2, Caspian Dawn: its venue (small islands, the road with its heights,
// the bridges over the sky, the old city, the scenic waterfall, the boulevard
// and flame towers, grandstand, watch tower, podium and a dawn sky) and its
// live parts (falling water, mist, the DRS lights). The paddock is shared with
// the Sky Circuit; the game swaps venues.

import * as THREE from 'three';
import { bevelBox, merge, tint, rod } from '../geo.js';
import { buildClouds, asphaltTexture, textTexture, fbm } from '../world/world.js';
import { buildGrandstandHD, buildStartGantry, buildIslandShapes, buildIslands } from '../world/circuit.js';
import { buildRaisedPodium } from '../world/podium.js';
import { buildDawnTower } from '../world/towers.js';
import { buildPitLane, PIT_WIDTH } from '../game/layout.js';
import { buildDawnTrack, dawnFeatures, dawnWidth, dawnIslandArcs, dawnExtras, dawnLedge, DAWN_ISLAND_OPTS, DAWN_LANDMARKS, DAWN_WIDTH } from './dawnLayout.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
const VERGE = 1.5; // paved strip between the road edge and the barrier
const SUN_DIR = V(1, 0.09, 0.12).normalize(); // sunrise in the east, ahead down the pit straight
const LIGHT_DIR = V(0.35, 0.72, -0.6).normalize(); // the shadow light: higher and to the side of the disc, so bodywork does not flare

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

// Dawn light: a low, warm sun, a pink sky fill, rose fog.
export const DAWN_LIGHT = {
  sun: '#FFB98C',
  sunI: 2.2,
  sky: '#FFD9C7',
  ground: '#4B3E5E',
  hemiI: 0.95,
  fog: '#EDB4A3',
  near: 280,
  far: 1050,
  env: 0.42,
  envRot: Math.PI / 2,
  sat: 1.08,
  shadow: { center: [40, 0, 160], offset: LIGHT_DIR.clone().multiplyScalar(560).toArray(), r: 250, far: 1200 },
};

// ---- The circuit ----------------------------------------------------------------------------

export class DawnCircuit {
  constructor() {
    this.id = 'dawn';
    this.name = 'Caspian Dawn';
    this.bestKey = 'skycircuit.bestLap.dawn2';
    this.pitWall = true;
    this.bumps = true;
    this.track = buildDawnTrack();
    this.pit = buildPitLane(this.track);
    this.features = dawnFeatures(this.track);
    this.width = dawnWidth(this.features);
    this.drsZones = this.features.drs;
    this.landmarks = DAWN_LANDMARKS;
    this.light = DAWN_LIGHT;
    this.home = { target: V(45, 0, 150), distance: 560, azimuth: THREE.MathUtils.degToRad(200), elevation: THREE.MathUtils.degToRad(38) };
    this.maxDistance = 720;
    this.time = 0;

    // Islands: small ones hugging the road, plus ground for the paddock,
    // grandstand, tower, flame towers, old city, waterfall ledge and podium.
    const islands = dawnIslandArcs(this.track);
    const { ledge, out } = dawnLedge(this.track);
    this.ledge = ledge;
    this.ledgeOut = out;
    const extras = dawnExtras(this.track, this.pit, islands);
    const { outlines, onIsland } = buildIslandShapes(this.track, this.pit, extras, { islands, ...DAWN_ISLAND_OPTS });
    this.onIsland = onIsland;
    this.outlines = outlines;
    this.frames = buildFrames(this.track, this.width, onIsland);

    this.venue = new THREE.Group();
    this.venue.name = 'venue-dawn';
    this.water = waterMaterial();
    this.led = ledMaterial();
    this.islands = buildIslands(outlines, islands, 40);
    this.venue.add(this.islands);
    this.build();
  }

  // Near the pit lane (its entry, the pit straight and its exit) the pit side
  // is open: the paddock's pit wall does the job there.
  nearPit(x, z, r = 8) {
    const p = this.pit;
    for (let i = 0; i < p.n; i += 2) if (Math.hypot(p.pos[i].x - x, p.pos[i].z - z) < r) return true;
    return false;
  }

  // How far the car's centre can go from the centreline before it meets a barrier.
  limit(s, x, z) {
    const hw = this.width(s) / 2;
    return this.nearPit(x, z, 7) ? hw + 4.8 : hw + 0.05;
  }

  grip() {
    return 1;
  }

  inDrs(s) {
    return this.drsZones.some(([a, b]) => (a <= b ? s >= a && s <= b : s >= a || s <= b));
  }

  build() {
    const g = this.venue;
    const sky = dawnSky();
    sky.userData.shadow = false;
    sky.frustumCulled = false;
    this.sky = sky; // kept centred on the camera, so zoomed out it never clips
    g.add(sky);
    this.clouds = buildClouds(rng(33));
    this.clouds.scale.set(1.5, 1, 1.5);
    this.clouds.position.set(40, 0, 150);
    this.clouds.traverse((o) => {
      o.userData.shadow = false;
      if (o.material) {
        o.material = o.material.clone();
        o.material.emissive.set('#F7B7A3');
        o.material.emissiveIntensity = 0.45;
      }
    });
    g.add(this.clouds);
    // Barriers stand everywhere except on the pit side along the pit lane.
    this.barrier = { 1: this.frames.map((f) => !this.nearPit(f.p.x + f.n.x * f.E, f.p.z + f.n.z * f.E, 6.5)), '-1': this.frames.map((f) => !this.nearPit(f.p.x - f.n.x * f.E, f.p.z - f.n.z * f.E, 6.5)) };
    this.buildRoad();
    this.buildStructures();
    this.buildBridges();
    this.buildTrackside();
    this.buildLandmarks();
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

  // Road surface, painted lines, kerbs, the pit lane, start and DRS markings.
  buildRoad() {
    const g = this.venue;
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

    // Pit lane: surface and edge lines, level with the paddock.
    const P = this.pit;
    const pf = [];
    for (let s = 6; s <= P.length - 6; s += 1) {
      const a = P.at(s);
      const l = Math.hypot(a.tan.x, a.tan.z) || 1;
      pf.push({ s, p: a.pos.clone().setY(0), n: V(a.tan.z / l, 0, -a.tan.x / l) });
    }
    const pitRoad = new THREE.Mesh(faceUp(strip(pf, (f) => [[PIT_WIDTH / 2, 0.025], [-PIT_WIDTH / 2, 0.025]], { uv: (f, j) => [j, f.s / 4] })), asphalt);
    pitRoad.userData.shadow = false;
    g.add(pitRoad);
    const inner = pf.slice(8, -8);
    for (const side of [1, -1]) lines.push(faceUp(strip(inner, (f) => [[side * (PIT_WIDTH / 2 - 0.1), 0.04], [side * (PIT_WIDTH / 2 - 0.3), 0.04]])));
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

    // Start / finish checkers (with the Sky Circuit's, at x = -10) and grid slots.
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
    this.startS = this.track.nearest(V(-10, 0, -35));
    g.add(this.decal(this.startS, DAWN_WIDTH - 0.6, 1.2, new THREE.MeshStandardMaterial({ map: ct, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })));
    const slots = [];
    for (let i = 1; i <= 8; i++) {
      const f = this.frameAt(this.startS - i * 7);
      const lat = (i % 2 ? 1 : -1) * 2.6;
      // A bracket: a bar across the slot and two arms trailing back.
      slots.push(this.decalGeo(f, lat, 2.2, 0.15, 0.05), this.decalGeo(f, lat - 1.05, 0.15, 1.2, 0.05, -0.6), this.decalGeo(f, lat + 1.05, 0.15, 1.2, 0.05, -0.6));
    }
    const [zoneA] = this.drsZones[0];
    slots.push(this.decalGeo(this.frameAt(this.features.drsDetect), 0, DAWN_WIDTH, 0.35, 0.05), this.decalGeo(this.frameAt(zoneA), 0, DAWN_WIDTH, 0.5, 0.05));
    g.add(new THREE.Mesh(merge(slots), white));
    const drsTex = textTexture(['DRS'], { w: 512, h: 256, bg: 'rgba(0,0,0,0)', fg: '#F2F2EE' });
    const drsMat = new THREE.MeshStandardMaterial({ map: drsTex, transparent: true, roughness: 0.6, depthWrite: false });
    const letters = this.decal(zoneA + 10, 7, 4.4, drsMat);
    letters.renderOrder = 1;
    g.add(letters);
  }

  // The road's body: raised on stone where it climbs, on columns where it is
  // high, a deck over the sky; jersey barriers along both sides.
  buildStructures() {
    const g = this.venue;
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
        cols.push(rod(b.clone().setY(-0.8), b.clone().setY(f.p.y - 1.3), 0.75, 12));
      }
      cols.push(bevelBox(2 * f.hw, 0.9, 1.6, 0.08).applyMatrix4(new THREE.Matrix4().makeBasis(f.n, V(0, 1, 0), V(-f.n.z, 0, f.n.x).negate())).translate(f.p.x, f.p.y - 1.6, f.p.z));
    }
    if (cols.length) g.add(new THREE.Mesh(merge(cols), mat('#D9CDBB', { roughness: 0.8 })));
    // Barriers: white concrete with a cap band, red on the islands and teal on
    // the bridges; open on the pit side along the pit lane.
    const jersey = [[0, 0], [0.55, 0], [0.45, 0.25], [0.18, 0.4], [0.15, 0.95], [0, 0.95]];
    const walls = [];
    const leds = [];
    const wallCol = new THREE.Color('#EFEBE4');
    for (const side of [1, -1]) {
      const has = this.barrier[side];
      for (const r of runs(F, (_, i) => has[i])) {
        if (r.list.length < 2) continue;
        walls.push(strip(r.list, (f) => jersey.map(([x, y]) => [side * (f.E - x), f.p.y + y]), { closed: r.closed, color: () => wallCol }));
        walls.push(strip(r.list, (f) => [[side * (f.E - 0.15), f.p.y + 0.8], [side * (f.E - 0.15), f.p.y + 0.97], [side * (f.E + 0.01), f.p.y + 0.97]], { closed: r.closed, color: (f) => new THREE.Color(f.island ? '#C8372D' : '#1FB5B0') }));
        // DRS LED strip on the barrier tops through the zone.
        for (const [a, b] of this.drsZones) {
          const inZone = r.list.filter((f) => (a <= b ? f.s >= a && f.s <= b : f.s >= a || f.s <= b));
          if (inZone.length < 2) continue;
          const geo = strip(inZone, (f) => [[side * (f.E - 0.16), f.p.y + 0.98], [side * (f.E - 0.16), f.p.y + 1.1]]);
          const along = [];
          inZone.forEach((f) => along.push(f.s, f.s));
          geo.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
          leds.push(geo);
        }
      }
    }
    g.add(new THREE.Mesh(merge(walls, { color: true }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide })));
    if (leds.length) {
      const m = new THREE.Mesh(mergeWith(leds, ['along']), this.led);
      m.userData.shadow = false;
      g.add(m);
    }
  }

  // Bridges over the sky between the islands: the high viaduct is
  // cable-stayed (pylons at both rims and along the span), the low ones hang
  // steel arches below, all with catch fencing.
  buildBridges() {
    const g = this.venue;
    const F = this.frames;
    const steel = mat('#E4E7EA', { roughness: 0.35, metalness: 0.55 });
    const parts = [];
    const fences = [];
    for (const r of runs(F, (f) => !f.island)) {
      const L = r.list;
      if (L.length < 6) continue;
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
        // Pylons at both rims and every ~70 m between (not over the crossing).
        const n = Math.max(1, Math.round(L.length / 70));
        const at = [];
        for (let k = 0; k <= n; k++) at.push(Math.round((k / n) * (L.length - 1)));
        for (const i of at) {
          const f = L[i];
          if (Math.hypot(f.p.x - this.features.crossing.x, f.p.z - this.features.crossing.z) < 18) continue;
          const topY = f.p.y + 21;
          const tops = [];
          const end = i === 0 || i === L.length - 1;
          for (const side of [1, -1]) {
            const base = f.p.clone().addScaledVector(f.n, side * (f.E + 1.1)).setY(end ? -1 : f.p.y - 1.6);
            const top = f.p.clone().addScaledVector(f.n, side * (f.E - 1.2)).setY(topY);
            parts.push(rod(base, top, 0.7, 12));
            tops.push(top);
            // Cables fanned both ways along the deck.
            for (const dir of [1, -1]) {
              for (let c = 1; c <= 5; c++) {
                const j = i + dir * c * 6;
                if (j < 0 || j >= L.length) continue;
                const ff = L[j];
                const anchor = ff.p.clone().addScaledVector(ff.n, side * (ff.E - 0.4)).setY(ff.p.y + 0.9);
                parts.push(rod(top.clone().setY(topY - c * 0.8), anchor, 0.06, 4));
              }
            }
          }
          parts.push(rod(tops[0], tops[1], 0.5, 8));
          parts.push(rod(tops[0].clone().setY(f.p.y + 11), tops[1].clone().setY(f.p.y + 11), 0.4, 8));
        }
      } else {
        // A run of steel arches hanging below the deck, each up to ~60 m.
        const n = Math.max(1, Math.round(L.length / 60));
        for (let a = 0; a < n; a++) {
          const i0 = Math.floor((a / n) * (L.length - 1));
          const i1 = Math.floor(((a + 1) / n) * (L.length - 1));
          const seg = L.slice(i0, i1 + 1);
          const sag = Math.min(12, 3 + seg.length * 0.16);
          for (const side of [1, -1]) {
            const arch = seg.map((f, k) => f.p.clone().addScaledVector(f.n, side * (f.hw - 0.8)).setY(f.p.y - 1.8 - sag * Math.sin((Math.PI * k) / (seg.length - 1))));
            for (let k = 0; k < arch.length - 1; k++) parts.push(rod(arch[k], arch[k + 1], 0.36, 8));
            for (let k = 3; k < arch.length - 3; k += 4) parts.push(rod(arch[k], arch[k].clone().setY(seg[k].p.y - 1.75), 0.08, 5));
            if (side > 0) for (let k = 4; k < arch.length - 4; k += 8) parts.push(rod(arch[k], arch[k].clone().addScaledVector(seg[k].n, -2 * (seg[k].hw - 0.8)), 0.08, 5));
          }
        }
      }
    }
    g.add(new THREE.Mesh(merge(parts), steel));
    g.add(new THREE.Mesh(merge(fences), new THREE.MeshStandardMaterial({ color: '#3a3f47', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })));
  }

  // Street lamps, the start gantry and the DRS gantries.
  buildTrackside() {
    const g = this.venue;
    const F = this.frames;
    const post = merge([rod(V(0, 0, 0), V(0, 7.2, 0), 0.1, 8), rod(V(0, 7.2, 0), V(-2.2, 7.6, 0), 0.07, 6)]);
    const head = bevelBox(0.9, 0.18, 0.4, 0.05).translate(-2.3, 7.5, 0);
    const spots = [];
    for (let k = 0, i = 0; k < F.length; k += 34, i++) {
      const f = F[k];
      const side = i % 2 ? 1 : -1;
      if (!this.barrier[side][k]) continue;
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

    // Start lights over the line, like the Sky Circuit's.
    g.add(buildStartGantry(-10, -35, 'CASPIAN DAWN'));

    // DRS gantries: detection at the last corner, and the zone start whose panel turns green.
    this.panels = [];
    const gantry = (s, label) => {
      const f = this.frameAt(s);
      const parts = [];
      for (const side of [1, -1]) {
        const b = f.p.clone().addScaledVector(f.n, side * (f.E + 0.4));
        parts.push(rod(b.clone().setY(f.p.y - 0.5), b.clone().setY(f.p.y + 7.4), 0.22, 10));
      }
      const a = f.p.clone().addScaledVector(f.n, f.E + 0.4).setY(f.p.y + 7);
      const b = f.p.clone().addScaledVector(f.n, -(f.E + 0.4)).setY(f.p.y + 7);
      parts.push(rod(a, b, 0.3, 10), rod(a.clone().setY(f.p.y + 7.6), b.clone().setY(f.p.y + 7.6), 0.14, 8));
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
  }

  // Grandstand, watch tower and podium, each on its island.
  buildLandmarks() {
    const g = this.venue;
    const L = DAWN_LANDMARKS;
    this.grandstand = buildGrandstandHD({ len: L.grandstand.len, name: 'CASPIAN DAWN' });
    this.grandstand.position.set(L.grandstand.x, 0, L.grandstand.z);
    this.grandstand.rotation.y = L.grandstand.rot;
    this.tower = buildDawnTower();
    this.tower.position.set(L.tower.x, 0, L.tower.z);
    this.tower.rotation.y = Math.atan2(0 - L.tower.x, -35 - L.tower.z); // board faces the pit straight
    this.podium = buildRaisedPodium({ brand: 'CASPIAN DAWN', palette: 'dawn' });
    this.podium.position.set(L.podium.x, 0, L.podium.z);
    this.podium.rotation.y = L.podium.rot;
    g.add(this.grandstand, this.tower, this.podium);
  }

  // Old city: crenellated walls along the climb and the horseshoe, a stone
  // keep, a minaret and flat-roofed sandstone houses on the old-city island.
  buildOldCity() {
    const g = this.venue;
    const F = this.frames;
    const [a] = this.features.castle;
    const [, b] = this.features.horseshoe;
    const stone = [];
    const slits = [];
    const r = rng(12);
    const wallF = F.filter((f) => f.s >= a - 20 && f.s <= b + 10);
    let bast = -99;
    // The walls follow the outside of the climb (the side away from the old city).
    const outside = -1;
    for (let k = 0; k < wallF.length; k += 3) {
      const f = wallF[k];
      const lat = outside * (f.E + 2.6);
      const c = f.p.clone().addScaledVector(f.n, lat);
      if (!this.onIsland(c.x, c.z)) continue;
      const top = Math.max(0, f.p.y) + 4.6;
      const yaw = Math.atan2(-f.n.x, -f.n.z); // box length along the road
      stone.push(tint(bevelBox(3.3, top + 1, 1.5, 0.08).rotateY(yaw).translate(c.x, top / 2 - 0.5, c.z), '#D2B488'));
      for (const d of [-0.8, 0.8]) {
        const along = V(-f.n.z, 0, f.n.x).multiplyScalar(d);
        stone.push(tint(bevelBox(0.9, 1.1, 1.5, 0.05).rotateY(yaw).translate(c.x + along.x, top + 0.55, c.z + along.z), '#C9A97B'));
      }
      if (f.s - bast > 46) {
        bast = f.s;
        const t = f.p.clone().addScaledVector(f.n, lat + outside * 0.6);
        stone.push(tint(new THREE.CylinderGeometry(2.6, 3, top + 3, 20).translate(t.x, (top + 3) / 2 - 0.5, t.z), '#CCAE82'));
        for (let m = 0; m < 10; m++) {
          const ang = (m / 10) * Math.PI * 2;
          stone.push(tint(bevelBox(0.8, 1, 0.8, 0.05).translate(t.x + Math.cos(ang) * 2.4, top + 3, t.z + Math.sin(ang) * 2.4), '#C9A97B'));
        }
      }
    }
    // The keep: a round stone tower with a buttress and a crenellated crown.
    const L = DAWN_LANDMARKS;
    const tp = V(L.keep.x, 0, L.keep.z);
    stone.push(tint(new THREE.CylinderGeometry(6.5, 7.2, 27, 32).translate(tp.x, 13, tp.z), '#CFB083'));
    stone.push(tint(bevelBox(5, 23, 6, 0.2).translate(tp.x + 7.4, 11, tp.z), '#C8A87A'));
    stone.push(tint(new THREE.CylinderGeometry(7, 6.6, 1.2, 32).translate(tp.x, 27, tp.z), '#C4A375'));
    for (let m = 0; m < 16; m++) {
      const ang = (m / 16) * Math.PI * 2;
      stone.push(tint(bevelBox(1, 1.1, 1, 0.05).translate(tp.x + Math.cos(ang) * 6.5, 28.1, tp.z + Math.sin(ang) * 6.5), '#C9A97B'));
    }
    for (let m = 0; m < 14; m++) {
      const ang = r() * Math.PI * 2;
      slits.push(new THREE.BoxGeometry(0.45, 1.5, 0.45).translate(tp.x + Math.cos(ang) * 6.9, 4 + r() * 20, tp.z + Math.sin(ang) * 6.9));
    }
    // A minaret beside it.
    const mp = V(tp.x - 16, 0, tp.z + 12);
    stone.push(tint(new THREE.CylinderGeometry(1.6, 2.1, 23, 16).translate(mp.x, 11, mp.z), '#DCC49C'));
    stone.push(tint(new THREE.CylinderGeometry(2.7, 2, 1.1, 16).translate(mp.x, 17.5, mp.z), '#CDB088'));
    stone.push(tint(new THREE.ConeGeometry(1.7, 3.8, 16).translate(mp.x, 24.4, mp.z), '#5C8E86'));
    // Houses on the old-city ground, clear of the road and the landmarks.
    const oc = L.oldCity;
    const spots = [];
    for (let tries = 0; tries < 500 && spots.length < 34; tries++) {
      const p = V(oc.x0 + r() * (oc.x1 - oc.x0), 0, oc.z0 + r() * (oc.z1 - oc.z0));
      const w = 4.5 + r() * 4.5;
      const d = 4.5 + r() * 4.5;
      if (!this.onIsland(p.x, p.z) || !this.clearOf(p, Math.max(w, d) * 0.75 + 3)) continue;
      if (p.distanceTo(tp) < 13 || p.distanceTo(mp) < 6 || spots.some((q) => q.distanceTo(p) < 8)) continue;
      spots.push(p);
      const h = 3.5 + r() * 5;
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

  // The waterfall, as scenery: a spring in a rocky outcrop on a ledge beside
  // the descent pours into a pool, runs to the island's edge and falls off
  // into the clouds far below. It never touches the road.
  buildWaterfall() {
    const g = this.venue;
    const R = rng(5);
    const out = this.ledgeOut;
    const along = V(out.z, 0, -out.x);
    // The lip: the island's rim straight out from the ledge.
    const lip = this.ledge.clone();
    while (this.onIsland(lip.x + out.x, lip.z + out.z)) lip.add(out);
    lip.addScaledVector(out, -0.8);
    const rocks = [];
    // Rocky outcrop the spring comes from, on the road side of the ledge.
    const hill = this.ledge.clone().addScaledVector(out, -4);
    for (let k = 0; k < 12; k++) {
      const a = R() * Math.PI * 2;
      const d = R() * 5;
      const r = 2.4 + R() * 2.6;
      rocks.push(boulder(r, 60 + k, 0.85).translate(hill.x + Math.cos(a) * d, r * 0.45 + (5 - d) * 0.8, hill.z + Math.sin(a) * d));
    }
    // Rocks framing the lip.
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) rocks.push(boulder(1.6 + R(), 80 + k * 3 + s, 0.8).translate(lip.x + along.x * s * (3.4 + k * 0.9) - out.x * k, 0.8, lip.z + along.z * s * (3.4 + k * 0.9) - out.z * k));
    g.add(new THREE.Mesh(merge(rocks), new THREE.MeshStandardMaterial({ color: '#9C7C60', roughness: 0.95, flatShading: true })));
    const moss = [];
    for (let k = 0; k < 14; k++) {
      const a = R() * Math.PI * 2;
      const d = 2 + R() * 6;
      moss.push(new THREE.IcosahedronGeometry(0.8 + R() * 1, 1).translate(hill.x + Math.cos(a) * d, 4 + R() * 4 - d * 0.4, hill.z + Math.sin(a) * d));
    }
    g.add(new THREE.Mesh(merge(moss), mat('#5E8A45', { flatShading: true })));
    // Spring cascade down the outcrop, pool, and the stream to the lip.
    const spring = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 6.5), this.water);
    spring.position.copy(hill).addScaledVector(out, 3.2).setY(3.4);
    spring.lookAt(spring.position.clone().add(out));
    spring.rotateX(-0.2);
    const poolAt = hill.clone().addScaledVector(out, 4.6);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.2, 28).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#4f86a6', roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.85 }));
    pool.position.copy(poolAt).setY(0.06);
    const runLen = poolAt.distanceTo(lip);
    const stream = new THREE.Mesh(new THREE.PlaneGeometry(2.4, runLen).rotateX(-Math.PI / 2), this.water);
    stream.position.copy(poolAt).lerp(lip, 0.5).setY(0.08);
    stream.rotation.y = Math.atan2(out.x, out.z);
    // The fall: a long curtain off the lip, widening as it drops, into mist.
    const H = 95;
    const fall = new THREE.PlaneGeometry(1, 1, 1, 12);
    const fp = fall.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const t = 0.5 - fp.getY(i); // 0 at the lip, 1 at the bottom
      fp.setXYZ(i, fp.getX(i) * (3 + t * 9), -t * H, t * t * 7);
    }
    fall.computeVertexNormals();
    const fallMesh = new THREE.Mesh(fall, this.water);
    fallMesh.position.copy(lip).setY(0.1);
    fallMesh.rotation.y = Math.atan2(out.x, out.z);
    for (const m of [spring, pool, stream, fallMesh]) {
      m.renderOrder = 2;
      m.userData.shadow = false;
    }
    g.add(spring, pool, stream, fallMesh);
    this.mistAt = [lip.clone().addScaledVector(out, 6).setY(-H + 4), lip.clone().addScaledVector(out, 1).setY(-1), poolAt.clone().setY(0.6)];
  }

  // Palms along the boulevard (north of the pit straight and up the east
  // side), and three flame towers on their island.
  buildBoulevard() {
    const g = this.venue;
    const F = this.frames;
    const R = rng(8);
    const trunk = new THREE.CylinderGeometry(0.22, 0.38, 8, 8, 6);
    const tp = trunk.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const y = tp.getY(i) + 4;
      tp.setX(i, tp.getX(i) + (y / 8) ** 2 * 0.9);
      tp.setY(i, y);
    }
    trunk.computeVertexNormals();
    const leaves = [];
    for (let k = 0; k < 9; k++) {
      const leaf = new THREE.PlaneGeometry(1.1, 5, 2, 6).translate(0, 2.5, 0);
      const lp = leaf.attributes.position;
      for (let i = 0; i < lp.count; i++) {
        const t = lp.getY(i) / 5;
        lp.setZ(i, -t * t * 2.2 - Math.abs(lp.getX(i)) * 0.3);
        lp.setX(i, lp.getX(i) * (1 - t * 0.7));
      }
      leaf.rotateX(-Math.PI / 2 + 0.5).rotateY((k / 9) * Math.PI * 2).translate(0.9, 8, 0);
      leaves.push(leaf);
    }
    const crown = merge(leaves);
    crown.computeVertexNormals();
    const spots = [];
    const stand = this.grandstand.position;
    for (let k = 0; k < F.length; k += 12) {
      const f = F[k];
      const onBoulevard = (f.p.z < -30 && f.p.x > -40 && f.p.x < 150) || (f.p.x > 168 && f.p.z < 50);
      if (!onBoulevard) continue;
      for (const side of [1, -1]) {
        if (!this.barrier[side][k]) continue;
        const p = f.p.clone().addScaledVector(f.n, side * (f.E + 2.8 + R() * 1.2)).setY(0);
        if (!this.onIsland(p.x, p.z) || this.nearPit(p.x, p.z, 10) || Math.abs(p.x - stand.x) < DAWN_LANDMARKS.grandstand.len / 2 + 3) continue;
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
    g.add(buildFlameTowers(DAWN_LANDMARKS.flames));
  }

  // ---- Driving and the frame -----------------------------------------------------------------

  enter() {
    this.following = true;
  }

  exit() {
    this.following = false;
    document.body.classList.remove('drs-open');
  }

  update(dt, game, player = null) {
    this.time += dt;
    this.water.uniforms.time.value = this.time;
    this.led.uniforms.time.value = this.time;
    this.sky.position.copy(game.camera.position);
    const cam = game.camera.position;
    if (cam.distanceTo(this.mistAt[1]) < 260 && Math.random() < dt * 24) {
      game.particles.emit({ pos: this.mistAt[0], vel: V(0, 2, 0), color: ['#ffffff', '#f7e6df', '#e9f4fb'], life: 3, size: 6, gravity: 0.3, drag: 0.6, spread: 4, count: 3, jitter: 10 });
      game.particles.emit({ pos: this.mistAt[1], vel: V(0, -3, 0), color: ['#ffffff', '#e9f4fb'], life: 1.2, size: 1, gravity: -4, drag: 1, spread: 2, count: 2, jitter: 3 });
      game.particles.emit({ pos: this.mistAt[2], vel: V(0, 0.6, 0), color: ['#ffffff', '#e9f4fb'], life: 1.2, size: 0.8, gravity: 0.2, drag: 1.2, spread: 1.5, count: 1, jitter: 2 });
    }
    if (!player) {
      this.led.uniforms.state.value = 0;
      return;
    }
    if (this.following) {
      // Shadows follow the car.
      const sun = game.sun;
      sun.target.position.copy(player.pos);
      sun.position.copy(player.pos).addScaledVector(LIGHT_DIR, 320);
    }
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
  }
}

// Three flame towers: curved glass blades catching the sunrise, on a plaza.
function buildFlameTowers(at) {
  const g = new THREE.Group();
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
    for (let i = 0; i <= 32; i++) {
      const t = i / 32;
      const r = R0 * (0.82 + 0.3 * Math.sin(Math.PI * Math.min(1, t * 1.25))) * (1 - Math.pow(t, 2.4)) + 0.2;
      pts.push(new THREE.Vector2(r, t * H));
    }
    const geo = new THREE.LatheGeometry(pts, 40);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / H;
      p.setZ(i, p.getZ(i) * 0.62);
      p.setX(i, p.getX(i) + t * t * lean);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const towers = [
    [0, 0, 58, 10, 7, 0.2],
    [-17, 13, 48, 9, -6, 2.4],
    [15, 16, 52, 9.5, 6, 4.3],
  ];
  const plinth = [];
  for (const [dx, dz, H, R0, lean, yaw] of towers) {
    const m = new THREE.Mesh(flame(H, R0, lean), glass);
    m.position.set(at.x + dx, 0, at.z + dz);
    m.rotation.y = yaw;
    g.add(m);
    plinth.push(new THREE.CylinderGeometry(R0 + 3, R0 + 3.6, 1.2, 32).translate(at.x + dx, 0.2, at.z + dz));
  }
  g.add(new THREE.Mesh(merge(plinth), mat('#D7CCBC')));
  return g;
}
