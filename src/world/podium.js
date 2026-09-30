// Raised celebration podium, after the classic Monza balcony: a two storey
// base building carries a balcony that cantilevers out over a standing crowd,
// with a curved branded fascia, glass balustrade, podium steps 1-3, a curved
// LED backdrop and staircases either side. Built facing local +Z.

import * as THREE from 'three';
import { bevelBox, merge, rod } from '../geo.js';
import { GRID as TEAMS } from '../data.js';
import { textTexture } from './world.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });

export const PODIUM_HEIGHT = 7; // balcony floor height (m)

// brand: the name on the fascia and backdrop; palette 'dawn' swaps the navy
// and white for Caspian Dawn's plum and sandstone.
export function buildRaisedPodium({ brand = 'SKY CIRCUIT', palette = 'sky' } = {}) {
  const g = new THREE.Group();
  const H = PODIUM_HEIGHT;
  const W = 16;
  const dawn = palette === 'dawn';
  const navyHex = dawn ? '#2B2340' : '#16202E';
  const navy = mat(navyHex, { roughness: 0.55 });
  const white = mat(dawn ? '#E8D6B8' : '#F2F0EB', { roughness: 0.35 });
  const gold = new THREE.MeshStandardMaterial({ color: '#D6B24C', metalness: 0.85, roughness: 0.25 });
  const steel = new THREE.MeshStandardMaterial({ color: '#C9CED6', metalness: 0.7, roughness: 0.3 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#9fc3d6', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  const darkGlass = new THREE.MeshPhysicalMaterial({ color: '#223443', roughness: 0.08, metalness: 0.4, clearcoat: 1 });

  // Base building under the balcony.
  const base = new THREE.Mesh(bevelBox(W, H, 7, 0.1).translate(0, H / 2, -6.5), white);
  base.castShadow = base.receiveShadow = true;
  const windows = new THREE.Mesh(bevelBox(W - 1.2, 2.2, 0.1, 0.03).translate(0, H * 0.62, -2.97), darkGlass);
  const doors = new THREE.Mesh(bevelBox(4, 2.6, 0.1, 0.03).translate(0, 1.3, -2.97), darkGlass);
  g.add(base, windows, doors);

  // Balcony slab cantilevering forward, on slim columns.
  const slab = new THREE.Mesh(bevelBox(W, 0.45, 9, 0.08).translate(0, H + 0.22, -1.5), navy);
  slab.castShadow = slab.receiveShadow = true;
  const cols = [];
  for (const x of [-6.8, -2.3, 2.3, 6.8]) cols.push(rod(V(x, 0, 2.2), V(x, H, 2.2), 0.22, 12));
  const colMesh = new THREE.Mesh(merge(cols), steel);
  colMesh.castShadow = true;
  g.add(slab, colMesh);

  // Curved fascia band bulging out over the crowd, branded, with gold trims.
  const R = 26;
  const span = 2 * Math.asin((W / 2 + 0.2) / R);
  const zc = 3.0 + 1.3 - R; // arc apex at z = 4.3
  const fasciaTex = brandStrip(brand, navyHex);
  const fascia = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1.9, 48, 1, true, -span / 2, span), new THREE.MeshStandardMaterial({ map: fasciaTex, roughness: 0.45, side: THREE.DoubleSide }));
  fascia.position.set(0, H - 0.2, zc);
  fascia.castShadow = true;
  const trims = [];
  for (const y of [H - 1.15, H + 0.75]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.03, R + 0.03, 0.12, 48, 1, true, -span / 2, span), gold);
    t.position.set(0, y, zc);
    trims.push(t);
  }
  // Glass balustrade and hand rail on the arc.
  const balustrade = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.15, R - 0.15, 1.05, 48, 1, true, -span / 2, span), glass);
  balustrade.position.set(0, H + 0.45 + 0.52, zc);
  const railParts = [];
  const arcPt = (a, y) => V(Math.sin(a) * (R - 0.15), y, zc + Math.cos(a) * (R - 0.15));
  for (let i = 0; i < 32; i++) {
    const a0 = -span / 2 + (span * i) / 32;
    const a1 = -span / 2 + (span * (i + 1)) / 32;
    railParts.push(rod(arcPt(a0, H + 1.5), arcPt(a1, H + 1.5), 0.045, 5));
    if (i % 4 === 0) railParts.push(rod(arcPt(a0, H + 0.45), arcPt(a0, H + 1.5), 0.03, 4));
  }
  const rail = new THREE.Mesh(merge(railParts), steel);
  g.add(fascia, ...trims, balustrade, rail);
  // Balcony floor out to the curved front edge.
  const band = new THREE.Shape();
  const inner = R - 6;
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const a = -span / 2 + (span * i) / steps;
    band.lineTo(Math.sin(a) * (R - 0.12), Math.cos(a) * (R - 0.12));
  }
  for (let i = steps; i >= 0; i--) {
    const a = -span / 2 + (span * i) / steps;
    band.lineTo(Math.sin(a) * inner, Math.cos(a) * inner);
  }
  const bandGeo = new THREE.ExtrudeGeometry(band, { depth: 0.45, bevelEnabled: false });
  bandGeo.rotateX(Math.PI / 2); // shape y -> +z, extrusion hangs downward
  const floorBand = new THREE.Mesh(bandGeo, navy);
  floorBand.position.set(0, H + 0.45, zc);
  floorBand.receiveShadow = true;
  g.add(floorBand);

  // Podium steps 1-3 on the balcony.
  const floorY = H + 0.45;
  const heights = { 1: 1.1, 2: 0.75, 3: 0.45 };
  const xs = { 1: 0, 2: -2.3, 3: 2.3 };
  const stepZ = 0.4;
  for (const n of [1, 2, 3]) {
    const s = new THREE.Mesh(bevelBox(2.2, heights[n], 1.9, 0.06), white);
    s.position.set(xs[n], floorY + heights[n] / 2, stepZ);
    s.castShadow = s.receiveShadow = true;
    const b = new THREE.Mesh(bevelBox(2.24, 0.1, 1.94, 0.02), gold);
    b.position.set(xs[n], floorY + heights[n] - 0.065, stepZ);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshStandardMaterial({ map: textTexture([String(n)], { w: 128, h: 80, bg: '#F2F0EB', fg: '#16202E' }) }));
    label.position.set(xs[n], floorY + heights[n] / 2, stepZ + 0.955);
    g.add(s, b, label);
  }

  // Curved backdrop with LED band and mark.
  const BR = 10;
  const barc = 0.95;
  const bz = -4.6;
  const back = new THREE.Mesh(new THREE.CylinderGeometry(BR, BR, 4.4, 40, 1, true, Math.PI - barc / 2, barc), new THREE.MeshStandardMaterial({ color: navyHex, side: THREE.DoubleSide, roughness: 0.55 }));
  back.position.set(0, floorY + 2.2, bz + BR);
  back.castShadow = true;
  const markTex = textTexture([brand], { w: 1024, h: 128, bg: navyHex, fg: '#F4F5F7' });
  const mark = new THREE.Mesh(new THREE.CylinderGeometry(BR - 0.05, BR - 0.05, 1.1, 40, 1, true, Math.PI - barc * 0.3, barc * 0.6), new THREE.MeshStandardMaterial({ map: markTex, side: THREE.BackSide, roughness: 0.5 }));
  mark.position.set(0, floorY + 3.1, bz + BR);
  mark.scale.x = -1;
  const ledMat = new THREE.MeshStandardMaterial({ color: '#F5C518', emissive: '#F5C518', emissiveIntensity: 1.4, side: THREE.BackSide });
  const led = new THREE.Mesh(new THREE.CylinderGeometry(BR - 0.06, BR - 0.06, 0.12, 40, 1, true, Math.PI - barc / 2, barc), ledMat);
  led.position.set(0, floorY + 1.8, bz + BR);
  g.add(back, mark, led);

  // Staircases up both sides of the base.
  const stairs = [];
  const flights = 16;
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + 1.1);
    for (let k = 0; k < flights; k++) {
      const y = ((k + 1) / flights) * H;
      stairs.push(bevelBox(1.8, 0.18, 0.55, 0.02).translate(x, y - 0.09, -9.5 + k * 0.55));
    }
    stairs.push(bevelBox(1.8, 0.2, 1.8, 0.03).translate(x, H + 0.35, -0.3)); // landing
    const railPts = [V(x + sx * 0.9, 1, -9.5), V(x + sx * 0.9, H + 1, -9.5 + flights * 0.55)];
    stairs.push(rod(railPts[0], railPts[1], 0.04, 5));
    for (let k = 0; k <= flights; k += 4) stairs.push(rod(V(x + sx * 0.9, (k / flights) * H, -9.5 + k * 0.55), V(x + sx * 0.9, (k / flights) * H + 1, -9.5 + k * 0.55), 0.03, 4));
  }
  const stairMesh = new THREE.Mesh(merge(stairs), steel);
  stairMesh.castShadow = true;
  g.add(stairMesh);

  // Team flags on the roof edge behind the backdrop.
  const poles = [];
  const flags = [];
  TEAMS.forEach((t, k) => {
    const x = -6 + k * 3;
    poles.push(rod(V(x, H + 0.45, -8.8), V(x, H + 7.5, -8.8), 0.05, 6));
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1, 6, 1).translate(0.9, 0, 0), new THREE.MeshStandardMaterial({ color: t.primary, side: THREE.DoubleSide, roughness: 0.7 }));
    f.position.set(x, H + 6.9, -8.8);
    flags.push(f);
    g.add(f);
  });
  g.add(new THREE.Mesh(merge(poles), steel));

  // Standing crowd below the balcony, packed toward the fence, with flags.
  const crowd = buildStandingCrowd({ x0: -13, x1: 13, z0: 3.2, z1: 16.5 });
  g.add(crowd);
  // Fence between the crowd and the track.
  const fence = [];
  for (let x = -14; x <= 14; x += 2) fence.push(rod(V(x, 0, 17.4), V(x, 1.2, 17.4), 0.04, 5));
  fence.push(rod(V(-14, 1.2, 17.4), V(14, 1.2, 17.4), 0.04, 5), rod(V(-14, 0.6, 17.4), V(14, 0.6, 17.4), 0.03, 5));
  g.add(new THREE.Mesh(merge(fence), mat('#E9E7E1', { metalness: 0.4, roughness: 0.4 })));

  g.userData.stepTop = (n) => V(xs[n], floorY + heights[n], stepZ);
  g.userData.update = (t, excite = 0) => {
    crowd.userData.update(t, excite);
    for (const f of flags) ripple(f, t);
  };
  return g;
}

