import { describe, it, expect } from 'vitest';
import { pickRocketStyle, pickFestivePalette, pickApex, ROCKET_STYLES } from '../src/crackers/Rocket';
import { FESTIVE_PALETTES } from '../src/fx/aerialBurst';

describe('pickRocketStyle', () => {
  it('has the five shapes the spec asks for', () => {
    expect(ROCKET_STYLES).toEqual(['peony', 'chrysanthemum', 'ring', 'crossette', 'palm']);
  });

  it('gives each shape an equal slice of the unit range', () => {
    expect(pickRocketStyle(0)).toBe('peony');
    expect(pickRocketStyle(0.25)).toBe('chrysanthemum');
    expect(pickRocketStyle(0.5)).toBe('ring');
    expect(pickRocketStyle(0.75)).toBe('crossette');
    expect(pickRocketStyle(0.999)).toBe('palm');
  });

  it('clamps values outside the unit range', () => {
    expect(pickRocketStyle(1)).toBe('palm');
    expect(pickRocketStyle(-0.5)).toBe('peony');
  });
});

describe('pickFestivePalette', () => {
  it('returns one of the festive pairs, each with two colours', () => {
    for (const u of [0, 0.3, 0.6, 0.99]) {
      const p = pickFestivePalette(u);
      expect(FESTIVE_PALETTES).toContain(p);
      expect(p).toHaveLength(2);
    }
  });
});

describe('pickApex', () => {
  it('keeps the apex within 30 to 38 m', () => {
    expect(pickApex(0)).toBe(30);
    expect(pickApex(1)).toBe(38);
    expect(pickApex(0.5)).toBeCloseTo(34, 10);
  });
});
