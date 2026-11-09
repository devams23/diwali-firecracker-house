// Where crackers may sit on the ground and where a cracker set down in front of the player lands.
// Pure geometry on the ground plane (x and z). By default the area is the old takht floor (used by unit tests); the
// game widens it to the whole village with setPlacementArea, and passes the collision solver so a cracker set down
// against a house, wall or the kund is nudged out onto open ground instead of landing inside it.
import * as THREE from 'three';

/** Rectangle of the ground a cracker's centre may occupy, in metres. */
export interface PlacementArea {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Pushes a circle at (x, z) of `radius` out of solid footprints; the game passes CollisionWorld.resolve. */
export type SolidResolver = (x: number, z: number, radius: number) => { x: number; z: number };

/** Clearance (m) kept between a cracker's centre and any wall or house face. */
const CRACKER_CLEARANCE = 0.3;
/** Margin (m) kept inside the area's edge, so crackers never sit on the invisible fence. */
const EDGE_MARGIN = 0.5;

/** Current placement area; starts as the old takht floor until the game widens it. */
let area: PlacementArea = { minX: -8.6, maxX: 8.6, minZ: -6.6, maxZ: 6.6 };
/** Current solid resolver, or null when nothing blocks placement (unit tests). */
let solids: SolidResolver | null = null;

/** Sets where crackers may be placed: the walkable village bounds and the solver that keeps them out of buildings. */
export function setPlacementArea(bounds: PlacementArea, resolve: SolidResolver | null, margin = EDGE_MARGIN): void {
  area = { minX: bounds.minX + margin, maxX: bounds.maxX - margin, minZ: bounds.minZ + margin, maxZ: bounds.maxZ - margin };
  solids = resolve;
}

/** Distance ahead of the player at which a cracker is set down, in metres. */
const REACH = 1.2;
/** Nearest ground hit, along the aim ray, that a cracker may be placed at, in metres. */
export const AIM_MIN = 1;
/** Furthest ground hit, along the aim ray, that a cracker may be placed at, in metres. */
export const AIM_MAX = 3.5;

/** Clamps a ground position into the placement area and, when a solver is set, out of every solid footprint. */
export function clampPlacement(x: number, z: number): { x: number; z: number } {
  const inArea = (px: number, pz: number): { x: number; z: number } => ({
    x: Math.min(area.maxX, Math.max(area.minX, px)),
    z: Math.min(area.maxZ, Math.max(area.minZ, pz)),
  });
  const c = inArea(x, z);
  // Nudge out of houses and walls, then re-clamp in case the nudge crossed the edge.
  if (!solids) return c;
  const free = solids(c.x, c.z, CRACKER_CLEARANCE);
  return inArea(free.x, free.z);
}

/**
 * Where the aim ray meets the floor, if that hit lies between AIM_MIN and AIM_MAX metres from the eye. The ray is
 * `look` (a unit view direction). Returns null when the ray does not point down or the hit is out of that band.
 */
export function aimedGroundSpot(eye: THREE.Vector3, look: THREE.Vector3): THREE.Vector3 | null {
  if (look.y >= -1e-4) return null;
  // Distance along the ray to the floor plane y = 0.
  const t = eye.y / -look.y;
  if (t < AIM_MIN || t > AIM_MAX) return null;
  const c = clampPlacement(eye.x + look.x * t, eye.z + look.z * t);
  return new THREE.Vector3(c.x, 0, c.z);
}

/**
 * The spot a cracker is set down at: the aimed ground hit when the crosshair lands on the floor within range,
 * otherwise `placementPoint` (1.2 m straight ahead).
 */
export function placementFor(eye: THREE.Vector3, look: THREE.Vector3, forward: THREE.Vector3): THREE.Vector3 {
  return aimedGroundSpot(eye, look) ?? placementPoint(eye, forward);
}

/**
 * Ground point `reach` metres ahead of the eye along the horizontal part of the view direction (1.2 m by default),
 * clamped to the floor. A view straight up or down has no horizontal direction, so the point stays directly below
 * the eye.
 */
export function placementPoint(eye: THREE.Vector3, forward: THREE.Vector3, reach = REACH): THREE.Vector3 {
  // Only the horizontal heading matters: looking down at the floor must not push the point off the spot.
  const fx = forward.x;
  const fz = forward.z;
  const len = Math.hypot(fx, fz);
  let x = eye.x;
  let z = eye.z;
  if (len > 1e-6) {
    x += (fx / len) * reach;
    z += (fz / len) * reach;
  }
  const c = clampPlacement(x, z);
  return new THREE.Vector3(c.x, 0, c.z);
}