function brandStrip(brand, base) {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 2048, 0);
  grad.addColorStop(0, base);
  grad.addColorStop(0.5, base === '#16202E' ? '#1E3550' : '#4A3560');
  grad.addColorStop(1, base);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2048, 128);
  ctx.fillStyle = '#F4F5F7';
  ctx.font = '900 64px Nunito, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  [brand, 'CHAMPIONS', brand, 'CHAMPIONS'].forEach((t, i) => ctx.fillText(t, 256 + i * 512, 66));
  ctx.fillStyle = '#D6B24C';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(512 * i + 20, 64, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function ripple(f, t) {
  const pa = f.geometry.attributes.position;
  for (let k = 0; k < pa.count; k++) {
    const x = pa.getX(k);
    pa.setZ(k, Math.sin(x * 3 - t * 5 + f.position.x) * 0.15 * (x / 1.8));
  }
  pa.needsUpdate = true;
}

// Instanced standing fans (body, head, raised arms) facing +Z's opposite, i.e.
// toward the balcony at -Z, plus waving flags on poles.
function buildStandingCrowd({ x0, x1, z0, z1 }) {
  const g = new THREE.Group();
  const shirts = TEAMS.flatMap((t) => [t.primary, t.primary, t.primary, t.secondary, t.accent]).concat(['#ffffff', '#E8D35B', '#2B2F36', '#8A9BB0']);
  const skins = ['#F1CFB3', '#E0AE88', '#C48B63', '#9C6644', '#6E452C'];
  const rand = mulberry(31);
  const people = [];
  for (let z = z0; z < z1; z += 0.62) {
    // Denser near the balcony.
    const density = 0.95 - ((z - z0) / (z1 - z0)) * 0.35;
    for (let x = x0; x < x1; x += 0.62) {
      if (rand() > density) continue;
      people.push({ x: x + (rand() - 0.5) * 0.35, z: z + (rand() - 0.5) * 0.35, sh: shirts[Math.floor(rand() * shirts.length)], sk: skins[Math.floor(rand() * skins.length)], ph: rand() * 6.28, arms: rand() < 0.45, h: 0.9 + rand() * 0.2 });
    }
  }
  const body = new THREE.CapsuleGeometry(0.2, 0.75, 1, 5).translate(0, 0.72, 0);
  const head = new THREE.IcosahedronGeometry(0.14, 0).translate(0, 1.42, 0);
  const arms = merge([
    new THREE.CylinderGeometry(0.05, 0.05, 0.6, 3).rotateZ(0.35).translate(0.28, 1.62, 0),
    new THREE.CylinderGeometry(0.05, 0.05, 0.6, 3).rotateZ(-0.35).translate(-0.28, 1.62, 0),
  ]);
  const bodies = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.8 }), people.length);
  const heads = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ roughness: 0.7 }), people.length);
  const raisers = people.filter((p) => p.arms);
  const armMesh = new THREE.InstancedMesh(arms, new THREE.MeshStandardMaterial({ roughness: 0.75 }), raisers.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  const place = (t, excite) => {
    let ai = 0;
    people.forEach((p, i) => {
      const jump = Math.max(0, Math.sin(t * (3 + excite * 5) + p.ph)) * (0.03 + excite * 0.3);
      m.makeScale(1, p.h, 1).setPosition(p.x, jump, p.z);
      bodies.setMatrixAt(i, m);
      heads.setMatrixAt(i, m);
      if (p.arms) {
        const wave = new THREE.Matrix4().makeRotationZ(Math.sin(t * 4 + p.ph) * 0.15);
        const mm = m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 1.5 * p.h, 0)).multiply(wave).multiply(new THREE.Matrix4().makeTranslation(0, -1.5, 0));
        armMesh.setMatrixAt(ai++, mm);
      }
    });
    bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = armMesh.instanceMatrix.needsUpdate = true;
  };
  let ai = 0;
  people.forEach((p, i) => {
    bodies.setColorAt(i, c.set(p.sh));
    heads.setColorAt(i, c.set(p.sk));
    if (p.arms) armMesh.setColorAt(ai++, c.set(p.sk));
  });
  place(0, 0);
  bodies.castShadow = true;
  g.add(bodies, heads, armMesh);

  // Big waving flags held up in the crowd.
  const flags = [];
  const poles = [];
  for (let k = 0; k < 22; k++) {
    const t = TEAMS[k % TEAMS.length];
    const x = x0 + 1 + rand() * (x1 - x0 - 2);
    const z = z0 + 1 + rand() * (z1 - z0 - 2);
    const h = 3 + rand() * 1.5;
    poles.push(rod(V(x, 0.8, z), V(x, h, z), 0.025, 4));
    const w = 1.2 + rand() * 1.2;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.62, 6, 1).translate(w / 2, 0, 0), new THREE.MeshStandardMaterial({ color: rand() < 0.7 ? t.primary : t.secondary, side: THREE.DoubleSide, roughness: 0.7 }));
    f.position.set(x, h - w * 0.31, z);
    f.rotation.y = rand() * Math.PI * 2;
    flags.push(f);
    g.add(f);
  }
  g.add(new THREE.Mesh(merge(poles), new THREE.MeshStandardMaterial({ color: '#d9d9d9', roughness: 0.5 })));
  g.userData.update = (t, excite) => {
    place(t, excite);
    for (const f of flags) ripple(f, t * (1 + excite));
  };
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
