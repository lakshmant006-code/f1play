// Procedural open wheel single seater, built to the stylized dimensions in the
// spec: 4.8 m long, 1.9 m wide, 3.0 m wheelbase, 0.84 m wheels.
// Pivot at ground level between the axles, +Z forward, +Y up.
//
// car_root
//   car_sprung (lift, pitch, roll)
//     car_body   chassis, pods, halo, cockpit, fin   + seat_socket, jack_points
//     car_wing_F 3 elements, endplates               + car_wing_F_flap (0..15°)
//     car_wing_R plane, endplates, beam wing         + car_wing_R_flap (0..60°), car_rain_light
//   car_axle_F  front suspension  + car_steer_FL/FR (±25° Y) > car_wheel_FL/FR (spin X)
//   car_axle_R  rear suspension   + car_wheel_RL/RR (spin X)

import * as THREE from 'three';
import { bevelBox, loft, rod, plateZY, wingElement, merge, tint, deg } from '../geo.js';
import { liveryUV, swatchUV, paintLivery } from './livery.js';
import { PALETTE, COMPOUNDS } from '../data.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const CAR = {
  length: 4.8,
  width: 1.9,
  wheelbase: 3.0,
  wheelR: 0.42,
  frontTireW: 0.34,
  rearTireW: 0.42,
  frontX: 0.95 - 0.34 / 2,
  rearX: 0.95 - 0.42 / 2,
  rimR: 0.24,
};

// ---- Shared materials ----------------------------------------------------

const shared = {};
function mats() {
  if (shared.carbon) return shared;
  shared.carbon = new THREE.MeshStandardMaterial({ color: PALETTE.carbon, roughness: 0.5, metalness: 0.25 });
  shared.glass = new THREE.MeshStandardMaterial({ color: '#0d0f12', roughness: 0.18, metalness: 0.8 });
  shared.wheel = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.05 });
  shared.compound = {};
  for (const [id, c] of Object.entries(COMPOUNDS)) {
    shared.compound[id] = new THREE.MeshStandardMaterial({ color: c.hex, roughness: 0.6 });
  }
  shared.stand = new THREE.MeshStandardMaterial({ color: '#d9dde3', roughness: 0.4, metalness: 0.6 });
  return shared;
}

// ---- Geometry, built once and shared by every car -------------------------

let GEO = null;

