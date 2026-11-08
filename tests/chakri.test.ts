import { describe, it, expect } from 'vitest';
import { chakriPhaseColor, spinRate, hopOffset } from '../src/crackers/Chakri';

const GOLD = 0xffc24a;
const EMERALD = 0x2fcf7a;
const ROSE = 0xff4f7a;

describe('chakriPhaseColor', () => {
  it('runs gold, emerald, rose and back to gold over its life', () => {
    expect(chakriPhaseColor(0)).toBe(GOLD);
    expect(chakriPhaseColor(1 / 3)).toBe(EMERALD);
    expect(chakriPhaseColor(2 / 3)).toBe(ROSE);
    expect(chakriPhaseColor(1)).toBe(GOLD);
  });

  it('blends smoothly between the phases', () => {
    const mid = chakriPhaseColor(1 / 6);
    const r = (mid >> 16) & 0xff;
    expect(r).toBeGreaterThan(0x2f);
    expect(r).toBeLessThan(0xff);
  });

  it('clamps the fraction to 0..1', () => {
    expect(chakriPhaseColor(-1)).toBe(GOLD);
    expect(chakriPhaseColor(5)).toBe(GOLD);
  });
});

describe('spinRate', () => {
  it('ramps from rest to the top revolutions per second, then holds it', () => {
    const top = 24 * 2 * Math.PI;
    expect(spinRate(24, 0, 0.5)).toBe(0);
    expect(spinRate(24, 0.25, 0.5)).toBeCloseTo(top / 2, 10);
    expect(spinRate(24, 0.5, 0.5)).toBeCloseTo(top, 10);
    expect(spinRate(24, 3, 0.5)).toBeCloseTo(top, 10);
  });
});

describe('hopOffset', () => {
  it('is zero on the ground and peaks at the hop height halfway', () => {
    expect(hopOffset(0, 0.03)).toBe(0);
    expect(hopOffset(1, 0.03)).toBe(0);
    expect(hopOffset(0.5, 0.03)).toBeCloseTo(0.03, 10);
  });
});
