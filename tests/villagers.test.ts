// Tests for the pure villager rules: the cheer envelope (arms and hop over the cheer), the kids' pause near the
// player, and the cheer range measured on the ground.
import { describe, it, expect } from 'vitest';
import { CHEER_SECONDS, cheerArms, cheerHop, kidMoves } from '../src/people/Villager';
import { inCheerRange, CHEER_RANGE } from '../src/people/villagers';

describe('cheer envelope', () => {
  it('lasts 0.6 s', () => {
    expect(CHEER_SECONDS).toBe(0.6);
  });

  it('starts and ends with the arms down and no hop', () => {
    expect(cheerArms(0)).toBeCloseTo(0, 10);
    expect(cheerArms(1)).toBeCloseTo(0, 10);
    expect(cheerHop(0)).toBeCloseTo(0, 10);
    expect(cheerHop(1)).toBeCloseTo(0, 10);
  });

  it('peaks with the arms fully up and a 0.15 m hop at the middle of the cheer', () => {
    expect(cheerArms(0.5)).toBeCloseTo(1, 10);
    expect(cheerHop(0.5)).toBeCloseTo(0.15, 10);
  });

  it('keeps the arms and hop within their ranges across the whole cheer', () => {
    for (let i = 0; i <= 60; i++) {
      const s = i / 60;
      expect(cheerArms(s)).toBeGreaterThanOrEqual(0);
      expect(cheerArms(s)).toBeLessThanOrEqual(1);
      expect(cheerHop(s)).toBeGreaterThanOrEqual(0);
      expect(cheerHop(s)).toBeLessThanOrEqual(0.15 + 1e-12);
    }
  });

  it('clamps progress outside 0 to 1, so an idle villager is at rest', () => {
    expect(cheerArms(-0.3)).toBeCloseTo(0, 10);
    expect(cheerArms(1.4)).toBeCloseTo(0, 10);
    expect(cheerHop(-1)).toBeCloseTo(0, 10);
  });
});

describe('kid pause near the player', () => {
  it('keeps walking while the player is 1 m or more away', () => {
    expect(kidMoves(1)).toBe(true);
    expect(kidMoves(4)).toBe(true);
  });

  it('stops walking when the player is closer than 1 m', () => {
    expect(kidMoves(0.99)).toBe(false);
    expect(kidMoves(0)).toBe(false);
  });

  it('keeps walking when the player is unknown (infinitely far)', () => {
    expect(kidMoves(Infinity)).toBe(true);
  });
});

describe('cheer range', () => {
  it('is 15 m on the ground', () => {
    expect(CHEER_RANGE).toBe(15);
  });

  it('includes a villager just inside 15 m and excludes one just outside', () => {
    expect(inCheerRange(14.9, 0, 0, 0)).toBe(true);
    expect(inCheerRange(15.1, 0, 0, 0)).toBe(false);
  });

  it('measures diagonally across the ground', () => {
    // 9 m and 12 m apart make a 15 m hypotenuse.
    expect(inCheerRange(9, 12, 0, 0)).toBe(true);
    expect(inCheerRange(9.5, 12.5, 0, 0)).toBe(false);
  });
});
