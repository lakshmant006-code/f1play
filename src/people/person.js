// Modular people kit shared by drivers, engineers and pit crew.
// One rigidly skinned mesh per person (16 bones, Mixamo-style names), so a
// whole person is a single draw call plus a helmet and props. Proportions:
// 1.65 m, 1:5 head to body, hands and boots 20% oversized.

import * as THREE from 'three';
import { bevelBox, tint, merge } from '../geo.js';
import { helmetGeometry, paintHelmet } from './helmet.js';
import { PALETTE } from '../data.js';

export const SKIN = ['#F3D2B6', '#E6B48F', '#C98D62', '#A86C45', '#7B4A2D', '#5A3520'];
export const HAIR = ['#2A1D16', '#5B3A21', '#A8672F', '#D9B26A', '#1B1B1D', '#8C8C8C'];

// Bind-pose joint positions (ground at y=0, facing +Z).
const J = {
  hips: [0, 0.86, 0],
  spine: [0, 0.98, 0],
  chest: [0, 1.14, 0],
  head: [0, 1.33, 0],
  armL: [0.2, 1.27, 0], foreL: [0.22, 1.02, 0], handL: [0.23, 0.78, 0],
  armR: [-0.2, 1.27, 0], foreR: [-0.22, 1.02, 0], handR: [-0.23, 0.78, 0],
  legL: [0.09, 0.84, 0], shinL: [0.09, 0.46, 0], footL: [0.09, 0.09, 0],
  legR: [-0.09, 0.84, 0], shinR: [-0.09, 0.46, 0], footR: [-0.09, 0.09, 0],
};
const PARENT = {
  hips: null, spine: 'hips', chest: 'spine', head: 'chest',
  armL: 'chest', foreL: 'armL', handL: 'foreL',
  armR: 'chest', foreR: 'armR', handR: 'foreR',
  legL: 'hips', shinL: 'legL', footL: 'shinL',
  legR: 'hips', shinR: 'legR', footR: 'shinR',
};
const MIXAMO = {
  hips: 'Hips', spine: 'Spine', chest: 'Spine2', head: 'Head',
  armL: 'LeftArm', foreL: 'LeftForeArm', handL: 'LeftHand',
  armR: 'RightArm', foreR: 'RightForeArm', handR: 'RightHand',
  legL: 'LeftUpLeg', shinL: 'LeftLeg', footL: 'LeftFoot',
  legR: 'RightUpLeg', shinR: 'RightLeg', footR: 'RightFoot',
};
export const BONES = Object.keys(J);
const BI = Object.fromEntries(BONES.map((b, i) => [b, i]));

// Outfits color the same zones the car livery uses: primary torso, secondary sleeves, accent trims.
const OUTFITS = {
  race: (c) => ({ torso: c.primary, sleeve: c.secondary, forearm: c.secondary, legs: c.primary, belt: c.accent, hands: c.secondary, boots: PALETTE.carbon }),
  fire: (c) => ({ torso: c.primary, sleeve: c.secondary, forearm: c.secondary, legs: c.secondary, belt: c.accent, hands: PALETTE.carbon, boots: PALETTE.carbon }),
  polo: (c, skin) => ({ torso: c.primary, sleeve: c.primary, forearm: skin, legs: '#2E3138', belt: c.secondary, hands: skin, boots: '#3b3b3f' }),
  jacket: (c, skin) => ({ torso: c.secondary === '#F5FAFA' ? c.primary : c.secondary, sleeve: c.primary, forearm: c.primary, legs: '#2E3138', belt: c.accent, hands: skin, boots: '#3b3b3f' }),
  overalls: (c, skin) => ({ torso: c.secondary === '#F5FAFA' ? c.accent : c.secondary, sleeve: c.primary, forearm: skin, legs: c.secondary === '#F5FAFA' ? c.accent : c.secondary, belt: c.primary, hands: PALETTE.carbon, boots: '#3b3b3f' }),
};

