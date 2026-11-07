// Tests for the pure villager rules: the cheer envelope (arms and hop over the cheer), the kids' pause near the
// player, and the cheer range measured on the ground.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { FxContext } from '../src/fx/FxContext';
import { CHEER_SECONDS, Villager, cheerArms, cheerHop, kidMoves } from '../src/people/Villager';
import { inCheerRange, CHEER_RANGE } from '../src/people/villagers';

/** Top of the charpai weave, in metres (props.ts rail at 0.44 plus 0.026). */
const WEAVE_TOP = 0.466;

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

describe('placement and seating', () => {
  // A no-op stand-in for the spark system: these checks only read geometry and never emit sparks.
  const fx = { sparks: { emit: () => {} } } as unknown as FxContext;

  it('keeps the cross-legged elder above the charpai weave, including while cheering', () => {
    const elder = new Villager({ height: 1.6, clothes: 0xe9e2d0, pose: 'sit' }, fx);
    elder.place(-6, 0, 2, Math.PI / 2);
    elder.cheer();
    elder.update(0.3, 1.0);
    elder.object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(elder.object);
    expect(box.min.y).toBeGreaterThanOrEqual(WEAVE_TOP - 1e-9);
  });

  it('keeps the seated elder inside the charpai footprint (x -6.95..-5.05, z 1.5..2.5)', () => {
    const elder = new Villager({ height: 1.6, clothes: 0xe9e2d0, pose: 'sit' }, fx);
    elder.place(-6, 0, 2, Math.PI / 2);
    elder.object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(elder.object);
    expect(box.min.x).toBeGreaterThanOrEqual(-6.95);
    expect(box.max.x).toBeLessThanOrEqual(-5.05);
    expect(box.min.z).toBeGreaterThanOrEqual(1.5);
    expect(box.max.z).toBeLessThanOrEqual(2.5);
  });

  it('keeps the woman off the rangoli and clear of the front wall', () => {
    const woman = new Villager({ height: 1.6, clothes: 0x6b1f2a, dupatta: 0x7d2c3a, pose: 'stand' }, fx);
    woman.place(-1.1, 0.3, -8.1, 0);
    woman.object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(woman.object);
    // The rangoli spans x -0.8..0.8 and z -8.6..-7.0, and the front wall face is at z -8.6.
    const overRangoli = box.max.x > -0.8 && box.min.x < 0.8 && box.max.z > -8.6 && box.min.z < -7.0;
    expect(overRangoli).toBe(false);
    expect(box.min.z).toBeGreaterThan(-8.6);
  });
});
