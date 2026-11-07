// Tests for the thaali's dish height and cracker footprint maths, which decide how high a cracker rests on the plate.
import { describe, expect, it } from 'vitest';
import { dishHeight, footprintRadius } from '../src/items/Thaali';

describe('dishHeight', () => {
  it('is the flat centre height at the middle of the plate', () => {
    expect(dishHeight(0)).toBeCloseTo(0.0095, 6);
  });

  it('rises toward the rim top at radius 0.2', () => {
    expect(dishHeight(0.2)).toBeCloseTo(0.026, 6);
  });

  it('never decreases with radius inside the plate', () => {
    let prev = dishHeight(0);
    for (let r = 0.01; r <= 0.2; r += 0.01) {
      const h = dishHeight(r);
      expect(h).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = h;
    }
  });
});

describe('footprintRadius', () => {
  it('adds the radial half-size to the ring radius and takes the tangent half-size on its own', () => {
    // Ring 0.12, item 0.03 radial and 0.04 tangent half-sizes: corner at hypot(0.15, 0.04).
    expect(footprintRadius(0.12, 0.04, 0.03)).toBeCloseTo(Math.hypot(0.15, 0.04), 9);
  });

  it('grows with the item length, so long crackers rest higher on the rim', () => {
    expect(footprintRadius(0.12, 0.01, 0.078)).toBeGreaterThan(footprintRadius(0.12, 0.01, 0.02));
  });
});
