// Pure flight maths of the sky lantern: it hangs while the flame catches, climbs to 80 m, drifts on the breeze and shrinks.
import { describe, expect, it } from 'vitest';
import { HOLD_SECONDS, MAX_HEIGHT, bodyScale, lanternDrift, lanternHeight, lanternLife } from '../src/features/SkyLantern';

describe('lanternHeight', () => {
  it('stays in the hand while the flame catches', () => {
    expect(lanternHeight(0)).toBe(0);
    expect(lanternHeight(HOLD_SECONDS)).toBe(0);
  });

  it('then climbs without ever descending, and is capped at 80 m', () => {
    let prev = 0;
    for (let a = HOLD_SECONDS; a < lanternLife() + 5; a += 0.5) {
      const h = lanternHeight(a);
      expect(h).toBeGreaterThanOrEqual(prev);
      expect(h).toBeLessThanOrEqual(MAX_HEIGHT);
      prev = h;
    }
    expect(MAX_HEIGHT).toBe(80);
    expect(prev).toBe(MAX_HEIGHT);
  });

  it('lifts off gently: the first second of climb is under a metre', () => {
    expect(lanternHeight(HOLD_SECONDS + 1)).toBeLessThan(1);
  });
});

describe('lanternDrift', () => {
  it('does not move while held', () => {
    expect(lanternDrift(0, 0.3, 1)).toEqual([0, 0]);
  });

  it('drifts away from the release point along the breeze', () => {
    const [x, z] = lanternDrift(HOLD_SECONDS + 30, 0, 0);
    expect(x).toBeGreaterThan(20);
    expect(Math.abs(z)).toBeLessThan(2);
  });
});

describe('lanternLife and bodyScale', () => {
  it('lasts long enough to reach 80 m and fade, under two minutes', () => {
    expect(lanternLife()).toBeGreaterThan(HOLD_SECONDS + 40);
    expect(lanternLife()).toBeLessThan(120);
  });

  it('shrinks the paper as it climbs', () => {
    expect(bodyScale(0)).toBe(1);
    expect(bodyScale(MAX_HEIGHT)).toBeLessThan(0.4);
    expect(bodyScale(40)).toBeLessThan(bodyScale(10));
  });
});
