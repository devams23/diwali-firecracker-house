import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { pickBurstStyle, pickNeighbourPalette, pickLanePoint, NEIGHBOUR_PALETTES } from '../src/fx/neighbourShow';

describe('pickBurstStyle', () => {
  it('never repeats the previous style', () => {
    for (let i = 0; i < 200; i++) expect(pickBurstStyle(Math.random, 'peony')).not.toBe('peony');
  });
  it('can reach the first and last styles at the extremes of the random range', () => {
    expect(pickBurstStyle(() => 0)).toBe('peony');
    expect(pickBurstStyle(() => 0.999999)).toBe('crackle');
  });
});

describe('pickNeighbourPalette', () => {
  it('avoids the last palette and always returns a known mix', () => {
    const last = NEIGHBOUR_PALETTES[0];
    for (let i = 0; i < 100; i++) {
      const p = pickNeighbourPalette(Math.random, last);
      expect(p).not.toBe(last);
      expect(NEIGHBOUR_PALETTES).toContain(p);
    }
  });
});

describe('pickLanePoint', () => {
  it('lands just outside a lane, near the ground', () => {
    const v = new THREE.Vector3();
    for (let i = 0; i < 100; i++) {
      pickLanePoint(Math.random, v);
      expect(v.y).toBeLessThan(0.5);
      expect(Math.max(Math.abs(v.x), Math.abs(v.z))).toBeGreaterThan(18);
    }
  });
});
