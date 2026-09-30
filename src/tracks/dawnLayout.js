// Caspian Dawn: a street circuit inspired by Baku, at dawn, on small floating
// islands. It shares the Sky Circuit's paddock: the last corner, the start /
// finish straight and the pit lane sit exactly where the Sky Circuit's do, so
// the same garages, pit wall and crews serve both tracks.
//
// The lap is a figure of eight. From the pit straight (south) it runs up the
// east side and onto a long viaduct over open sky, which crosses high above
// the low bridge that brings the lap back. The north islands are the old city:
// a narrow climb along the walls, the horseshoe at the top, and the descent
// through a waterfall arch.
// Units are meters, +Y up, +Z north (the infield side of the pit straight).

import * as THREE from 'three';
import { Path } from '../game/path.js';
import { PIT_ISLAND_RECT, pitLaneExtras } from '../game/layout.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);

export const DAWN_WIDTH = 12;
export const CASTLE_WIDTH = 9; // the old city squeeze
export const CROSSING = v(60, 0, 150); // where the viaduct passes over the low bridge

// Closed loop, starting on the pit straight like the Sky Circuit.
export const DAWN_POINTS = [
  // Pit straight (shared with the Sky Circuit), then the boulevard run to turn 1.
  v(-60, 0, -35), v(0, 0, -35), v(60, 0, -35), v(115, 0, -35),
  // Turn 1 and the east side, north.
  v(150, 0, -30), v(172, 0, -12), v(180, 0, 16), v(177, 0, 44),
  // Up the ramp onto the viaduct, north west over the sky.
  v(152, 0.6, 62), v(126, 2.2, 84), v(96, 5.6, 114), CROSSING.clone().setY(9), v(22, 6.4, 188), v(-6, 2.6, 216),
  // Old city: down off the viaduct, then the narrow climb north along the walls.
  v(-30, 0.4, 244), v(-46, 1.2, 272), v(-42, 2.6, 300), v(-50, 3.8, 326),
  // The horseshoe at the top.
  v(-40, 5, 352), v(-16, 5, 366), v(12, 5, 364), v(32, 5, 346),
  // Down through the waterfall arch, east.
  v(52, 4.4, 322), v(78, 3, 306), v(108, 1.4, 296), v(140, 0.2, 280), v(162, 0, 256),
  // Round onto the low bridge, south west under the viaduct.
  v(156, 0, 232), v(128, 0, 216), v(96, 0, 186), CROSSING.clone(), v(26, 0, 116),
  // West side, back to the last corner (shared with the Sky Circuit).
  v(-6, 0, 86), v(-36, 0, 60), v(-58, 0, 30), v(-60, 0, 8), v(-74, 0, -8), v(-80, 0, -24), v(-72, 0, -34),
];

export function buildDawnTrack() {
  return new Path(DAWN_POINTS, { closed: true });
}

// Distances along the lap for the named features, found from their positions.
export function dawnFeatures(track) {
  const at = (x, y, z) => track.nearest(v(x, y, z));
  return {
    castle: [at(-30, 0.4, 244), at(-50, 3.8, 326)],
    horseshoe: [at(-48, 4.6, 336), at(40, 4.8, 336)],
    waterfall: at(78, 3, 306),
    // DRS: detected at the last corner, open down the pit straight and boulevard.
    drsDetect: at(-78, 0, -18),
    drs: [[at(-40, 0, -35), at(118, 0, -35)]],
    crossing: CROSSING.clone(),
  };
}

// Road width along the lap (narrow through the castle section).
export function dawnWidth(features) {
  const [a, b] = features.castle;
  return (s) => {
    const edge = 14;
    const t = Math.min(1, Math.max(0, Math.min(s - a, b - s) / edge));
    return DAWN_WIDTH + (CASTLE_WIDTH - DAWN_WIDTH) * t;
  };
}

