// Tests for the cracker stall's footprint: it must keep clear of the walk path from the gate to the door, the tulsi
// chaura, the charpais and the lota, and stay inside the courtyard walls. Pure numbers, so it runs under Node.
import { describe, it, expect } from 'vitest';
import { STALL_CENTRE, WALK_PATH_HALF, stallFootprint } from '../src/world/stallLayout';

/** An axis-aligned floor rectangle in world x and z, in metres. */
interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** The rectangle of a prop centred at (x, z) with the given half-sizes. */
function around(x: number, z: number, halfX: number, halfZ: number): Rect {
  return { minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ };
}

/** True when two rectangles are separated by at least `margin` metres along x or along z. */
function clear(a: Rect, b: Rect, margin: number): boolean {
  return a.maxX + margin <= b.minX || b.maxX + margin <= a.minX || a.maxZ + margin <= b.minZ || b.maxZ + margin <= a.minZ;
}

describe('stall footprint', () => {
  const stall = stallFootprint();

  it('is centred on the stall position', () => {
    expect((stall.minX + stall.maxX) / 2).toBeCloseTo(STALL_CENTRE.x);
    expect((stall.minZ + stall.maxZ) / 2).toBeCloseTo(STALL_CENTRE.z);
  });

  it('stays clear of the walk path from the gate to the door', () => {
    const path: Rect = { minX: -WALK_PATH_HALF, maxX: WALK_PATH_HALF, minZ: -10, maxZ: 10 };
    expect(clear(stall, path, 0.3)).toBe(true);
  });

  it('stays clear of the tulsi chaura', () => {
    expect(clear(stall, around(0, 0, 0.5, 0.5), 0.3)).toBe(true);
  });

  it('stays clear of the charpai on the east side', () => {
    expect(clear(stall, around(4.5, 3.5, 0.95, 0.5), 0.3)).toBe(true);
  });

  it('stays clear of the charpai on the west side', () => {
    expect(clear(stall, around(-6, 2, 0.95, 0.5), 0.3)).toBe(true);
  });

  it('stays clear of the brass lota', () => {
    expect(clear(stall, around(-2.4, 1.6, 0.35, 0.35), 0.3)).toBe(true);
  });

  it('stays inside the courtyard walls with room to walk around it', () => {
    expect(stall.minX).toBeGreaterThan(-9 + 0.5);
    expect(stall.maxX).toBeLessThan(9 - 0.5);
    expect(stall.maxZ).toBeLessThan(7 - 0.5);
  });
});
