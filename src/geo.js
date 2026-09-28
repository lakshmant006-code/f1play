// Small geometry kit for building crisp, bevelled toy models in code.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export { mergeGeometries };

// Box with bevelled edges. Bevel defaults to the spec's 0.015 m car bevel.
export function bevelBox(w, h, d, bevel = 0.015, segments = 1) {
  const r = Math.min(bevel, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  return new RoundedBoxGeometry(w, h, d, segments, Math.max(r, 1e-4));
}

// Loft through rounded-rectangle cross sections along Z.
// Each section: { z, w, h, y (center), x (center, default 0), r (corner radius 0..1 of min(w,h)/2) }.
export function loft(sections, { around = 24, caps = true } = {}) {
  const ring = (s) => {
    const pts = [];
    const hw = s.w / 2;
    const hh = s.h / 2;
    const rr = Math.min(hw, hh) * (s.r ?? 0.55);
    // Superellipse-ish rounded rectangle, sampled evenly by angle.
    for (let i = 0; i < around; i++) {
      const a = (i / around) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const ex = 2 + 8 * (1 - rr / Math.max(Math.min(hw, hh), 1e-4)) ;
      const px = Math.sign(c) * Math.pow(Math.abs(c), 2 / ex) * hw;
      const py = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / ex) * hh;
      pts.push(new THREE.Vector3((s.x ?? 0) + px, s.y + py, s.z));
    }
    return pts;
  };
  const rings = sections.map(ring);
  const positions = [];
  const index = [];
  rings.forEach((r) => r.forEach((p) => positions.push(p.x, p.y, p.z)));
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < around; i++) {
      const a = k * around + i;
      const b = k * around + ((i + 1) % around);
      const c = (k + 1) * around + i;
      const d = (k + 1) * around + ((i + 1) % around);
      // Sections are ordered by decreasing z, so wind for outward normals.
      index.push(a, c, b, b, c, d);
    }
  }
  if (caps) {
    for (const [k, flip] of [[0, false], [rings.length - 1, true]]) {
      const s = sections[k];
      const center = positions.length / 3;
      positions.push(s.x ?? 0, s.y, s.z);
      for (let i = 0; i < around; i++) {
        const a = k * around + i;
        const b = k * around + ((i + 1) % around);
        if (flip) index.push(center, b, a);
        else index.push(center, a, b);
      }
    }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  // Loft sections usually run nose to tail (decreasing z); flip if they run the other way.
  if (sections.length > 1 && sections[0].z < sections[sections.length - 1].z) {
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.computeVertexNormals();
  }
  return g;
}

// Cylinder between two points.
export function rod(a, b, r, radial = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, radial, 1);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

// Swap X and Z of a geometry (a mirror), fixing winding so faces stay outward.
function swapXZ(g) {
  g = g.index ? g.toNonIndexed() : g;
  for (const name of ['position', 'normal']) {
    const a = g.attributes[name];
    if (!a) continue;
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i);
      a.setX(i, a.getZ(i));
      a.setZ(i, x);
    }
  }
  const pos = g.attributes.position;
  const others = Object.values(g.attributes);
  for (let i = 0; i < pos.count; i += 3) {
    for (const a of others) {
      for (let c = 0; c < a.itemSize; c++) {
        const t = a.getComponent(i + 1, c);
        a.setComponent(i + 1, c, a.getComponent(i + 2, c));
        a.setComponent(i + 2, c, t);
      }
    }
  }
  g.computeVertexNormals();
  return g;
}

// Flat profile given as [z, y] points, extruded along X with a small bevel: fins, endplates.
export function plateZY(points, thickness, bevel = 0.006) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(thickness - 2 * bevel, 0.001),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 6,
  });
  g.translate(0, 0, -(thickness - 2 * bevel) / 2);
  return swapXZ(g);
}

// Airfoil-ish wing element spanning X, chord along -Z from a leading edge at z=0.
export function wingElement(span, chord, thick, camber = 0.3) {
  const pts = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([-t * chord, thick * (0.5 + camber) * Math.sin(Math.PI * Math.pow(t, 0.7))]);
  }
  for (let i = n - 1; i > 0; i--) {
    const t = i / n;
    pts.push([-t * chord, -thick * (0.5 - camber) * Math.sin(Math.PI * Math.pow(t, 0.7))]);
  }
  return plateZY(pts, span, 0);
}

// Paint every vertex of a geometry one color (for vertex-colored shared materials).
export function tint(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Strip to position/normal(/uv/color) so geometries of different kinds merge cleanly.
export function clean(g, { uv = false, color = false } = {}) {
  let out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) {
    if (name === 'position' || name === 'normal') continue;
    if (name === 'uv' && uv) continue;
    if (name === 'color' && color) continue;
    out.deleteAttribute(name);
  }
  if (!out.attributes.normal) out.computeVertexNormals();
  return out;
}

export function merge(list, opts) {
  return mergeGeometries(list.map((g) => clean(g, opts)), false);
}

export const deg = (d) => (d * Math.PI) / 180;