function buildGeometry() {
  const paint = []; // livery-projected
  const paintSw = { primary: [], secondary: [], accent: [] };
  const carbon = [];
  const glass = [];

  // Monocoque: tapered nose to gearbox.
  paint.push(
    loft([
      { z: 2.42, w: 0.12, h: 0.09, y: 0.22, r: 0.9 },
      { z: 2.2, w: 0.17, h: 0.12, y: 0.24, r: 0.85 },
      { z: 1.8, w: 0.24, h: 0.18, y: 0.28, r: 0.8 },
      { z: 1.3, w: 0.34, h: 0.26, y: 0.33, r: 0.7 },
      { z: 0.9, w: 0.5, h: 0.34, y: 0.37, r: 0.6 },
      { z: 0.45, w: 0.66, h: 0.44, y: 0.38, r: 0.5 },
      { z: 0.0, w: 0.72, h: 0.46, y: 0.37, r: 0.5 },
      { z: -0.5, w: 0.66, h: 0.5, y: 0.38, r: 0.5 },
      { z: -1.1, w: 0.46, h: 0.42, y: 0.37, r: 0.55 },
      { z: -1.7, w: 0.28, h: 0.28, y: 0.33, r: 0.6 },
      { z: -2.02, w: 0.2, h: 0.2, y: 0.31, r: 0.6 },
    ])
  );

  // Engine cover and airbox above and behind the driver.
  paint.push(
    loft([
      { z: -0.12, w: 0.3, h: 0.34, y: 0.78, r: 0.9 },
      { z: -0.35, w: 0.34, h: 0.38, y: 0.76, r: 0.8 },
      { z: -0.8, w: 0.36, h: 0.3, y: 0.7, r: 0.8 },
      { z: -1.3, w: 0.28, h: 0.2, y: 0.62, r: 0.8 },
      { z: -1.85, w: 0.14, h: 0.1, y: 0.52, r: 0.8 },
    ])
  );
  // Shark fin carrying the number.
  paint.push(plateZY([[-0.55, 0.9], [-1.95, 0.84], [-1.95, 0.52], [-0.9, 0.62]], 0.018, 0.004));
  // Airbox inlet and camera pod.
  glass.push(loft([{ z: -0.1, w: 0.18, h: 0.16, y: 0.84, r: 1 }, { z: -0.14, w: 0.18, h: 0.16, y: 0.84, r: 1 }]));
  paintSw.accent.push(bevelBox(0.16, 0.05, 0.08, 0.012).translate(0, 0.975, -0.2));
  glass.push(new THREE.SphereGeometry(0.018, 8, 6).translate(0, 0.975, -0.155));

  // Sidepods with undercut and radiator inlets.
  for (const s of [1, -1]) {
    paint.push(
      loft([
        { z: 0.52, x: s * 0.52, w: 0.36, h: 0.26, y: 0.38, r: 0.55 },
        { z: 0.3, x: s * 0.54, w: 0.42, h: 0.3, y: 0.37, r: 0.5 },
        { z: -0.3, x: s * 0.52, w: 0.4, h: 0.28, y: 0.35, r: 0.5 },
        { z: -0.9, x: s * 0.4, w: 0.3, h: 0.22, y: 0.31, r: 0.55 },
        { z: -1.4, x: s * 0.26, w: 0.16, h: 0.14, y: 0.26, r: 0.7 },
      ])
    );
    glass.push(loft([{ z: 0.53, x: s * 0.52, w: 0.3, h: 0.16, y: 0.4, r: 0.8 }, { z: 0.5, x: s * 0.52, w: 0.3, h: 0.16, y: 0.4, r: 0.8 }]));
    // Mirrors on stalks.
    carbon.push(rod(V(s * 0.3, 0.58, 0.5), V(s * 0.46, 0.66, 0.46), 0.012));
    paintSw.primary.push(bevelBox(0.14, 0.06, 0.05, 0.01).translate(s * 0.5, 0.67, 0.46));
    glass.push(bevelBox(0.12, 0.045, 0.01, 0.004).translate(s * 0.5, 0.67, 0.43));
  }

  // Floor, edge wings and diffuser (kept simple, mostly hidden).
  carbon.push(bevelBox(1.36, 0.03, 3.1, 0.01).translate(0, 0.06, -0.25));
  carbon.push(bevelBox(0.5, 0.03, 0.9, 0.01).translate(0, 0.06, 1.6));
  for (const s of [1, -1]) carbon.push(plateZY([[0.9, 0.06], [-1.8, 0.06], [-1.8, 0.14], [0.6, 0.1]], 0.012, 0.003).translate(s * 0.69, 0, 0));
  for (let i = -2; i <= 2; i++) carbon.push(plateZY([[-1.75, 0.07], [-2.2, 0.28], [-2.2, 0.07]], 0.012, 0.003).translate(i * 0.16, 0, 0));
  carbon.push(bevelBox(0.8, 0.03, 0.45, 0.01).rotateX(deg(-22)).translate(0, 0.16, -2.0));

  // Cockpit: opening, headrest pads, steering wheel with screen.
  glass.push(loft([
    { z: 0.52, w: 0.34, h: 0.06, y: 0.6, r: 1 },
    { z: 0.3, w: 0.46, h: 0.06, y: 0.61, r: 1 },
    { z: -0.08, w: 0.46, h: 0.06, y: 0.615, r: 1 },
    { z: -0.14, w: 0.36, h: 0.06, y: 0.615, r: 1 },
  ]));
  for (const s of [1, -1]) paintSw.primary.push(bevelBox(0.09, 0.1, 0.34, 0.03).translate(s * 0.2, 0.64, 0.02));
  paintSw.primary.push(bevelBox(0.3, 0.12, 0.1, 0.03).translate(0, 0.65, -0.12));
  carbon.push(bevelBox(0.26, 0.12, 0.03, 0.02).rotateX(deg(-20)).translate(0, 0.64, 0.4));
  glass.push(bevelBox(0.1, 0.06, 0.01, 0.003).rotateX(deg(-20)).translate(0, 0.645, 0.382));

  // Halo: 0.05 m tube, three mounting points.
  const hoop = new THREE.CatmullRomCurve3([
    V(-0.29, 0.6, -0.24), V(-0.3, 0.79, -0.08), V(-0.23, 0.84, 0.22), V(0, 0.86, 0.36),
    V(0.23, 0.84, 0.22), V(0.3, 0.79, -0.08), V(0.29, 0.6, -0.24),
  ]);
  paintSw.secondary.push(new THREE.TubeGeometry(hoop, 24, 0.025, 8, false));
  paintSw.secondary.push(rod(V(0, 0.55, 0.64), V(0, 0.86, 0.36), 0.03, 8));

  // ---- Front wing (group space == car space) ----
  const wingF = [];
  const wingFcarbon = [];
  wingF.push(wingElement(1.62, 0.26, 0.035, 0.25).translate(0, 0.085, 2.46));
  wingF.push(wingElement(1.58, 0.16, 0.025, 0.25).translate(0, 0.135, 2.28));
  for (const s of [1, -1]) {
    wingF.push(plateZY([[2.5, 0.03], [1.98, 0.03], [1.98, 0.3], [2.3, 0.3]], 0.02, 0.005).translate(s * 0.83, 0, 0));
    wingFcarbon.push(rod(V(s * 0.08, 0.2, 2.25), V(s * 0.08, 0.1, 2.3), 0.012));
  }
  const flapF = wingElement(1.54, 0.14, 0.02, 0.25).translate(0, 0.19, 2.12); // pivot at leading edge below

  // ---- Rear wing ----
  const wingR = [];
  const wingRcarbon = [];
  wingR.push(wingElement(1.0, 0.28, 0.04, 0.2).translate(0, 0.72, -1.96));
  wingRcarbon.push(wingElement(0.9, 0.16, 0.03, 0.2).translate(0, 0.42, -2.0));
  for (const s of [1, -1]) {
    wingR.push(plateZY([[-1.9, 0.3], [-2.42, 0.3], [-2.42, 0.95], [-1.9, 0.95]], 0.02, 0.005).translate(s * 0.51, 0, 0));
  }
  wingRcarbon.push(rod(V(0, 0.3, -1.95), V(0, 0.72, -2.08), 0.02));
  const flapR = wingElement(0.98, 0.18, 0.025, 0.2).translate(0, 0.87, -2.18);

  // ---- Suspension (carbon wishbones and push rods) ----
  const susp = (s, zc, xw, xc, zfa, zfb) => {
    const out = [];
    const up = V(xw - s * 0.09, 0.56, zc);
    const lo = V(xw - s * 0.09, 0.28, zc);
    out.push(rod(V(xc, 0.46, zfa), up, 0.014), rod(V(xc, 0.46, zfb), up, 0.014));
    out.push(rod(V(xc, 0.24, zfa), lo, 0.014), rod(V(xc, 0.24, zfb), lo, 0.014));
    out.push(rod(lo, V(xc, 0.52, zc), 0.011));
    out.push(bevelBox(0.05, 0.34, 0.08, 0.015).translate(xw - s * 0.1, 0.42, zc));
    return out;
  };
  const suspF = [];
  const suspR = [];
  for (const s of [1, -1]) {
    suspF.push(...susp(s, 1.5, s * CAR.frontX, s * 0.14, 1.72, 1.28));
    suspR.push(...susp(s, -1.5, s * CAR.rearX, s * 0.13, -1.28, -1.75));
  }

  const P = (list) => liveryUV(merge(list));
  const SWT = (list, which) => swatchUV(merge(list), which);
  const withSw = (list) => merge([...list], { uv: true });

  // Static parts share one mesh per material (wings and suspension don't move
  // relative to the body); only the six rig nodes animate on their own.
  GEO = {
    body: withSw([P([...paint, ...wingF, ...wingR]), SWT(paintSw.primary, 'primary'), SWT(paintSw.secondary, 'secondary'), SWT(paintSw.accent, 'accent')]),
    bodyCarbon: merge([...carbon, ...wingFcarbon, ...wingRcarbon, ...suspF, ...suspR]),
    bodyGlass: merge(glass),
    flapF: centerOn(P([flapF]), V(0, 0.19, 2.12)),
    flapR: centerOn(P([flapR]), V(0, 0.87, -2.18)),
    tireF: tireGeometry(CAR.frontTireW),
    tireR: tireGeometry(CAR.rearTireW),
    bandF: bandGeometry(CAR.frontTireW),
    bandR: bandGeometry(CAR.rearTireW),
    blanketF: blanketGeometry(CAR.frontTireW),
    blanketR: blanketGeometry(CAR.rearTireW),
  };
  return GEO;
}

