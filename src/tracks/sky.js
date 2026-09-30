// Track 1, the Sky Circuit: its venue (four islands, road, bridges, boards,
// grandstand, watch tower, podium, clouds and a midday sky). The paddock (pit
// building, garages, pit wall and crews) is shared and built by the game.

import * as THREE from 'three';
import { buildTrackMeshes, buildClouds, buildSky } from '../world/world.js';
import { buildRaisedPodium } from '../world/podium.js';
import { buildIslandShapes, buildIslands, buildBridges, buildGrandstandHD, buildWatchTower, buildStartGantry, buildTrackBoards, SKY_LANDMARKS } from '../world/circuit.js';
import { buildTrack, buildPitLane, pitLaneExtras, PIT_ISLAND_RECT, TRACK_WIDTH, PIT_WIDTH } from '../game/layout.js';
import { buildPalms } from '../world/flora.js';

// Midday light: a warm key from the south east, a blue sky fill.
export const MIDDAY = {
  sun: '#FFE6C2',
  sunI: 2.6,
  sky: '#F3EEE3',
  ground: '#6B7A45',
  hemiI: 1.05,
  fog: '#8CCAF3',
  near: 300,
  far: 780,
  env: 0.55,
  envRot: 0,
  sat: 1.02,
  shadow: { center: [0, 0, -5], offset: [110, 140, 95], r: 140, far: 420 },
};

export function buildSkyCircuit() {
  const track = buildTrack();
  const pit = buildPitLane(track);
  const L = SKY_LANDMARKS;
  const extras = [
    { ...PIT_ISLAND_RECT, island: 0 },
    ...pitLaneExtras(pit, 0),
    { shape: 'rect', x0: L.grandstand.x - L.grandstand.len / 2 - 9, x1: L.grandstand.x + L.grandstand.len / 2 + 9, z0: L.grandstand.z - 15, z1: L.grandstand.z + 5, island: 1 },
    { shape: 'circle', x: L.tower.x, z: L.tower.z, r: 13, island: 2 },
    { shape: 'rect', x0: L.podium.x - 14, x1: -67, z0: L.podium.z - 15, z1: L.podium.z + 15, island: 3 },
  ];
  const { outlines, onIsland } = buildIslandShapes(track, pit, extras);
  const venue = new THREE.Group();
  venue.name = 'venue-sky';
  const islands = buildIslands(outlines);
  venue.add(islands);
  venue.add(buildTrackMeshes(track, pit, onIsland));
  venue.add(buildBridges(track, onIsland));
  venue.add(buildStartGantry(-10, -35));
  venue.add(buildTrackBoards(track, [[20, 110, 1], [190, 225, -1], [270, 305, 1], [345, 380, -1]], onIsland));

  const grandstand = buildGrandstandHD({ len: L.grandstand.len });
  grandstand.position.set(L.grandstand.x, 0, L.grandstand.z);
  grandstand.rotation.y = L.grandstand.rot;
  const tower = buildWatchTower();
  tower.position.set(L.tower.x, 0, L.tower.z);
  tower.rotation.y = Math.PI * 0.85; // timing board faces the pit straight side
  const podium = buildRaisedPodium();
  podium.position.set(L.podium.x, 0, L.podium.z);
  podium.rotation.y = L.podium.rot;
  const clouds = buildClouds();
  venue.add(grandstand, tower, podium, clouds, buildSky());
  venue.add(buildPalms(skyPalmSpots(track, pit, onIsland)));

  return {
    id: 'sky',
    name: 'Sky Circuit',
    track,
    pit,
    onIsland,
    venue,
    islands,
    grandstand,
    tower,
    podium,
    clouds,
    landmarks: L,
    light: MIDDAY,
    home: { target: new THREE.Vector3(2, 0, -8), distance: 300, azimuth: THREE.MathUtils.degToRad(20), elevation: THREE.MathUtils.degToRad(40) },
    maxDistance: 330,
    bestKey: 'skycircuit.bestLap',
    pitWall: true,
    bumps: true,
    width: () => TRACK_WIDTH,
    // Walls: wide run-off on the islands, tight barriers on the bridges.
    limit: (s, x, z) => (onIsland(x, z) ? TRACK_WIDTH / 2 + 4.8 : TRACK_WIDTH / 2 + 1.5),
  };
}

// Palms along the run-off on the islands: clear of the road, the pit lane,
// the paddock and the landmarks.
function skyPalmSpots(track, pit, onIsland) {
  const L = SKY_LANDMARKS;
  const spots = [];
  const smp = {};
  let seed = 23;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const clear = (x, z, d) => {
    for (let i = 0; i < track.n; i += 2) if (Math.hypot(track.pos[i].x - x, track.pos[i].z - z) < d) return false;
    return true;
  };
  for (let s = 0; s < track.length; s += 15) {
    track.at(s, smp);
    const n = new THREE.Vector3(smp.tan.z, 0, -smp.tan.x).normalize();
    for (const side of [1, -1]) {
      const off = TRACK_WIDTH / 2 + 8 + r() * 2;
      const x = smp.pos.x + n.x * side * off;
      const z = smp.pos.z + n.z * side * off;
      if (!onIsland(x, z) || !clear(x, z, TRACK_WIDTH / 2 + 7)) continue;
      if (pit.at(pit.nearest(new THREE.Vector3(x, 0, z))).pos.distanceTo(new THREE.Vector3(x, 0, z)) < PIT_WIDTH / 2 + 6) continue;
      if (x > -50 && x < 50 && z < -38) continue; // the paddock
      if (Math.abs(x - L.grandstand.x) < L.grandstand.len / 2 + 6 && Math.abs(z - L.grandstand.z) < 16) continue;
      if (Math.hypot(x - L.tower.x, z - L.tower.z) < 12 || Math.hypot(x - L.podium.x, z - L.podium.z) < 20) continue;
      if (spots.some((p) => Math.hypot(p.x - x, p.z - z) < 9)) continue;
      spots.push({ x, z, yaw: r() * 6.28, scale: 0.8 + r() * 0.3 });
    }
  }
  return spots;
}