let sharedMat = null;
const personMat = () =>
  (sharedMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.02 }));

const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 3, 8);

function bodyGeometry(opts) {
  const { build = 'standard', female = false, skin = SKIN[1], hair = HAIR[0], hairStyle = 0, colors, outfit = 'race' } = opts;
  const o = OUTFITS[outfit](colors, skin);
  const bw = build === 'slim' ? 0.9 : build === 'broad' ? 1.15 : 1;
  const parts = [];
  const add = (geo, color, bone) => parts.push({ geo: tint(geo, color), bone });
  const at = (g, name, dy = 0, dx = 0, dz = 0) => g.translate(J[name][0] + dx, J[name][1] + dy, J[name][2] + dz);

  // Torso: abdomen, chest, belt.
  add(at(bevelBox(0.3 * bw, 0.2, 0.2, 0.06), 'hips', 0.0), o.legs, 'hips');
  add(at(bevelBox(0.29 * bw, 0.06, 0.21, 0.02), 'hips', 0.1), o.belt, 'hips');
  add(at(bevelBox(0.3 * bw, 0.16, 0.2, 0.06), 'spine', 0.04), o.torso, 'spine');
  add(at(bevelBox((female ? 0.34 : 0.38) * bw, 0.26, 0.23, 0.08), 'chest', 0.04), o.torso, 'chest');
  add(at(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 8), 'head', 0.0), skin, 'head');
  if (outfit === 'fire' || outfit === 'race') add(at(new THREE.CylinderGeometry(0.075, 0.08, 0.05, 10), 'head', -0.01), o.sleeve, 'chest'); // collar
  // Head, ears and hair (hidden under a helmet when one is worn).
  add(at(new THREE.SphereGeometry(0.13, 14, 10).scale(0.95, 1.05, 1), 'head', 0.15), skin, 'head');
  add(at(new THREE.SphereGeometry(0.135, 12, 6, 0, Math.PI * 2, 0, Math.PI * (0.45 + (hairStyle % 3) * 0.05)).scale(0.97, 1.05, 1.02), 'head', 0.16, 0, -0.005), hair, 'head');
  if (hairStyle >= 3) add(at(bevelBox(0.2, 0.16 + (hairStyle - 3) * 0.06, 0.06, 0.03), 'head', 0.1 - (hairStyle - 3) * 0.03, 0, -0.1), hair, 'head');
  for (const s of [1, -1]) add(at(new THREE.SphereGeometry(0.018, 6, 4), 'head', 0.19, s * 0.035, 0.12), '#1b1b1d', 'head'); // eyes

  for (const [side, s] of [['L', 1], ['R', -1]]) {
    // Arms.
    add(at(capsule(0.055 * bw, 0.17), `arm${side}`, -0.12, s * 0.01), o.sleeve, `arm${side}`);
    add(at(new THREE.SphereGeometry(0.07 * bw, 8, 6), `arm${side}`, 0), o.sleeve, 'chest'); // shoulder
    add(at(capsule(0.048, 0.15), `fore${side}`, -0.12), o.forearm, `fore${side}`);
    add(at(bevelBox(0.075, 0.13, 0.1, 0.03), `hand${side}`, -0.06), o.hands, `hand${side}`);
    // Legs.
    add(at(capsule(0.075 * bw, 0.24), `leg${side}`, -0.19), o.legs, `leg${side}`);
    add(at(capsule(0.063, 0.26), `shin${side}`, -0.19), o.legs, `shin${side}`);
    add(at(bevelBox(0.12, 0.1, 0.27, 0.035), `foot${side}`, -0.04, 0, 0.06), o.boots, `foot${side}`);
  }
  if (opts.kneePads) for (const s of ['L', 'R']) add(at(bevelBox(0.13, 0.12, 0.06, 0.02), `shin${s}`, 0.0, 0, 0.06), PALETTE.carbon, `shin${s}`);

  const geos = parts.map(({ geo, bone }) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const n = g.attributes.position.count;
    const idx = new Uint16Array(n * 4);
    const w = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      idx[i * 4] = BI[bone];
      w[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(w, 4));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
    return g;
  });
  return mergeSkinned(geos);
}

