// Caspian Dawn: a street circuit inspired by Baku, on two floating islands in a
// dawn sky. The lap is a figure of eight: the high bridge carries the track
// from the east island to the west one, straight over the low bridge that
// brings it back, so the track passes under itself in the channel between them.
//   east island  long boulevard straight (DRS), flame towers, start / finish
//   west island  old city: a narrow climb along the walls, the horseshoe at the
//                top, and a rock arch with a waterfall on the way back down
// Units are meters, +Y up. The road height is part of the path.

import * as THREE from 'three';
import { Path } from '../game/path.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);

export const DAWN_WIDTH = 12;
export const CASTLE_WIDTH = 9; // the old city squeeze
export const GAP = 30; // half width of the sky channel between the islands

// Closed loop, starting on the start / finish line of the boulevard straight.
export const DAWN_POINTS = [
  // East island: the boulevard straight, south.
  v(200, 0, -10), v(200, 0, 60), v(200, 0, 130),
  // Turn 1 and the sweep west.
  v(192, 0, 178), v(165, 0, 200), v(128, 0, 200),
  // Up the ramp to the high bridge, north west.
  v(100, 0.4, 170), v(76, 2.8, 120), v(52, 6.2, 70), v(24, 8.6, 24),
  v(0, 9, 0),
  v(-24, 8.6, -24), v(-52, 6.2, -52), v(-80, 2.6, -82),
  // West island: down onto the old city, then south along the walls, climbing.
  v(-110, 0.4, -110), v(-145, 0, -120), v(-178, 0, -104),
  v(-192, 0.6, -70), v(-186, 1.6, -40), v(-200, 2.6, -12), v(-196, 3.6, 20),
  v(-196, 4.6, 60), v(-196, 5, 100),
  // The horseshoe, at the top of the climb.
  v(-193, 5, 132), v(-180, 5, 152), v(-160, 5, 160), v(-140, 5, 152), v(-127, 5, 132),
  // Back down, through the waterfall arch.
  v(-124, 4.2, 100), v(-124, 1.6, 60), v(-122, 0.2, 28),
  v(-104, 0, 4), v(-76, 0, 2), v(-50, 0, 24),
  // The low bridge, north east under the high one, back to the east island.
  v(-24, 0, 24), v(0, 0, 0), v(24, 0, -24),
  v(52, 0, -52), v(84, 0, -86), v(122, 0, -112), v(164, 0, -114), v(192, 0, -84),
];

export function buildDawnTrack() {
  return new Path(DAWN_POINTS, { closed: true });
}

// Distances along the lap for the named features, found from their positions.
export function dawnFeatures(track) {
  const at = (x, y, z) => track.nearest(v(x, y, z));
  const castle = [at(-192, 0.6, -70), at(-196, 5, 100)];
  const horseshoe = [at(-196, 5, 110), at(-124, 4.6, 110)];
  return {
    castle,
    horseshoe,
    waterfall: at(-124, 3, 82),
    // DRS: detection before the last corner, the zone down the boulevard.
    drsDetect: at(164, 0, -114),
    drs: [[at(200, 0, -40), at(200, 0, 150)]],
    highBridge: [at(52, 6.2, 70), at(-52, 6.2, -52)],
    lowBridge: [at(-50, 0, 24), at(52, 0, -52)],
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
