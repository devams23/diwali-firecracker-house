// Ground-plane collision for the player: axis-aligned boxes (walls, house, props) that a
// circular player footprint is pushed out of each frame. Circles from props are stored as
// square boxes, which keeps the solver simple and is accurate enough at this scale.

/** Axis-aligned footprint on the ground (x/z plane), in metres. */
export interface Box {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** Small slack added when pushing out so the circle ends strictly outside, not on the edge. */
const EPSILON = 1e-4;
/** Iterations of the push-out pass; two is enough to settle corners between adjacent boxes. */
const ITERATIONS = 2;

/** Static obstacles on the ground plane and the solver that keeps a circle outside them. */
export class CollisionWorld {
  boxes: Box[] = [];

  /** Adds a rectangular obstacle. */
  addBox(b: Box): void {
    this.boxes.push(b);
  }

  /** Adds a round obstacle, approximated by the square that bounds it. */
  addCircle(x: number, z: number, r: number): void {
    this.boxes.push({ minX: x - r, minZ: z - r, maxX: x + r, maxZ: z + r });
  }

  /** Returns the nearest position to (x, z) at which a circle of `radius` clears every box. */
  resolve(x: number, z: number, radius: number): { x: number; z: number } {
    let px = x;
    let pz = z;
    for (let iter = 0; iter < ITERATIONS; iter++) {
      for (const b of this.boxes) {
        // Closest point on the box to the circle centre.
        const cx = Math.min(Math.max(px, b.minX), b.maxX);
        const cz = Math.min(Math.max(pz, b.minZ), b.maxZ);
        const dx = px - cx;
        const dz = pz - cz;
        const distSq = dx * dx + dz * dz;
        if (distSq >= radius * radius) continue;

        if (distSq > 0) {
          // Centre is outside the box: slide along the direction from the nearest point.
          const dist = Math.sqrt(distSq);
          const push = radius - dist + EPSILON;
          px += (dx / dist) * push;
          pz += (dz / dist) * push;
        } else {
          // Centre is inside the box: take the shortest exit that is clear of every other box,
          // so a wall built from adjacent boxes is not exited into the neighbour.
          const exit = this.shortestClearExit(b, px, pz, radius);
          px = exit.x;
          pz = exit.z;
        }
      }
    }
    return { x: px, z: pz };
  }

  /** Exit point for a centre inside `b`: nearest face first, skipping faces that land in another box. */
  private shortestClearExit(
    b: Box,
    x: number,
    z: number,
    radius: number,
  ): { x: number; z: number } {
    const candidates = [
      { x: b.maxX + radius + EPSILON, z, cost: b.maxX - x },
      { x: b.minX - radius - EPSILON, z, cost: x - b.minX },
      { x, z: b.maxZ + radius + EPSILON, cost: b.maxZ - z },
      { x, z: b.minZ - radius - EPSILON, cost: z - b.minZ },
    ].sort((a, c) => a.cost - c.cost);
    for (const c of candidates) {
      if (!this.boxes.some((o) => o !== b && overlapsCircle(o, c.x, c.z, radius))) return c;
    }
    return candidates[0];
  }
}

/** True if a circle centred at (x, z) with `radius` intersects the box (strictly). */
function overlapsCircle(b: Box, x: number, z: number, radius: number): boolean {
  const cx = Math.min(Math.max(x, b.minX), b.maxX);
  const cz = Math.min(Math.max(z, b.minZ), b.maxZ);
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < radius * radius;
}