// Where the landmarks stand (same shape as the Sky Circuit's LANDMARKS).
export const DAWN_LANDMARKS = {
  grandstand: { x: 88, z: -12, rot: Math.PI, len: 34 }, // north of the straight, facing it
  grandstand2: { x: 166.7, z: -40.4, rot: -0.626, len: 30 }, // outside turn 1, facing back up the straight
  tower: { x: 70, z: 50 }, // its own island in the south infield
  podium: { x: -18, z: 34, rot: -Math.PI * 0.8 }, // west island, facing the track
  flames: { x: 136, z: 34 },
  oldCity: { x0: -30, x1: 26, z0: 262, z1: 330 },
  keep: { x: 8, z: 292 },
};

// Islands: stretches of the lap (between two points, in lap order) that sit on
// ground; everything else is bridge over open sky.
export const DAWN_ISLANDS = [
  { id: 'pit', name: 'Pit island', from: v(-60, 0, 30), to: v(178, 0, 30), depth: 55 },
  { id: 'east', name: 'Flame island', from: v(176, 0, 50), to: v(130, 2, 80), depth: 40 },
  { id: 'oldcity', name: 'Old city', from: v(-14, 1.6, 226), to: v(40, 5, 336), depth: 50 },
  { id: 'waterfall', name: 'Waterfall island', from: v(60, 4, 316), to: v(160, 0, 244), depth: 42 },
  { id: 'podium', name: 'Podium island', from: v(4, 0, 96), to: v(-50, 0, 42), depth: 34 },
  { id: 'tower', name: 'Watch tower island', from: null, to: null, depth: 40 },
];

export function dawnIslandArcs(track) {
  return DAWN_ISLANDS.map((isl) => {
    if (!isl.from) return { ...isl, arcs: [] };
    const a = track.nearest(isl.from);
    const b = track.nearest(isl.to);
    return { ...isl, arcs: a <= b ? [[a, b]] : [[a, track.length], [0, b]] };
  });
}

// Ground beyond the road margin for the paddock and each landmark, as extra
// island cells. Each patch must touch its island's road strip, or it would be
// cut off as a separate scrap (the island keeps only its outline's main loop).
export function dawnExtras(track, pit, islands) {
  const L = DAWN_LANDMARKS;
  const idx = (id) => islands.findIndex((i) => i.id === id);
  const g = L.grandstand;
  const { ledge } = dawnLedge(track);
  return [
    { ...PIT_ISLAND_RECT, island: idx('pit') },
    ...pitLaneExtras(pit, idx('pit')),
    // Grandstand, north of the straight facing it (rot = pi: it extends north,
    // and its video screen stands off its west end, at +x): reaching south to
    // the straight's own ground so the two join.
    { shape: 'rect', x0: g.x - g.len / 2 - 4, x1: g.x + g.len / 2 + 11, z0: -30, z1: g.z + 18, island: idx('pit') },
    // Turn 1 grandstand: a disc under its footprint (it extends back, away from the road).
    { shape: 'circle', x: L.grandstand2.x - Math.sin(L.grandstand2.rot) * 6, z: L.grandstand2.z - Math.cos(L.grandstand2.rot) * 6, r: 24, island: idx('pit') },
    { shape: 'circle', x: L.tower.x, z: L.tower.z, r: 15, island: idx('tower') },
    { shape: 'circle', x: L.flames.x, z: L.flames.z, r: 25, island: idx('east') },
    { shape: 'rect', ...L.oldCity, island: idx('oldcity') },
    { shape: 'circle', x: ledge.x, z: ledge.z, r: 14, island: idx('waterfall') },
    { shape: 'circle', x: L.podium.x + Math.sin(L.podium.rot) * 5, z: L.podium.z + Math.cos(L.podium.rot) * 5, r: 19, island: idx('podium') },
  ];
}

// The waterfall ledge: beside the descent, away from the old-city infield.
export function dawnLedge(track) {
  const wf = track.at(track.nearest(v(78, 3, 306)));
  const len = Math.hypot(wf.tan.x, wf.tan.z);
  const out = v(-wf.tan.z / len, 0, wf.tan.x / len);
  return { ledge: wf.pos.clone().setY(0).addScaledVector(out, DAWN_WIDTH / 2 + 1.5 + 13), out };
}

export const DAWN_ISLAND_OPTS = { area: [-130, -100, 340, 490], margin: 13, clear: 5 };