function centerOn(g, pivot) {
  g.translate(-pivot.x, -pivot.y, -pivot.z);
  g.userData.pivot = pivot;
  return g;
}

// Tire, rim and wheel cover in one vertex-colored mesh; axis along X.
function tireGeometry(w, accent = '#ffffff') {
  const R = CAR.wheelR;
  const hw = w / 2;
  const prof = [
    [CAR.rimR, -hw * 0.92], [0.3, -hw], [0.37, -hw * 0.98], [R - 0.03, -hw * 0.9], [R, -hw * 0.72],
    [R, hw * 0.72], [R - 0.03, hw * 0.9], [0.37, hw * 0.98], [0.3, hw], [CAR.rimR, hw * 0.92],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const tire = tint(new THREE.LatheGeometry(prof, 28), '#1b1c1f');
  const rim = tint(new THREE.CylinderGeometry(CAR.rimR, CAR.rimR, w * 0.86, 20, 1, true), '#43464c');
  const parts = [tire, rim];
  for (const s of [1, -1]) {
    const cover = tint(new THREE.CircleGeometry(CAR.rimR, 24), PALETTE.carbon);
    cover.rotateX(s > 0 ? -Math.PI / 2 : Math.PI / 2).translate(0, s * hw * 0.8, 0);
    const ring = tint(new THREE.RingGeometry(CAR.rimR * 0.7, CAR.rimR * 0.9, 24), accent);
    ring.rotateX(s > 0 ? -Math.PI / 2 : Math.PI / 2).translate(0, s * (hw * 0.8 + 0.003), 0);
    const hub = tint(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 8), '#b8bcc4').translate(0, s * (hw * 0.8 + 0.01), 0);
    parts.push(cover, ring, hub);
  }
  const g = merge(parts, { color: true });
  g.rotateZ(Math.PI / 2);
  return g;
}

