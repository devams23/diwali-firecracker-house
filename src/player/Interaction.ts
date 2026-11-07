// Crosshair targeting: finds which interactable (takht, charpai, diya, fuse...) the player is looking at.
// Chooses by smallest angle to the look ray within range, so near-centre objects win over distant ones.
import type * as THREE from 'three';
import type { PlayerState } from './PlayerState';

/** Something the player can look at and press the action key on. */
export interface Interactable {
  /** Stable identifier for debugging and tests. */
  id: string;
  /** World position of the object's centre. */
  position: THREE.Vector3;
  /** Extra reach added to the range check, so big objects are easier to target. */
  radius: number;
  /** Prompt text for the current state, or null when the action is not available now. */
  label(s: PlayerState): string | null;
  /** Performs the action. */
  act(): void;
}

/** Angles closer than this (radians) are treated as equal, so the nearer target wins. */
const ANGLE_EPSILON = 1e-3;

/**
 * Returns the best target along the look ray: within maxDist plus its radius, inside maxAngleDeg of the
 * ray, and in front of the eye. The smallest angle wins; equal angles go to the nearer target.
 */
export function pickInteractable(
  eye: THREE.Vector3,
  dir: THREE.Vector3,
  list: Interactable[],
  maxDist = 2.4,
  maxAngleDeg = 28,
): Interactable | null {
  const maxAngle = (maxAngleDeg * Math.PI) / 180;
  const dirLen = dir.length();
  if (dirLen === 0) return null;

  let best: Interactable | null = null;
  let bestAngle = Infinity;
  let bestDist = Infinity;

  for (const item of list) {
    const vx = item.position.x - eye.x;
    const vy = item.position.y - eye.y;
    const vz = item.position.z - eye.z;
    const dist = Math.hypot(vx, vy, vz);
    if (dist > maxDist + item.radius) continue;

    const along = (vx * dir.x + vy * dir.y + vz * dir.z) / dirLen;
    if (dist > 0 && along <= 0) continue;

    const cos = dist === 0 ? 1 : along / dist;
    const angle = Math.acos(Math.min(1, Math.max(-1, cos)));
    if (angle > maxAngle) continue;

    const closerAngle = angle < bestAngle - ANGLE_EPSILON;
    const tieAndNearer = Math.abs(angle - bestAngle) <= ANGLE_EPSILON && dist < bestDist;
    if (closerAngle || tieAndNearer) {
      best = item;
      bestAngle = angle;
      bestDist = dist;
    }
  }
  return best;
}
