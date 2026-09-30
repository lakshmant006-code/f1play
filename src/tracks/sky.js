// Track 1, the Sky Circuit: its venue (four islands, road, bridges, boards,
// grandstand, watch tower, podium, clouds and a midday sky). The paddock (pit
// building, garages, pit wall and crews) is shared and built by the game.

import * as THREE from 'three';
import { buildTrackMeshes, buildClouds, buildSky } from '../world/world.js';
import { buildRaisedPodium } from '../world/podium.js';
import { buildIslandShapes, buildIslands, buildBridges, buildGrandstandHD, buildWatchTower, buildStartGantry, buildTrackBoards, SKY_LANDMARKS } from '../world/circuit.js';
import { buildTrack, buildPitLane, pitLaneExtras, PIT_ISLAND_RECT, TRACK_WIDTH } from '../game/layout.js';

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
