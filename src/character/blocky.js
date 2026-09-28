// Blocky driver from the character references: smooth rounded boxes, a big
// head with a 3D face, a full-face helmet with a wrap-round visor, a suit painted per body part (4 designs), belt, knee pads, gloves
// (2 designs or bare hands) and trainers. Parts hang off pivots so the model
// can pose (hands on hips, wave, thumbs up, jump). Height is about 1.7 m.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export * from './recipe.js';
import { DEFAULT_RECIPE } from './recipe.js';

const DARK = '#1c1d20';
const YELLOW = '#F5C518';

// ---- Painter: one small canvas per (part, face, recipe) --------------------------------

const texCache = new Map();

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return `#${c.getHexString()}`;
}

function star(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.42 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

// Paint one face of one suit part. Coordinates are 0..S with y down.
// face: 'front' | 'back' | 'side' | 'top' | 'bottom'; side: 1 = left of body, -1 = right.
function paintSuit(ctx, S, r, part, face, side) {
  const P = r.primary;
  const W = r.secondary;
  const A = r.accent;
  const fill = (c) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, S, S);
  };
  const poly = (c, pts) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x * S, y * S) : ctx.moveTo(x * S, y * S)));
    ctx.closePath();
    ctx.fill();
  };
  const band = (c, y0, y1) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, y0 * S, S, (y1 - y0) * S);
  };
  const stripe = (c, x0, x1) => {
    ctx.fillStyle = c;
    ctx.fillRect(x0 * S, 0, (x1 - x0) * S, S);
  };
  const cuff = part === 'forearm' || part === 'shin';

  if (r.suit === 'classic') {
    fill(P);
    if (part === 'torso' && face === 'front') {
      poly(W, [[0.18, 0.08], [0.82, 0.08], [0.92, 0.3], [0.92, 0.95], [0.08, 0.95], [0.08, 0.3]]);
      ctx.fillStyle = shade(W, 0.9);
      ctx.fillRect(S * 0.495, S * 0.08, S * 0.012, S * 0.87);
      poly(A, [[0.3, 0.72], [0.44, 0.44], [0.58, 0.72]]);
      ctx.fillStyle = YELLOW;
      ctx.beginPath();
      ctx.arc(S * 0.72, S * 0.5, S * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    if (part === 'torso' && face === 'top') poly(W, [[0, 0], [0.3, 0], [0.3, 1], [0, 1]]);
    if ((part === 'upperArm' || part === 'forearm') && face !== 'top' && face !== 'bottom') band(W, 0.35, 0.52);
    if ((part === 'thigh' || part === 'shin') && face === 'side' && side === 1) stripe(W, 0.62, 0.8);
  } else if (r.suit === 'star') {
    fill(P);
    if (part === 'torso' && face === 'front') {
      stripe(W, 0.2, 0.8);
      poly(P, [[0.24, 0.35], [0.46, 0.14], [0.55, 0.14], [0.33, 0.35]]);
      ctx.fillStyle = P;
      star(ctx, S * 0.66, S * 0.25, S * 0.1);
      ctx.fillStyle = shade(W, 0.9);
      ctx.fillRect(S * 0.495, S * 0.05, S * 0.012, S * 0.95);
    }
    if (part === 'torso' && face === 'back') stripe(W, 0.25, 0.75);
    if (part === 'pelvis' && face === 'front') poly(W, [[0.2, 0], [0.8, 0], [0.62, 1], [0.38, 1]]);
    if ((part === 'upperArm' || part === 'forearm') && (face === 'front' || face === 'side')) poly(W, [[0.5, 0.1], [0.85, 0.5], [0.5, 0.9], [0.15, 0.5]]);
    if (part === 'thigh' && face === 'front') poly(W, [[0.2, 0], [0.8, 0], [0.5, 1]]);
    if (part === 'shin' && face === 'front') poly(W, [[0.5, 0.3], [0.8, 0.7], [0.5, 1], [0.2, 0.7]]);
  } else if (r.suit === 'diamond') {
    fill(P);
    if (part === 'torso' && (face === 'front' || face === 'back')) {
      poly(W, [[0, 0.1], [0.14, 0.55], [0, 1]]);
      poly(W, [[1, 0.1], [0.86, 0.55], [1, 1]]);
      ctx.fillStyle = shade(P, 0.88);
      ctx.fillRect(S * 0.495, 0, S * 0.012, S);
    }
    if (part === 'torso' && face === 'top') poly(W, [[0, 0], [0.28, 0], [0.28, 1], [0, 1]]);
    if (part === 'torso' && face === 'side') poly(W, [[0, 0.2], [0.5, 0.6], [1, 0.2], [1, 1], [0, 1]]);
    if (part === 'pelvis' && face === 'front') poly(W, [[0.5, 0], [0.8, 0.5], [0.5, 1], [0.2, 0.5]]);
    if (part === 'upperArm' && face !== 'top') poly(W, [[0, 0.3], [0.35, 0.65], [0, 1]]);
    if (part === 'thigh' && (face === 'front' || face === 'back')) poly(W, [[side > 0 ? 0 : 1, 0], [side > 0 ? 0.55 : 0.45, 0.5], [side > 0 ? 0 : 1, 1]]);
    if (part === 'shin' && face === 'front') poly(W, [[0.5, 0], [0.9, 0.45], [0.5, 0.9], [0.1, 0.45]]);
  } else if (r.suit === 'stripes') {
    // White suit with a team centre stripe, edge piping, shoulder caps,
    // arm bands and an outer leg stripe (the character sheet look).
    fill(W);
    if (part === 'torso' && face === 'front') {
      stripe(P, 0.45, 0.55);
      stripe(P, 0, 0.07);
      stripe(P, 0.93, 1);
      // Sky Circuit stripe mark on the chest.
      for (let k = 0; k < 3; k++) poly(P, [[0.66 + k * 0.02, 0.2 + k * 0.07], [0.86 + k * 0.02, 0.2 + k * 0.07], [0.83 + k * 0.02, 0.25 + k * 0.07], [0.63 + k * 0.02, 0.25 + k * 0.07]]);
    }
    if (part === 'torso' && face === 'back') stripe(P, 0.45, 0.55);
    if (part === 'torso' && face === 'top') {
      stripe(P, 0, 0.3);
      stripe(P, 0.7, 1);
    }
    if (part === 'torso' && face === 'side') band(P, 0, 0.18);
    if (part === 'upperArm' && face !== 'bottom') band(P, 0, 0.22);
    if (part === 'upperArm' && face !== 'top' && face !== 'bottom') band(P, 0.62, 0.74);
    if ((part === 'thigh' || part === 'shin') && face === 'side' && side === 1) stripe(P, 0.55, 0.72);
    if ((part === 'thigh' || part === 'shin') && face === 'front' && side === 1) stripe(P, 0.8, 0.92);
    if (part === 'shin' && face !== 'top' && face !== 'bottom') band(P, 0.12, 0.22);
    if (part === 'pelvis' && face === 'front') stripe(P, 0.45, 0.55);
  }
  // Cuffs at wrists and ankles in the design's trim colour.
  if (cuff && face !== 'top' && face !== 'bottom') {
    const trim = r.suit === 'stripes' ? P : r.suit === 'diamond' ? W : P;
    band(trim, 0.86, 1);
  }
}

function paintGlove(ctx, S, r, face) {
  if (r.gloves === 'dark') {
    ctx.fillStyle = DARK;
    ctx.fillRect(0, 0, S, S);
    return;
  }
  const base = r.gloves === 'star' ? DARK : r.primary;
  const mark = r.gloves === 'star' ? r.primary : DARK;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  if (face === 'front' || face === 'back') {
    ctx.fillStyle = mark;
    star(ctx, S * 0.5, S * 0.42, S * 0.24);
  }
  ctx.fillStyle = mark;
  ctx.fillRect(0, S * 0.82, S, S * 0.18);
}

function paintNumber(ctx, S, r) {
  ctx.fillStyle = r.secondary === r.primary ? '#ffffff' : r.secondary;
  ctx.font = `900 ${S * 0.46}px Nunito, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(r.number), S / 2, S * 0.52);
}

function texture(key, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  draw(ctx, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

// Box face order in three.js: +x, -x, +y, -y, +z, -z.
function faceNames(side) {
  // +x is the model's left. For a left-side part (side = 1) +x is the outer side.
  return ['side', 'side', 'top', 'bottom', 'front', 'back'].map((f, i) => ({ f, outer: i === 0 ? side >= 0 : side <= 0 }));
}

function suitMaterials(r, part, side = 0) {
  return faceNames(side).map(({ f, outer }, i) => {
    const key = `suit|${r.suit}|${r.primary}|${r.secondary}|${r.accent}|${part}|${f}|${outer ? 1 : -1}|${i}`;
    const map = texture(key, (ctx, S) => {
      paintSuit(ctx, S, r, part, f, outer ? 1 : -1);
      if (part === 'torso' && f === 'back') paintNumber(ctx, S, r);
    });
    return new THREE.MeshStandardMaterial({ map, roughness: 0.62 });
  });
}

// ---- Model -----------------------------------------------------------------------------

// Smooth rounded boxes: 4 bevel segments and a softer default radius.
const box = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
const solid = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });

function mesh(geo, mat, y = 0, x = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function pivot(parent, x, y, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// ---- Face parts (3D pieces, after the eyebrow and mouth sheets) ------------------------

const BROW = '#3a2a22';

function eyes(head, r, y, z) {
  const g = new THREE.Group();
  for (const s of [1, -1]) {
    const e = mesh(box(0.035, 0.05, 0.02, 0.008), solid('#141416', { roughness: 0.3 }), y, s * 0.055, z);
    const glint = mesh(new THREE.BoxGeometry(0.012, 0.012, 0.005), solid('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.4 }), y + 0.012, s * 0.055 + 0.008, z + 0.012);
    g.add(e, glint);
  }
  head.add(g);
}

function brows(head, r, y, z) {
  if (r.brows === 'none') return;
  const mat = solid(BROW);
  for (const s of [1, -1]) {
    if (r.brows === 'arched') {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(s * 0.025, y - 0.005, z), new THREE.Vector3(s * 0.055, y + 0.02, z + 0.004), new THREE.Vector3(s * 0.085, y - 0.005, z));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 5, 0.009, 4), mat);
      head.add(tube);
    } else {
      const b = mesh(box(0.06, 0.018, 0.018, 0.005), mat, y, s * 0.055, z);
      if (r.brows === 'angled') b.rotation.z = s * -0.38; // inner ends low: determined look
      head.add(b);
    }
  }
}

function mouth(head, r, y, z) {
  const dark = solid('#2a1a16');
  if (r.mouth === 'grin') {
    const shape = new THREE.Shape();
    shape.moveTo(-0.055, 0.012);
    shape.lineTo(0.055, 0.012);
    shape.quadraticCurveTo(0.05, -0.045, 0, -0.045);
    shape.quadraticCurveTo(-0.05, -0.045, -0.055, 0.012);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.01, bevelEnabled: false }), solid('#6b1f1a'));
    m.position.set(0, y, z - 0.004);
    const teeth = mesh(new THREE.BoxGeometry(0.09, 0.016, 0.012), solid('#ffffff'), y + 0.002, 0, z + 0.002);
    head.add(m, teeth);
  } else if (r.mouth === 'flat') {
    head.add(mesh(box(0.06, 0.012, 0.012, 0.004), dark, y, 0, z));
  } else {
    // Smile, or a lopsided smirk.
    const lift = r.mouth === 'smirk' ? 0.018 : 0;
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.045, y + 0.012, z), new THREE.Vector3(0, y - 0.022, z + 0.006), new THREE.Vector3(0.045, y + 0.012 + lift, z));
    head.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.007, 4), dark));
  }
}

// ---- Props ---------------------------------------------------------------------------------

function tablet(r) {
  const g = new THREE.Group();
  g.add(mesh(box(0.3, 0.035, 0.22, 0.03), solid(r.primary, { roughness: 0.45 }), 0));
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.012, 0.15), solid('#1a9a96', { roughness: 0.3, emissive: '#0c3f3d', emissiveIntensity: 0.4 }), 0.018));
  for (const s of [1, -1]) g.add(mesh(new THREE.BoxGeometry(0.025, 0.012, 0.01), solid('#ffffff'), 0.018, s * 0.13, -0.095));
  g.add(mesh(new THREE.BoxGeometry(0.04, 0.012, 0.02), solid('#16171a'), 0.018, 0, 0.1));
  return g;
}

function wheelgun(r) {
  const g = new THREE.Group();
  const white = solid('#F2F2F0', { roughness: 0.4 });
  const team = solid(r.primary, { roughness: 0.4 });
  const grey = solid('#5c5f66', { roughness: 0.5, metalness: 0.4 });
  g.add(mesh(box(0.1, 0.1, 0.18, 0.02), white, 0.02, 0, 0.0)); // body
  g.add(mesh(box(0.085, 0.085, 0.1, 0.018), team, 0.02, 0, 0.13)); // nose
  g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.07, 16).rotateX(Math.PI / 2), grey, 0.02, 0, 0.21)); // socket
  g.add(mesh(box(0.05, 0.03, 0.06, 0.01), team, 0.085, 0, -0.03)); // vent
  g.add(mesh(box(0.06, 0.14, 0.06, 0.015), white, -0.09, 0, -0.03)); // grip
  g.add(mesh(box(0.075, 0.03, 0.08, 0.01), team, -0.17, 0, -0.03)); // base
  g.add(mesh(box(0.03, 0.04, 0.03, 0.008), team, -0.03, 0, 0.04)); // trigger
  g.scale.setScalar(1.5); // chunky, so it reads at card size
  return g;
}

// ---- Model ---------------------------------------------------------------------------------

export function buildCharacter(recipe = DEFAULT_RECIPE) {
  const r = { ...DEFAULT_RECIPE, ...recipe };
  const root = new THREE.Group();
  root.name = `player_${r.name}`;
  const body = pivot(root, 0, 0.84);
  const J = { body };

  // Pelvis, belt and torso.
  body.add(mesh(box(0.4, 0.14, 0.23), suitMaterials(r, 'pelvis'), 0.0));
  const belt = new THREE.Group();
  belt.add(mesh(box(0.42, 0.055, 0.25, 0.01), solid(DARK), 0));
  belt.add(mesh(box(0.07, 0.045, 0.02, 0.005), solid('#6a6d74', { metalness: 0.5 }), 0, 0, 0.13));
  belt.position.y = 0.09;
  body.add(belt);
  const chest = pivot(body, 0, 0.12);
  J.chest = chest;
  chest.add(mesh(box(0.46, 0.4, 0.25, 0.03), suitMaterials(r, 'torso'), 0.2));
  chest.add(mesh(box(0.22, 0.06, 0.18, 0.015), solid(r.secondary === '#FFFFFF' ? '#F2F2F0' : r.secondary), 0.42)); // collar
  chest.add(mesh(box(0.1, 0.061, 0.02, 0.005), solid(DARK), 0.42, 0, 0.085)); // collar opening

  // Head: smooth oval, face parts, full-face helmet.
  const head = pivot(chest, 0, 0.45);
  J.head = head;
  const skin = solid(r.skin);
  const skull = mesh(new THREE.SphereGeometry(0.16, 28, 20), skin, 0.15);
  skull.scale.set(1, 1.12, 1);
  head.add(skull);
  const fz = 0.162; // front of the face
  if (!r.visorDown) {
    eyes(head, r, 0.165, fz);
    brows(head, r, 0.212, fz - 0.006);
  }
  mouth(head, r, 0.08, fz - 0.022);

  // Full-face helmet (after the helmet reference): an egg-shaped shell with a
  // face window from the brow to below the mouth, a chin guard, a dark lining
  // and a wide visor band that wraps round the front.
  const helmet = new THREE.Group();
  const shell = solid(r.primary, { roughness: 0.3, metalness: 0.05 });
  const R = 0.215;
  const WIN = Math.PI * 0.3; // half-width of the face window
  const T0 = Math.PI * 0.4; // window top (just above the brows)
  const T1 = Math.PI * 0.68; // window bottom (below the mouth)
  const part = (phi0, phiLen, th0, thLen, rad = R) => new THREE.SphereGeometry(rad, 40, 28, phi0, phiLen, th0, thLen);
  const shellParts = [
    part(0, Math.PI * 2, 0, T0), // crown
    part(Math.PI / 2 + WIN, Math.PI * 2 - 2 * WIN, T0, T1 - T0), // sides and back around the window
    part(0, Math.PI * 2, T1, Math.PI * 0.9 - T1), // chin guard, open underneath for the neck
  ];
  for (const g of shellParts) {
    const m = mesh(g, shell, 0.16);
    m.scale.set(1, 1.15, 1.08);
    helmet.add(m);
  }
  const lining = mesh(new THREE.SphereGeometry(R - 0.006, 32, 20), solid('#141416', { roughness: 0.9, side: THREE.BackSide }), 0.16);
  lining.scale.set(1, 1.15, 1.08);
  helmet.add(lining);
  // Visor: pulled down over the eyes, or raised onto the forehead.
  const vT = r.visorDown ? T0 - 0.02 : Math.PI * 0.27;
  const visor = mesh(
    part(Math.PI / 2 - Math.PI * 0.4, Math.PI * 0.8, vT, Math.PI * 0.14, R + 0.008),
    solid(r.visor, { roughness: 0.08, metalness: r.visor === '#16171a' ? 0.5 : 0.75, side: THREE.DoubleSide }),
    0.16
  );
  visor.scale.set(1, 1.15, 1.08);
  helmet.add(visor);
  // Sky Circuit stripe mark on the crown.
  for (let k = 0; k < 3; k++) {
    const bar = mesh(box(0.075, 0.012, 0.01, 0.004), solid('#ffffff'), 0.38 - k * 0.02, 0.012 + k * 0.006, 0.105 - k * 0.012);
    bar.rotation.x = -0.95;
    bar.rotation.z = 0.15;
    helmet.add(bar);
  }
  head.add(helmet);
  J.helmet = helmet;

  // Arms: shoulder > upper arm > elbow > forearm > hand.
  const bare = r.gloves === 'bare';
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const shoulder = pivot(chest, s * 0.3, 0.36);
    shoulder.add(mesh(box(0.16, 0.25, 0.17, 0.03), suitMaterials(r, 'upperArm', s), -0.1));
    const elbow = pivot(shoulder, 0, -0.23);
    elbow.add(mesh(box(0.145, 0.23, 0.155, 0.025), suitMaterials(r, 'forearm', s), -0.1));
    const hand = pivot(elbow, 0, -0.23);
    const handMat = bare ? skin : faceNames(s).map(({ f }, i) => new THREE.MeshStandardMaterial({ map: texture(`glove|${r.gloves}|${r.primary}|${f}|${i}`, (ctx, S) => paintGlove(ctx, S, r, f)), roughness: 0.6 }));
    hand.add(mesh(box(bare ? 0.12 : 0.14, 0.13, bare ? 0.12 : 0.14, 0.025), handMat, -0.05));
    J[`shoulder${side}`] = shoulder;
    J[`elbow${side}`] = elbow;
    J[`hand${side}`] = hand;
  }

  // Legs: hip > thigh > knee > shin + knee pad > shoe.
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const hip = pivot(body, s * 0.1, -0.06);
    hip.add(mesh(box(0.18, 0.34, 0.2, 0.03), suitMaterials(r, 'thigh', s), -0.17));
    const knee = pivot(hip, 0, -0.34);
    knee.add(mesh(box(0.16, 0.36, 0.18, 0.025), suitMaterials(r, 'shin', s), -0.18));
    knee.add(mesh(box(0.15, 0.14, 0.06, 0.03), solid(DARK), -0.03, 0, 0.1));
    knee.add(mesh(box(0.168, 0.03, 0.19, 0.006), solid(DARK), -0.03, 0, 0));
    const shoe = new THREE.Group();
    shoe.add(mesh(box(0.18, 0.05, 0.3, 0.015), solid(DARK), -0.37, 0, 0.04));
    shoe.add(mesh(box(0.17, 0.1, 0.27, 0.03), solid(r.secondary === '#FFFFFF' ? '#F2F2F0' : r.primary), -0.3, 0, 0.03));
    shoe.add(mesh(box(0.174, 0.025, 0.2, 0.008), solid(r.primary), -0.27, 0, 0.06));
    knee.add(shoe);
    J[`hip${side}`] = hip;
    J[`knee${side}`] = knee;
  }

  // Props.
  if (r.prop === 'tablet') {
    const t = tablet(r);
    t.position.set(0, 0.03, 0.3);
    t.rotation.x = -0.95;
    chest.add(t);
    J.prop = t;
  } else if (r.prop === 'wheelgun') {
    const gun = wheelgun(r);
    gun.position.set(0, -0.08, 0.02);
    gun.rotation.x = -Math.PI / 2;
    J.handR.add(gun);
    J.prop = gun;
  }

  root.userData.joints = J;
  root.userData.recipe = r;
  root.userData.pose = r.pose || 'akimbo';
  root.userData.poseT = 0;
  return root;
}

// ---- Poses -------------------------------------------------------------------------------

// Each pose returns joint rotations [x, y, z] for time t, plus body y offset.
const POSES = {
  akimbo: (t) => ({
    shoulderL: [0, 0, 0.62], elbowL: [0, 0, -1.9], shoulderR: [0, 0, -0.62], elbowR: [0, 0, 1.9],
    hipL: [0, 0, 0.07], hipR: [0, 0, -0.07], chest: [0, Math.sin(t * 0.8) * 0.05, 0], head: [0, Math.sin(t * 0.6) * 0.12, 0],
    body: Math.sin(t * 1.6) * 0.006,
  }),
  tablet: (t) => ({
    shoulderL: [-0.35, 0, 0.12], elbowL: [-1.15, -0.35, 0], shoulderR: [-0.35, 0, -0.12], elbowR: [-1.15, 0.35, 0],
    hipL: [0, 0, 0.04], hipR: [0, 0, -0.04], head: [0.3 + Math.sin(t * 0.7) * 0.03, 0, 0],
    body: Math.sin(t * 1.6) * 0.005,
  }),
  wave: (t) => ({
    shoulderL: [0, 0, 2.5], elbowL: [0, 0, 0.35 + Math.sin(t * 9) * 0.45],
    shoulderR: [0, 0, -0.12], elbowR: [-0.25, 0, 0],
    hipL: [0, 0, 0.06], hipR: [0, 0, -0.06], head: [0, 0.15, -0.06],
  }),
  action: (t) => ({
    body: -0.1 + Math.sin(t * 2) * 0.01,
    chest: [0.28, -0.2, 0], head: [-0.2, 0.2, 0],
    hipL: [-0.45, 0, 0.3], kneeL: [0.7, 0, 0], hipR: [0.2, 0, -0.32], kneeR: [0.55, 0, 0],
    shoulderR: [-0.35, 0, -0.35], elbowR: [-0.5, 0, 0],
    shoulderL: [-0.5, 0, 0.55], elbowL: [-1.1, 0, 0],
  }),
  crossed: (t) => ({
    shoulderL: [-0.62, 0, 0.12], elbowL: [0, 0, -1.42], shoulderR: [-0.78, 0, -0.12], elbowR: [0, 0, 1.42],
    hipL: [0, 0, 0.05], hipR: [0, 0, -0.05], head: [0, Math.sin(t * 0.5) * 0.1, 0], chest: [-0.04, 0, 0],
    body: Math.sin(t * 1.6) * 0.005,
  }),
  thumbs: (t) => ({
    shoulderL: [-1.2, 0, 0.2], elbowL: [-0.9, 0, 0], shoulderR: [-1.2, 0, -0.2], elbowR: [-0.9, 0, 0],
    hipL: [0, 0, 0.07], hipR: [0, 0, -0.07], head: [0.05, 0, 0],
    body: Math.abs(Math.sin(t * 5)) * 0.02,
  }),
  jump: (t) => {
    const k = (t % 1.2) / 1.2;
    const air = k > 0.2 && k < 0.8 ? Math.sin(((k - 0.2) / 0.6) * Math.PI) : 0;
    const crouch = k < 0.2 ? Math.sin((k / 0.2) * Math.PI) : 0;
    return {
      shoulderL: [0, 0, 0.3 + air * 2.4], shoulderR: [0, 0, -0.3 - air * 2.4], elbowL: [0, 0, 0], elbowR: [0, 0, 0],
      hipL: [-crouch * 0.6, 0, 0.07], hipR: [-crouch * 0.6, 0, -0.07], kneeL: [crouch * 1.1, 0, 0], kneeR: [crouch * 1.1, 0, 0],
      body: air * 0.35 - crouch * 0.1,
    };
  },
};
export const EMOTES = { akimbo: 'Hands on hips', tablet: 'Check the tablet', wave: 'Wave', action: 'Ready stance', crossed: 'Arms crossed', thumbs: 'Thumbs up', jump: 'Jump' };

export function animateCharacter(root, dt) {
  const J = root.userData.joints;
  root.userData.poseT += dt;
  const p = (POSES[root.userData.pose] || POSES.akimbo)(root.userData.poseT);
  const k = 1 - Math.exp(-dt * 12);
  for (const name of ['shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'hipL', 'hipR', 'kneeL', 'kneeR', 'chest', 'head']) {
    const target = p[name] || [0, 0, 0];
    const rot = J[name].rotation;
    rot.x += (target[0] - rot.x) * k;
    rot.y += (target[1] - rot.y) * k;
    rot.z += (target[2] - rot.z) * k;
  }
  J.body.position.y += (0.84 + (p.body || 0) - J.body.position.y) * k;
  // The tablet only shows while it is being held.
  if (J.prop && root.userData.recipe.prop === 'tablet') J.prop.visible = root.userData.pose === 'tablet';
}

export function setPose(root, pose) {
  root.userData.pose = pose;
  root.userData.poseT = 0;
}
