// Tests for cracker placement: the ground clamp that keeps crackers on the takht floor, and the point
// 1.2 m ahead of the player that a thrown or set cracker lands on.
import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { clampPlacement, placementPoint, setPlacementArea } from '../src/crackers/placement';
import { CollisionWorld } from '../src/core/Collision';

describe('clampPlacement', () => {
  it('clamps points outside the floor to its edges', () => {
    expect(clampPlacement(20, -20)).toEqual({ x: 8.6, z: -6.6 });
  });

  it('leaves points inside the floor unchanged', () => {
    expect(clampPlacement(1.5, -2.25)).toEqual({ x: 1.5, z: -2.25 });
  });
});

describe('placementPoint', () => {
  it('places 1.2 m ahead on the ground and clamps to the floor', () => {
    const eye = new THREE.Vector3(0, 1.6, 6);
    const forward = new THREE.Vector3(0, 0, 1);
    const p = placementPoint(eye, forward);
    expect(p.z).toBeCloseTo(6.6, 6);
    expect(p.y).toBe(0);
  });

  it('uses the horizontal part of the view direction', () => {
    const eye = new THREE.Vector3(0, 1.6, 0);
    const forward = new THREE.Vector3(1, -0.8, 0);
    const p = placementPoint(eye, forward);
    expect(p.x).toBeCloseTo(1.2, 6);
    expect(p.z).toBeCloseTo(0, 6);
    expect(p.y).toBe(0);
  });
});

// Village-wide placement: once the game widens the area, street spots stay put and solids push crackers out.
describe('setPlacementArea', () => {
  /** Restores the default takht floor so the other tests are unaffected. */
  afterEach(() => setPlacementArea({ minX: -8.6, maxX: 8.6, minZ: -6.6, maxZ: 6.6 }, null, 0));

  it('keeps a spot out in the lane where it was put', () => {
    setPlacementArea({ minX: -46, maxX: 46, minZ: -44, maxZ: 47 }, null);
    expect(clampPlacement(19, 30)).toEqual({ x: 19, z: 30 });
  });

  it('nudges a spot inside a house out to open ground', () => {
    const world = new CollisionWorld();
    world.addBox({ minX: 20, maxX: 26, minZ: 0, maxZ: 6 });
    setPlacementArea({ minX: -46, maxX: 46, minZ: -44, maxZ: 47 }, (x, z, r) => world.resolve(x, z, r));
    const p = clampPlacement(20.5, 3);
    // Pushed out through the nearest face (west), clear by the cracker clearance.
    expect(p.x).toBeLessThanOrEqual(20 - 0.3 + 1e-6);
    expect(p.z).toBeCloseTo(3, 6);
  });

  it('keeps a spot aimed at the foot of a thin wall on the player side, not behind it', () => {
    const world = new CollisionWorld();
    // Thin wall from x 13.05 to 13.35, like the courtyard's east wall; the player stands west of it.
    world.addBox({ minX: 13.05, maxX: 13.35, minZ: -10, maxZ: 10 });
    setPlacementArea(
      { minX: -46, maxX: 46, minZ: -44, maxZ: 47 },
      (x, z, r) => world.resolve(x, z, r),
      undefined,
      (ax, az, bx, bz) => world.firstHit(ax, az, bx, bz),
    );
    // Aim lands at x 13.3, inside the wall and nearer its far face.
    const p = clampPlacement(13.3, 0, { x: 11, z: 0 });
    expect(p.x).toBeLessThanOrEqual(13.05 - 0.3 + 1e-6);
  });
});

describe('CollisionWorld.firstHit', () => {
  it('reports where a segment first enters a box, and 1 when clear', () => {
    const world = new CollisionWorld();
    world.addBox({ minX: 5, maxX: 6, minZ: -1, maxZ: 1 });
    expect(world.firstHit(0, 0, 10, 0)).toBeCloseTo(0.5, 6);
    expect(world.firstHit(0, 5, 10, 5)).toBe(1);
  });
});