// merge() strips unknown attributes, so skinned parts are merged directly.
function mergeSkinned(geos) {
  const total = geos.reduce((a, g) => a + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const [name, size, Arr] of [['position', 3, Float32Array], ['normal', 3, Float32Array], ['color', 3, Float32Array], ['skinIndex', 4, Uint16Array], ['skinWeight', 4, Float32Array]]) {
    const arr = new Arr(total * size);
    let o = 0;
    for (const g of geos) {
      arr.set(g.attributes[name].array, o);
      o += g.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}

function buildSkeleton() {
  const bones = {};
  for (const name of BONES) {
    const b = new THREE.Bone();
    b.name = `mixamorig:${MIXAMO[name]}`;
    const p = J[name];
    const parent = PARENT[name];
    if (parent) {
      const pp = J[parent];
      b.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
      bones[parent].add(b);
    } else {
      b.position.set(...p);
    }
    bones[name] = b;
  }
  return bones;
}

// ---- Props (vertex colored, attached to bones or the person root) ---------

export function propGeometry(kind, colors = {}) {
  const P = [];
  const add = (g, c) => P.push(tint(g, c));
  switch (kind) {
    case 'tablet':
      add(bevelBox(0.2, 0.28, 0.015, 0.006), '#1b1c1f');
      add(new THREE.PlaneGeometry(0.17, 0.24).translate(0, 0, 0.009), '#58c7f0');
      break;
    case 'headset':
      add(new THREE.TorusGeometry(0.14, 0.012, 6, 16, Math.PI).translate(0, 0.02, 0), '#1b1c1f');
      for (const s of [1, -1]) add(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12).rotateZ(Math.PI / 2).translate(s * 0.14, 0, 0), colors.primary || '#1b1c1f');
      add(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 4).rotateX(Math.PI / 2.4).translate(0.13, -0.05, 0.07), '#1b1c1f');
      break;
    case 'cap':
      add(new THREE.SphereGeometry(0.14, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.7, 1.02), colors.primary || '#333');
      add(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 14, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 1.2).translate(0, 0.0, 0.1), colors.secondary || '#222');
      break;
    case 'glasses':
      for (const s of [1, -1]) add(new THREE.TorusGeometry(0.03, 0.006, 4, 12).translate(s * 0.045, 0, 0), '#1b1c1f');
      break;
    case 'wheelgun':
      add(bevelBox(0.09, 0.12, 0.3, 0.02), '#d9dde3');
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 10).rotateX(Math.PI / 2).translate(0, 0, 0.2), '#8e949c');
      add(bevelBox(0.05, 0.16, 0.06, 0.015).translate(0, -0.12, -0.05), '#1b1c1f');
      add(bevelBox(0.03, 0.03, 0.04, 0.008).translate(0, 0.07, -0.1), colors.primary || '#ff6600');
      break;
    case 'crewhelmet':
      add(new THREE.SphereGeometry(0.155, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62).scale(1, 1.02, 1.08), colors.primary || '#eee');
      add(new THREE.SphereGeometry(0.16, 14, 5, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.36, Math.PI * 0.2).scale(1, 1.02, 1.08), '#20242a');
      break;
    case 'wrench':
      add(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 6), '#aab0b8');
      add(bevelBox(0.07, 0.04, 0.03, 0.008).translate(0, 0.26, 0), '#aab0b8');
      break;
    case 'rag':
      add(bevelBox(0.14, 0.02, 0.2, 0.008), '#d6423a');
      break;
    case 'trophy':
      add(new THREE.CylinderGeometry(0.05, 0.07, 0.08, 12), '#6b4a2a');
      add(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 8).translate(0, 0.1, 0), '#e8c14a');
      add(new THREE.LatheGeometry([[0.02, 0], [0.09, 0.06], [0.11, 0.16], [0.1, 0.2]].map(([a, b]) => new THREE.Vector2(a, b)), 16).translate(0, 0.16, 0), '#e8c14a');
      break;
    case 'bottle':
      add(new THREE.CylinderGeometry(0.04, 0.045, 0.22, 10), '#2f5b36');
      add(new THREE.CylinderGeometry(0.015, 0.03, 0.08, 8).translate(0, 0.15, 0), '#e8c14a');
      break;
    default:
      return null;
  }
  return merge(P, { color: true });
}

