// Tests for cracker placement: the ground clamp that keeps crackers on the takht floor, and the point
// 1.2 m ahead of the player that a thrown or set cracker lands on.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { clampPlacement, placementPoint } from '../src/crackers/placement';

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
