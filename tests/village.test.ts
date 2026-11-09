// Tests that the player can walk out of the gate but is stopped by village houses, the kund and the outer fence.
import { describe, it, expect } from 'vitest';
import { CollisionWorld } from '../src/core/Collision';
import { GATE_HALF, SOUTH_INNER_Z, WALL_T } from '../src/world/Aangan';
import { addVillageCollision, houseLayout, villageBounds } from '../src/world/Village';

/** Player footprint radius, matching Game.ts. */
const R = 0.3;

/** A world holding only the south wall segments either side of the gate (as in Aangan.ts) plus the village. */
function makeWorld(): CollisionWorld {
  const world = new CollisionWorld();
  const pillarX = GATE_HALF + 0.4;
  const z1 = SOUTH_INNER_Z + WALL_T;
  world.addBox({ minX: -13.35, maxX: -pillarX, minZ: SOUTH_INNER_Z, maxZ: z1 });
  world.addBox({ minX: pillarX, maxX: 13.35, minZ: SOUTH_INNER_Z, maxZ: z1 });
  addVillageCollision(world);
  return world;
}

/** Walks from a start toward an end in small steps, each resolved from the previous position like the game does. */
function walk(world: CollisionWorld, from: [number, number], to: [number, number]): { x: number; z: number } {
  const n = 400;
  let p = { x: from[0], z: from[1] };
  for (let i = 0; i < n; i++) {
    p = world.resolve(p.x + (to[0] - from[0]) / n, p.z + (to[1] - from[1]) / n, R);
  }
  return p;
}

describe('village collision', () => {
  it('lets the player walk through the gate from the courtyard to the lane path', () => {
    const p = walk(makeWorld(), [0, 10], [0, 16]);
    expect(p.x).toBeCloseTo(0, 3);
    expect(p.z).toBeCloseTo(16, 3);
  });

  it('stops the player entering a house footprint', () => {
    const h = houseLayout()[0];
    const p = makeWorld().resolve(h.x, h.z, R);
    // A centre dropped in the middle of the house is pushed out past its nearer half-extent.
    expect(Math.hypot(p.x - h.x, p.z - h.z)).toBeGreaterThan(Math.min(h.w, h.d) / 2);
  });

  it('stops the player walking past the outer fence', () => {
    const b = villageBounds();
    const south = walk(makeWorld(), [19, 0], [19, b.maxZ + 20]);
    expect(south.z).toBeLessThanOrEqual(b.maxZ);
    const east = walk(makeWorld(), [0, 19], [b.maxX + 20, 19]);
    expect(east.x).toBeLessThanOrEqual(b.maxX);
  });
});
