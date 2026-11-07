// Tests for crosshair picking: the chosen interactable must lie within range and under the angle cap,
// prefer the smallest angle to the look ray, and break ties by distance. Runs under Node.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { pickInteractable, type Interactable } from '../src/player/Interaction';
import type { PlayerState } from '../src/player/PlayerState';

const EYE = new THREE.Vector3(0, 1.6, 0);
const FORWARD = new THREE.Vector3(0, 0, -1);

/** Builds a minimal interactable at a position with a fixed radius; its act and label are never used here. */
function target(id: string, x: number, y: number, z: number, radius = 0.2): Interactable {
  return {
    id,
    position: new THREE.Vector3(x, y, z),
    radius,
    label: (_s: PlayerState) => id,
    act: () => {},
  };
}

describe('pickInteractable', () => {
  it('picks the target closest to the look direction over one far off-axis', () => {
    const a = target('A', 0, 1.6, -1.5);
    const b = target('B', 1.5, 1.6, -1.5);
    expect(pickInteractable(EYE, FORWARD, [b, a])).toBe(a);
  });

  it('returns null for a target beyond range', () => {
    expect(pickInteractable(EYE, FORWARD, [target('far', 0, 1.6, -5)])).toBeNull();
  });

  it('returns null for a target behind the player', () => {
    expect(pickInteractable(EYE, FORWARD, [target('behind', 0, 1.6, 2)])).toBeNull();
  });

  it('prefers the nearer of two targets on the same ray', () => {
    const near = target('near', 0, 1.6, -1);
    const far = target('far', 0, 1.6, -2);
    expect(pickInteractable(EYE, FORWARD, [far, near])).toBe(near);
  });
});
