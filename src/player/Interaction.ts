// Crosshair targeting: the aim ray is cast from the screen centre against the objects the player can act on (stall
// boxes, the agarbatti stand, the tulsi diya and lit-able ground crackers). A raycast hit is mapped to the
// interactable that owns it by walking up the object's parents, and the nearest owned hit within reach wins.
// The logic is pure over three.js objects, so it runs under Node.
import type * as THREE from 'three';
import type { PlayerState } from './PlayerState';

/** Something the player can aim at and press the action key on. */
export interface Interactable {
  /** Stable identifier for debugging and tests. */
  id: string;
  /** The scene object the ray hits to aim at this thing; its meshes are also highlighted while aimed at. */
  root: THREE.Object3D;
  /** Crosshair label for the current state, or null when the action is not available now (then it is not aimable). */
  label(s: PlayerState): string | null;
  /** Performs the action. */
  act(): void;
}

/** One raycast hit: the object that was struck and how far along the ray it was, in metres. */
export interface AimHit {
  /** The struck object, which may be a descendant of the target's root. */
  object: THREE.Object3D;
  /** Distance from the ray origin to the hit, in metres. */
  distance: number;
}

/**
 * Walks from `object` up through its parents and returns the first one registered in `owners`, or null when no
 * ancestor (or the object itself) is registered. This maps a struck mesh to the target it belongs to.
 */
export function resolveOwner<T>(object: THREE.Object3D, owners: Pick<Map<THREE.Object3D, T>, 'get'>): T | null {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) {
    const owner = owners.get(o);
    if (owner !== undefined) return owner;
  }
  return null;
}

/**
 * Returns the owner of the nearest hit that belongs to a registered target and lies within `maxDist` metres, or null.
 * Hits that belong to no target are skipped, so a wall or a hand in the way never blocks a target behind it.
 */
export function pickAimed<T>(hits: readonly AimHit[], owners: Pick<Map<THREE.Object3D, T>, 'get'>, maxDist: number): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const hit of hits) {
    if (hit.distance > maxDist || hit.distance >= bestDist) continue;
    const owner = resolveOwner(hit.object, owners);
    if (owner === null) continue;
    best = owner;
    bestDist = hit.distance;
  }
  return best;
}
