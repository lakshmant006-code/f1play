import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildDawnTrack, dawnFeatures, dawnWidth, GAP, CASTLE_WIDTH, DAWN_WIDTH } from '../src/tracks/dawnLayout.js';

const track = buildDawnTrack();
const f = dawnFeatures(track);

describe('Caspian Dawn layout', () => {
  it('is a closed lap of about 1.6 km', () => {
    expect(track.closed).toBe(true);
    expect(track.length).toBeGreaterThan(1400);
    expect(track.length).toBeLessThan(1900);
  });

  it('passes under itself with room for a car', () => {
    // Samples near the crossing in the sky channel: the two levels.
    const ys = [];
    for (let i = 0; i < track.n; i++) {
      const p = track.pos[i];
      if (Math.hypot(p.x, p.z) < 2) ys.push(p.y);
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
        if (Math.hypot(a.x, a.z) < 40 && Math.hypot(b.x, b.z) < 40) continue;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(24);
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
    expect(minR).toBeGreaterThan(12);
  });

  it('crosses between the islands only on the two bridges', () => {
    let crossings = 0;
    for (let i = 0; i < track.n; i++) {
      const a = track.pos[i].x;
      const b = track.pos[(i + 1) % track.n].x;
      if (Math.sign(a) !== Math.sign(b)) crossings++;
    }
    expect(crossings).toBe(2);
    expect(GAP).toBeGreaterThan(20);
  });

  it('puts the DRS zone on the long straight and narrows the castle section', () => {
    const [[a, b]] = f.drs;
    const zone = (b - a + track.length) % track.length;
    expect(zone).toBeGreaterThan(160);
    const mid = track.at((a + zone / 2) % track.length);
    expect(Math.abs(mid.curv)).toBeLessThan(0.005);
    const width = dawnWidth(f);
    expect(width((f.castle[0] + f.castle[1]) / 2)).toBeCloseTo(CASTLE_WIDTH, 5);
    expect(width(f.drs[0][0])).toBeCloseTo(DAWN_WIDTH, 5);
    expect(f.waterfall).toBeGreaterThan(f.horseshoe[1]);
  });

  it('finds the nearest point on its own level where the lap crosses', () => {
    const upper = track.nearest(new THREE.Vector3(0, 9, 0));
    const lower = track.nearest(new THREE.Vector3(0, 0, 0));
    expect(track.at(upper).pos.y).toBeGreaterThan(8);
    expect(track.at(lower).pos.y).toBeLessThan(1);
    // A local search from just before the crossing stays on the lower road.
    expect(track.at(track.nearestNear(new THREE.Vector3(0, 0, 0), lower - 10)).pos.y).toBeLessThan(1);
  });
});
