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

/** Clamps a ground position into the takht floor so crackers never leave the courtyard. */
export function clampPlacement(x: number, z: number): { x: number; z: number } {
  return {
    x: Math.min(MAX_X, Math.max(MIN_X, x)),
    z: Math.min(MAX_Z, Math.max(MIN_Z, z)),
  };
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
