// Tests for the 2D circle-vs-box collision used to keep the player out of walls and props.
import { describe, it, expect } from 'vitest';
import { CollisionWorld } from '../src/core/Collision';

describe('CollisionWorld.resolve', () => {
  it('pushes a circle overlapping a box out along the shortest axis', () => {
    const world = new CollisionWorld();
    world.addBox({ minX: -1, minZ: -1, maxX: 1, maxZ: 1 });
    const p = world.resolve(1.1, 0, 0.3);
    expect(p.x).toBeCloseTo(1.3, 3);
    expect(p.z).toBeCloseTo(0, 6);
  });

  it('leaves a circle unchanged when no box is near it', () => {
    const world = new CollisionWorld();
    world.addBox({ minX: -1, minZ: -1, maxX: 1, maxZ: 1 });
    const p = world.resolve(5, 4, 0.3);
    expect(p).toEqual({ x: 5, z: 4 });
  });

  it('ends outside both boxes when overlapping two adjacent boxes', () => {
    const world = new CollisionWorld();
    world.addBox({ minX: -2, minZ: -1, maxX: 0, maxZ: 1 });
    world.addBox({ minX: 0, minZ: -1, maxX: 2, maxZ: 1 });
    const r = 0.3;
    const p = world.resolve(-0.1, 0, r);
    // Distance from the centre to each box's nearest point must be at least the radius.
    for (const b of world.boxes) {
      const cx = Math.min(Math.max(p.x, b.minX), b.maxX);
      const cz = Math.min(Math.max(p.z, b.minZ), b.maxZ);
      expect(Math.hypot(p.x - cx, p.z - cz)).toBeGreaterThanOrEqual(r - 1e-9);
    }
  });

  it('stores a circle as a square box that then blocks movement', () => {
    const world = new CollisionWorld();
    world.addCircle(0, 0, 1);
    expect(world.boxes).toEqual([{ minX: -1, minZ: -1, maxX: 1, maxZ: 1 }]);
  });
});
