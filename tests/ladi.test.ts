import { describe, it, expect } from 'vitest';
import { buildPopTimes, popsDueBy, LADI_POPS } from '../src/crackers/Ladi';

/** A deterministic unit-random sequence, so the schedule is the same on every run. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('buildPopTimes', () => {
  it('has exactly LADI_POPS pops, starting at the ignition instant', () => {
    const times = buildPopTimes(seeded(1));
    expect(LADI_POPS).toBe(60);
    expect(times).toHaveLength(LADI_POPS);
    expect(times[0]).toBe(0);
  });

  it('keeps pop times in non-decreasing order', () => {
    for (const seed of [1, 7, 42, 999]) {
      const times = buildPopTimes(seeded(seed));
      for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    }
  });

  it('walks at 15 to 25 pops a second on average, with randomised gaps', () => {
    const times = buildPopTimes(seeded(3));
    const span = times[times.length - 1];
    const rate = (times.length - 1) / span;
    expect(rate).toBeGreaterThan(14);
    expect(rate).toBeLessThan(26);
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    expect(new Set(gaps.map((g) => g.toFixed(4))).size).toBeGreaterThan(10);
  });

  it('gives some double pops, which are close together', () => {
    const times = buildPopTimes(seeded(5));
    const close = times.slice(1).filter((t, i) => t - times[i] < 0.025).length;
    expect(close).toBeGreaterThan(0);
  });

  it('is fully determined by the supplied random numbers', () => {
    expect(buildPopTimes(seeded(11))).toEqual(buildPopTimes(seeded(11)));
  });
});

describe('popsDueBy', () => {
  const times = [0, 0.05, 0.1, 0.2];

  it('has no pops before ignition', () => {
    expect(popsDueBy(times, -0.1)).toBe(0);
  });

  it('counts the pops at or before the given time', () => {
    expect(popsDueBy(times, 0)).toBe(1);
    expect(popsDueBy(times, 0.07)).toBe(2);
    expect(popsDueBy(times, 0.1)).toBe(3);
    expect(popsDueBy(times, 100)).toBe(4);
  });
});