// Colored compound band on both sidewalls.
function bandGeometry(w) {
  const hw = w / 2;
  const parts = [];
  for (const s of [1, -1]) {
    const ring = new THREE.RingGeometry(0.325, 0.352, 32);
    ring.rotateX(s > 0 ? -Math.PI / 2 : Math.PI / 2).translate(0, s * (hw * 0.995 + 0.004), 0);
    parts.push(ring);
  }
  const g = merge(parts);
  g.rotateZ(Math.PI / 2);
  return g;
}

function blanketGeometry(w) {
  const g = new THREE.CylinderGeometry(CAR.wheelR + 0.025, CAR.wheelR + 0.025, w + 0.03, 24, 1, true);
  g.rotateZ(Math.PI / 2);
  return g;
}

// ---- Car instance --------------------------------------------------------

const liveryCache = new Map();

export function createCar({ team, number, compound = 'medium' }) {
  const G = GEO || buildGeometry();
  const M = mats();
  const key = `${team.id}-${number}`;
  if (!liveryCache.has(key)) liveryCache.set(key, paintLivery(team, number));
  const livery = liveryCache.get(key);
  const paint = new THREE.MeshPhysicalMaterial({ map: livery, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.15, metalness: 0.05 });
  const rainMat = new THREE.MeshStandardMaterial({ color: '#3a0a0a', emissive: '#ff2a1a', emissiveIntensity: 0 });
  const blanketMat = new THREE.MeshStandardMaterial({ color: team.secondary, roughness: 0.85 });

  const mesh = (geo, mat, name, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  };
  const group = (name, parent) => {
    const g = new THREE.Group();
    g.name = name;
    parent?.add(g);
    return g;
  };

  const root = group('car_root');
  const sprung = group('car_sprung', root);
  const body = group('car_body', sprung);
  body.add(mesh(G.body, paint, 'car_body_paint'), mesh(G.bodyCarbon, M.carbon, 'car_body_carbon'), mesh(G.bodyGlass, M.glass, 'car_body_glass', false));
  const seat = group('car_seat_socket', body);
  seat.position.set(0, 0.3, 0.02);
  const jackF = group('car_jack_point_F', body);
  jackF.position.set(0, 0.2, 2.45);
  const jackR = group('car_jack_point_R', body);
  jackR.position.set(0, 0.3, -2.1);

  const wingF = group('car_wing_F', sprung);
  const flapF = group('car_wing_F_flap', wingF);
  flapF.position.copy(G.flapF.userData.pivot);
  flapF.add(mesh(G.flapF, paint, 'car_wing_F_flap_paint', false));

  const wingR = group('car_wing_R', sprung);
  const flapR = group('car_wing_R_flap', wingR);
  flapR.position.copy(G.flapR.userData.pivot);
  flapR.add(mesh(G.flapR, paint, 'car_wing_R_flap_paint'));
  const rain = mesh(bevelBox(0.14, 0.06, 0.03, 0.01), rainMat, 'car_rain_light', false);
  rain.position.set(0, 0.3, -2.23);
  wingR.add(rain);

  // Axles and wheels.
  const tireGeo = new Map();
  const tireFor = (w) => {
    if (!tireGeo.has(w)) tireGeo.set(w, tireGeometryCached(w, team.accent));
    return tireGeo.get(w);
  };
  const axleF = group('car_axle_F', root);
  const axleR = group('car_axle_R', root);

  const wheels = {};
  const steers = {};
  const bands = {};
  const blankets = [];
  const makeWheel = (corner, parent, x, z, w, bandGeo, blanketGeo) => {
    const holder = group(`car_hub_${corner}`, parent);
    holder.position.set(x, CAR.wheelR, z);
    const wheel = group(`car_wheel_${corner}`, holder);
    wheel.add(mesh(tireFor(w), M.wheel, `car_tire_${corner}`));
    const band = mesh(bandGeo, M.compound[compound], `car_band_${corner}`, false);
    wheel.add(band);
    const blanket = mesh(blanketGeo, blanketMat, `car_blanket_${corner}`);
    blanket.visible = false;
    wheel.add(blanket);
    blankets.push(blanket);
    wheels[corner] = wheel;
    bands[corner] = band;
    return holder;
  };
  for (const [corner, s] of [['FL', 1], ['FR', -1]]) {
    const steer = group(`car_steer_${corner}`, axleF);
    steer.position.set(s * CAR.frontX, 0, 1.5);
    steers[corner] = steer;
    makeWheel(corner, steer, 0, 0, CAR.frontTireW, G.bandF, G.blanketF);
  }
  for (const [corner, s] of [['RL', 1], ['RR', -1]]) {
    makeWheel(corner, axleR, s * CAR.rearX, -1.5, CAR.rearTireW, G.bandR, G.blanketR);
  }

  // Garage stands (hidden unless in garage state).
  const stands = group('car_stands', root);
  for (const z of [2.2, -2.1]) {
    const st = mesh(bevelBox(0.5, 0.14, 0.12, 0.02), M.stand, 'car_stand');
    st.position.set(0, 0.07, z);
    stands.add(st);
  }
  stands.visible = false;

  const car = {
    root,
    team,
    number,
    nodes: { sprung, body, wingF, wingR, flapF, flapR, rain, axleF, axleR, seat, jackF, jackR },
    wheels,
    steers,
    compounds: { FL: compound, FR: compound, RL: compound, RR: compound },
    paint,
    setCompound(corner, id) {
      bands[corner].material = M.compound[id];
      car.compounds[corner] = id;
    },
    setAllCompounds(id) {
      for (const c of Object.keys(bands)) car.setCompound(c, id);
    },
    setGarage(on) {
      stands.visible = on;
      blankets.forEach((b) => (b.visible = on));
      rainMat.emissiveIntensity = 0;
      car.lift(on ? 0.06 : 0);
    },
    lift(h) {
      sprung.position.y = h;
      axleF.position.y = h;
      axleR.position.y = h;
    },
    setRainLight(on) {
      rainMat.emissiveIntensity = on ? 3 : 0;
      rainMat.color.set(on ? '#ff4030' : '#3a0a0a');
    },
  };
  root.userData.car = car;
  return car;
}

// Tire meshes carry the team accent ring, so cache one per accent color.
const tireCache = new Map();
function tireGeometryCached(w, accent) {
  const k = `${w}-${accent}`;
  if (!tireCache.has(k)) tireCache.set(k, tireGeometry(w, accent));
  return tireCache.get(k);
}
