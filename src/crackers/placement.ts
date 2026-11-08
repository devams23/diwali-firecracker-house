// Where crackers may sit on the takht floor and where a cracker set down in front of the player lands.
// Pure geometry on the ground plane (x and z); the floor bounds match the courtyard the village is built on.
import * as THREE from 'three';

/** Lowest allowed x for a cracker's centre, in metres. */
const MIN_X = -8.6;
/** Highest allowed x for a cracker's centre, in metres. */
const MAX_X = 8.6;
/** Lowest allowed z for a cracker's centre, in metres. */
const MIN_Z = -6.6;
/** Highest allowed z for a cracker's centre, in metres. */
const MAX_Z = 6.6;
/** Distance ahead of the player at which a cracker is set down, in metres. */
const REACH = 1.2;
/** Nearest ground hit, along the aim ray, that a cracker may be placed at, in metres. */
export const AIM_MIN = 1;
/** Furthest ground hit, along the aim ray, that a cracker may be placed at, in metres. */
export const AIM_MAX = 3.5;

/** Clamps a ground position into the takht floor so crackers never leave the courtyard. */
export function clampPlacement(x: number, z: number): { x: number; z: number } {
  return {
    x: Math.min(MAX_X, Math.max(MIN_X, x)),
    z: Math.min(MAX_Z, Math.max(MIN_Z, z)),
  };
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
