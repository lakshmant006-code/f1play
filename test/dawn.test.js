import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildDawnTrack, dawnFeatures, dawnWidth, dawnIslandArcs, CASTLE_WIDTH, DAWN_WIDTH, CROSSING, DAWN_LANDMARKS } from '../src/tracks/dawnLayout.js';
import { buildTrack, buildPitLane, PIT_Z } from '../src/game/layout.js';

const track = buildDawnTrack();
const f = dawnFeatures(track);

describe('Caspian Dawn layout', () => {
  it('is a closed lap of about 1.4 km', () => {
    expect(track.closed).toBe(true);
    expect(track.length).toBeGreaterThan(1200);
    expect(track.length).toBeLessThan(1600);
  });

  it('passes under itself with room for a car', () => {
    const ys = [];
    for (let i = 0; i < track.n; i++) {
      const p = track.pos[i];
      if (Math.hypot(p.x - CROSSING.x, p.z - CROSSING.z) < 2) ys.push(p.y);
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(8);
    expect(Math.min(...ys)).toBeCloseTo(0, 1);
  });

  it('keeps separate stretches apart except at the crossing', () => {
    for (let i = 0; i < track.n; i += 4) {
      for (let j = i + 4; j < track.n; j += 4) {
        const ds = Math.min(j - i, track.n - (j - i)) * 0.5;
        if (ds < 60) continue;
        const a = track.pos[i];
        const b = track.pos[j];
        if (Math.hypot(a.x - CROSSING.x, a.z - CROSSING.z) < 40 && Math.hypot(b.x - CROSSING.x, b.z - CROSSING.z) < 40) continue;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(22);
      }
    }
  });

  it('has drivable grades and corners', () => {
    let maxGrade = 0;
    let minR = Infinity;
    for (let i = 0; i < track.n; i++) {
      maxGrade = Math.max(maxGrade, Math.abs(track.tan[i].y));
      minR = Math.min(minR, 1 / Math.abs(track.curv[i]));
    }
    expect(maxGrade).toBeLessThan(0.12);
    expect(minR).toBeGreaterThan(7); // the last corner, shared with the Sky Circuit
  });

  it('shares the Sky Circuit pit lane, so one paddock serves both', () => {
    const pit = buildPitLane(track);
    const home = buildPitLane(buildTrack());
    expect(Math.abs(pit.length - home.length)).toBeLessThan(1);
    // Along the garages the two pit lanes are the same line.
    for (const x of [-30, 0, 30]) {
      const a = pit.at(pit.nearest(new THREE.Vector3(x, 0, PIT_Z))).pos;
      const b = home.at(home.nearest(new THREE.Vector3(x, 0, PIT_Z))).pos;
      expect(a.distanceTo(b)).toBeLessThan(0.3);
    }
  });

  it('sits on small islands joined by bridges', () => {
    const islands = dawnIslandArcs(track);
    const arcs = islands.flatMap((i) => i.arcs);
    const onGround = arcs.reduce((sum, [a, b]) => sum + (b - a), 0);
    expect(onGround).toBeLessThan(track.length * 0.85); // some of the lap is over open sky
    for (let i = 0; i < arcs.length; i++) for (let j = i + 1; j < arcs.length; j++) {
      const [a0, a1] = arcs[i];
      const [b0, b1] = arcs[j];
      expect(a1 <= b0 || b1 <= a0).toBe(true);
    }
    // The high crossing is over the sky, not on an island.
    const high = track.nearest(CROSSING.clone().setY(9));
    expect(arcs.some(([a, b]) => high >= a && high <= b)).toBe(false);
  });

  it('puts the DRS zone on the pit straight, narrows the castle and keeps landmarks off the road', () => {
    const [[a, b]] = f.drs;
    expect(b - a).toBeGreaterThan(120);
    expect(Math.abs(track.at((a + b) / 2).curv)).toBeLessThan(0.005);
    const width = dawnWidth(f);
    expect(width((f.castle[0] + f.castle[1]) / 2)).toBeCloseTo(CASTLE_WIDTH, 5);
    expect(width(a)).toBeCloseTo(DAWN_WIDTH, 5);
    const clear = (p) => Math.min(...track.pos.map((q) => Math.hypot(q.x - p.x, q.z - p.z)));
    expect(clear(DAWN_LANDMARKS.tower)).toBeGreaterThan(30);
    expect(clear(DAWN_LANDMARKS.podium)).toBeGreaterThan(20);
    expect(clear(DAWN_LANDMARKS.flames)).toBeGreaterThan(25);
  });

  it('finds the nearest point on its own level where the lap crosses', () => {
    const upper = track.nearest(CROSSING.clone().setY(9));
    const lower = track.nearest(CROSSING.clone());
    expect(track.at(upper).pos.y).toBeGreaterThan(8);
    expect(track.at(lower).pos.y).toBeLessThan(1);
    expect(track.at(track.nearestNear(CROSSING.clone(), lower - 10)).pos.y).toBeLessThan(1);
  });
});
