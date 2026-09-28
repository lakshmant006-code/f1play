import { describe, it, expect } from 'vitest';
import { PitStopRun, shuffledOrder, grade } from '../src/game/pitstopRules.js';
import { PIT, CORNERS } from '../src/data.js';

describe('PitStopRun', () => {
  it('releases after the last corner, the jack drop and the release delay', () => {
    const run = new PitStopRun(['FL', 'FR', 'RL', 'RR']);
    [0.1, 0.2, 0.3, 0.4].forEach((t, i) => expect(run.tap(run.order[i], t)).toBe('ok'));
    expect(run.cornersDone).toBeCloseTo(0.4 + PIT.cornerDuration);
    expect(run.releaseTime).toBeCloseTo(0.4 + PIT.cornerDuration + PIT.jackDrop + PIT.releaseDelay);
  });

  it('ignores taps before the car stops', () => {
    const run = new PitStopRun();
    expect(run.tap('FL', -0.1)).toBe('early');
    expect(run.next).toBe(0);
  });

  it('locks the player out for the fumble penalty after a wrong corner', () => {
    const run = new PitStopRun(['FL', 'FR', 'RL', 'RR']);
    expect(run.tap('RR', 0.1)).toBe('wrong');
    expect(run.fumbles).toBe(1);
    expect(run.tap('FL', 0.1 + PIT.wrongTapPenalty - 0.01)).toBe('locked');
    expect(run.tap('FL', 0.1 + PIT.wrongTapPenalty)).toBe('ok');
  });

  it('has no release time until every corner is tapped', () => {
    const run = new PitStopRun(['FL', 'FR', 'RL', 'RR']);
    run.tap('FL', 0.1);
    run.tap('FR', 0.2);
    expect(run.releaseTime).toBeNull();
    run.tap('RL', 0.3);
    run.tap('RR', 0.4);
    expect(run.tap('RR', 0.5)).toBe('done');
  });

  it('lifts the car 0.12 m by the lift beat and drops it after the corners', () => {
    const run = new PitStopRun(['FL', 'FR', 'RL', 'RR']);
    expect(run.jackHeight(0)).toBe(0);
    expect(run.jackHeight(PIT.jackLift)).toBeCloseTo(PIT.liftHeight);
    CORNERS.forEach((c, i) => run.tap(c, 0.1 * i));
    const done = run.cornersDone;
    expect(run.jackHeight(done - 0.01)).toBeCloseTo(PIT.liftHeight);
    expect(run.jackHeight(done + PIT.jackDrop)).toBeCloseTo(0);
  });

  it('pulls the wheel out and swaps the tire midway through a corner', () => {
    const run = new PitStopRun(['FL', 'FR', 'RL', 'RR']);
    run.tap('FL', 0);
    const d = PIT.cornerDuration;
    expect(run.corner('FL', 0.05 * d).phase).toBe('gun_off');
    expect(run.corner('FL', 0.42 * d - 1e-6).out).toBeCloseTo(1, 2);
    expect(run.corner('FL', 0.3 * d).swapped).toBe(false);
    expect(run.corner('FL', 0.5 * d).swapped).toBe(true);
    expect(run.corner('FL', d).phase).toBe('hand_up');
    expect(run.corner('FR', 0.5).phase).toBe('ready');
  });

  it('can beat the 2.4 s target with quick, correct taps', () => {
    const run = new PitStopRun(['FL', 'FR', 'RL', 'RR']);
    [0.15, 0.3, 0.45, 0.6].forEach((t, i) => run.tap(run.order[i], t));
    expect(run.releaseTime).toBeLessThan(PIT.target);
    expect(grade(run.releaseTime).holo).toBe(true);
  });
});

describe('shuffledOrder', () => {
  it('always returns each corner exactly once', () => {
    for (let i = 0; i < 20; i++) expect([...shuffledOrder()].sort()).toEqual([...CORNERS].sort());
  });
});

describe('grade', () => {
  it('only gives the holo finish under the target', () => {
    expect(grade(2.39).holo).toBe(true);
    expect(grade(2.4).holo).toBe(false);
    expect(grade(3.5).label).toBe('Slow stop');
  });
});
