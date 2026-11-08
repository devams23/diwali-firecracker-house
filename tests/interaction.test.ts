// Tests for crosshair aiming: a struck mesh maps to the target that owns it through its parents, and the nearest owned
// hit within reach wins while unowned hits and far hits are skipped. Runs under Node.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { pickAimed, resolveOwner, type AimHit } from '../src/player/Interaction';

/** A named owner used as the registry value in these tests. */
interface Named {
  name: string;
}

describe('resolveOwner', () => {
  it('finds the registered object when the struck mesh is that object', () => {
    const root = new THREE.Object3D();
    const owners = new Map<THREE.Object3D, Named>([[root, { name: 'box' }]]);
    expect(resolveOwner(root, owners)?.name).toBe('box');
  });

  it('walks up from a struck child to the registered parent', () => {
    const root = new THREE.Object3D();
    const child = new THREE.Mesh();
    const grandchild = new THREE.Mesh();
    root.add(child);
    child.add(grandchild);
    const owners = new Map<THREE.Object3D, Named>([[root, { name: 'stand' }]]);
    expect(resolveOwner(grandchild, owners)?.name).toBe('stand');
  });

  it('returns null when no ancestor is registered', () => {
    const lone = new THREE.Mesh();
    expect(resolveOwner(lone, new Map<THREE.Object3D, Named>())).toBeNull();
  });
});

describe('pickAimed', () => {
  /** A registered target and its single hit at the given distance, for building a hit list. */
  function owned(name: string, distance: number): { owner: Named; root: THREE.Object3D; hit: AimHit } {
    const root = new THREE.Object3D();
    return { owner: { name }, root, hit: { object: root, distance } };
  }

  it('picks the nearer of two owned hits', () => {
    const near = owned('near', 1.2);
    const far = owned('far', 2.8);
    const owners = new Map<THREE.Object3D, Named>([
      [near.root, near.owner],
      [far.root, far.owner],
    ]);
    expect(pickAimed([far.hit, near.hit], owners, 3.5)?.name).toBe('near');
  });

  it('skips a closer hit that no target owns, so an unowned object does not block the aim', () => {
    const wall = new THREE.Mesh();
    const target = owned('box', 2);
    const owners = new Map<THREE.Object3D, Named>([[target.root, target.owner]]);
    const hits: AimHit[] = [{ object: wall, distance: 0.5 }, target.hit];
    expect(pickAimed(hits, owners, 3.5)?.name).toBe('box');
  });

  it('returns null for an owned hit beyond the reach', () => {
    const target = owned('far', 3.6);
    const owners = new Map<THREE.Object3D, Named>([[target.root, target.owner]]);
    expect(pickAimed([target.hit], owners, 3.5)).toBeNull();
  });

  it('returns null when there are no hits', () => {
    expect(pickAimed([], new Map<THREE.Object3D, Named>(), 3.5)).toBeNull();
  });

  it('accepts a hit exactly at the reach limit', () => {
    const target = owned('edge', 3.5);
    const owners = new Map<THREE.Object3D, Named>([[target.root, target.owner]]);
    expect(pickAimed([target.hit], owners, 3.5)?.name).toBe('edge');
  });
});