// ---- Person ----------------------------------------------------------------

export function createPerson(opts) {
  const { colors, helmet = null, crewHelmet = false, props = [], name = 'person', scale = 1 } = opts;
  const root = new THREE.Group();
  root.name = name;
  const bones = buildSkeleton();
  const geo = bodyGeometry(opts);
  const mesh = new THREE.SkinnedMesh(geo, personMat());
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.add(bones.hips);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(BONES.map((b) => bones[b])));
  root.add(mesh);
  root.scale.setScalar(scale);

  // Sockets for helmet, caps and hand props.
  const socket = (bone, name, pos = [0, 0, 0], rot = [0, 0, 0]) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(...pos);
    g.rotation.set(...rot);
    bones[bone].add(g);
    return g;
  };
  const sockets = {
    head: socket('head', 'head_socket', [0, 0.16, 0]),
    handR: socket('handR', 'hand_socket_R', [0, -0.08, 0.03]),
    handL: socket('handL', 'hand_socket_L', [0, -0.08, 0.03]),
    back: socket('chest', 'back_socket', [0, 0.02, -0.14]),
  };

  const person = { root, mesh, bones, sockets, opts, helmetGroup: null, props: {}, visorOpen: 0 };

  if (helmet) {
    const hg = helmetGeometry();
    const tex = paintHelmet(helmet);
    const shellMat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.6 });
    const visorMat = new THREE.MeshStandardMaterial({ color: '#2a2f3a', roughness: 0.1, metalness: 0.8, envMapIntensity: 1.5 });
    const g = new THREE.Group();
    g.name = 'driver_helmet';
    const shell = new THREE.Mesh(hg.shell, shellMat);
    shell.castShadow = true;
    const visor = new THREE.Mesh(hg.visor, visorMat);
    visor.name = 'driver_helmet_visor';
    const extras = new THREE.Mesh(merge([hg.intake, hg.spoiler, hg.collar]), darkMat);
    extras.castShadow = visor.castShadow = false;
    g.add(shell, visor, extras);
    g.position.y = 0.0;
    sockets.head.add(g);
    person.helmetGroup = g;
    person.visor = visor;
  } else if (crewHelmet) {
    const g = new THREE.Mesh(propGeometry('crewhelmet', colors), personMat());
    g.castShadow = true;
    sockets.head.add(g);
    person.helmetGroup = g;
  }

  for (const p of props) attachProp(person, p.kind, p.socket, p.pos, p.rot, colors);
  return person;
}

export function attachProp(person, kind, socketName, pos = [0, 0, 0], rot = [0, 0, 0], colors = person.opts.colors) {
  const geo = propGeometry(kind, colors);
  if (!geo) return null;
  const m = new THREE.Mesh(geo, personMat());
  m.name = `prop_${kind}`;
  m.castShadow = false;
  m.position.set(...pos);
  m.rotation.set(...rot);
  (person.sockets[socketName] || person.root).add(m);
  person.props[kind] = m;
  return m;
}

export function setHelmet(person, on) {
  if (person.helmetGroup) person.helmetGroup.visible = on;
}
