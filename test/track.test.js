import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildTrack, buildPitLane, TRACK_WIDTH, GARAGE_X, PIT_Z } from '../src/game/layout.js';
import { crossed } from '../src/game/driving.js';
import { TEAMS, DRIVERS, COMPOUNDS, HELMET_PATTERNS } from '../src/data.js';

const track = buildTrack();
const pit = buildPitLane(track);

describe('track layout', () => {
  it('is a closed loop of a sensible length', () => {
    expect(track.length).toBeGreaterThan(350);
    expect(track.length).toBeLessThan(600);
    expect(track.pos[0].distanceTo(track.pos[track.n])).toBeLessThan(0.01);
  });

  it('never folds back on itself', () => {
    let min = Infinity;
    for (let i = 0; i < track.n; i += 4) {
      for (let j = i + 80; j < track.n; j += 4) {
        if (track.n - (j - i) < 80) continue;
        min = Math.min(min, track.pos[i].distanceTo(track.pos[j]));
      }
    }
    expect(min).toBeGreaterThan(TRACK_WIDTH * 1.5);
  });

  it('keeps corner speeds above a crawl and below the cap', () => {
    const vMin = Math.min(...track.speed);
    const vMax = Math.max(...track.speed);
    expect(vMin).toBeGreaterThan(7);
    expect(vMax).toBeLessThanOrEqual(34);
  });
});

describe('pit lane', () => {
  it('leaves and rejoins the racing line', () => {
    expect(pit.pos[0].distanceTo(track.at(pit.sIn).pos)).toBeLessThan(0.01);
    expect(pit.pos[pit.n].distanceTo(track.at(pit.sOut).pos)).toBeLessThan(0.01);
  });

  it('passes every garage box on the pit lane center line', () => {
    for (const x of GARAGE_X) {
      const s = pit.nearest(new THREE.Vector3(x, 0, PIT_Z));
      expect(pit.at(s).pos.distanceTo(new THREE.Vector3(x, 0, PIT_Z))).toBeLessThan(0.5);
    }
  });

  it('is speed limited', () => {
    expect(Math.max(...pit.speed)).toBeLessThanOrEqual(14);
  });
});

describe('crossed', () => {
  it('detects a mark crossed in one step', () => {
    expect(crossed(10, 12, 11, 100)).toBe(true);
    expect(crossed(10, 12, 13, 100)).toBe(false);
  });

  it('handles wrapping past the start line', () => {
    expect(crossed(99, 1, 99.5, 100)).toBe(true);
    expect(crossed(99, 1, 0.5, 100)).toBe(true);
    expect(crossed(99, 1, 50, 100)).toBe(false);
  });
});

describe('spec data', () => {
  it('has five teams with two unique car numbers each', () => {
    expect(TEAMS).toHaveLength(5);
    const numbers = TEAMS.flatMap((t) => t.numbers);
    expect(new Set(numbers).size).toBe(10);
    expect(TEAMS.filter((t) => t.launch).map((t) => t.id)).toEqual(['solaris', 'nordlys']);
  });

  it('gives every roster driver a car number from their team and a shared helmet pattern', () => {
    for (const d of DRIVERS) {
      const team = TEAMS.find((t) => t.id === d.team);
      expect(team.numbers).toContain(d.number);
      expect(HELMET_PATTERNS).toContain(d.helmet.pattern);
    }
  });

  it('defines the five tire compounds', () => {
    expect(Object.keys(COMPOUNDS)).toEqual(['soft', 'medium', 'hard', 'intermediate', 'wet']);
  });
});
