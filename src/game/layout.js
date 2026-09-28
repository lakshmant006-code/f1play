// Where everything sits on the main island. Units are meters, +Y up.
// The main straight runs along -Z toward +X; the pit lane and garages sit south
// of it, the grandstand in the infield to the north.

import * as THREE from 'three';
import { Path } from './path.js';
import { TEAMS } from '../data.js';

const v = (x, z) => new THREE.Vector3(x, 0, z);

export const TRACK_WIDTH = 12;
export const PIT_WIDTH = 8;
export const PIT_Z = -54;
export const GARAGE_FRONT_Z = -59.5;
// Pit wall barrier on the track side, and the team pit wall decks between it
// and the pit lane (four stands side by side, facing the track).
export const PIT_WALL_Z = -42.6;
export const DECK_Z = -45.6;
export const DECK_W = 9.6;
export const DECK_D = 3.2;
export const DECK_H = 0.35;
export const DECK_X = [-16.2, -5.4, 5.4, 16.2];
export const GARAGE_DEPTH = 9;

export const TRACK_POINTS = [
  v(-60, -35), v(0, -35), v(60, -35), v(82, -28), v(90, -10), v(82, 10),
  v(58, 18), v(38, 8), v(18, 18), v(10, 38), v(-14, 46), v(-44, 40),
  v(-62, 24), v(-58, 6), v(-74, -8), v(-80, -24), v(-72, -34),
];

// Garage slots along the pit building, one per team, west to east.
export const GARAGE_X = [-26, -13, 0, 13, 26];
export const garageX = (teamId) => GARAGE_X[TEAMS.findIndex((t) => t.id === teamId)];

export function buildTrack() {
  return new Path(TRACK_POINTS, { closed: true });
}

// Pit lane path from the last corner, along the garages, back onto the straight.
export function buildPitLane(track) {
  const sIn = track.nearest(v(-76, -30));
  const sOut = track.nearest(v(66, -34));
  const a = track.at(sIn);
  const b = track.at(sOut);
  const points = [
    a.pos.clone(),
    a.pos.clone().addScaledVector(a.tan, 8).add(v(0, -3)),
    v(-52, PIT_Z + 1),
    v(-40, PIT_Z),
    v(0, PIT_Z),
    v(40, PIT_Z),
    v(54, PIT_Z + 1),
    b.pos.clone().addScaledVector(b.tan, -8).add(v(0, -3)),
    b.pos.clone(),
  ];
  const pit = new Path(points, { vMax: 14, aAcc: 8, aBrake: 12 });
  pit.sIn = sIn;
  pit.sOut = sOut;
  return pit;
}
