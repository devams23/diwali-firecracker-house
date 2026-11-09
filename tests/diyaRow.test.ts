// Pure layout and animation maths of the diya row: even spacing centred on the courtyard axis, and an eased flame growth.
import { describe, expect, it } from 'vitest';
import { DIYA_COUNT, diyaRowXs, flameGrowth } from '../src/features/DiyaRow';

describe('diyaRowXs', () => {
  it('spaces the lamps evenly and symmetrically about x = 0', () => {
    const xs = diyaRowXs(DIYA_COUNT, 5);
    expect(xs).toHaveLength(12);
    expect(xs[0]).toBeCloseTo(-5);
    expect(xs[11]).toBeCloseTo(5);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(10 / 11);
  });

  it('puts a single lamp at the centre', () => {
    expect(diyaRowXs(1, 5)).toEqual([0]);
  });
});

describe('flameGrowth', () => {
  it('starts at 0, ends at 1 and never decreases', () => {
    expect(flameGrowth(0)).toBe(0);
    expect(flameGrowth(10)).toBe(1);
    expect(flameGrowth(-1)).toBe(0);
    let prev = 0;
    for (let a = 0; a <= 1.2; a += 0.05) {
      const g = flameGrowth(a);
      expect(g).toBeGreaterThanOrEqual(prev);
      prev = g;
    }
  });

  it('is eased out: more than half grown by the midpoint', () => {
    expect(flameGrowth(0.55)).toBeGreaterThan(0.5);
  });
});
