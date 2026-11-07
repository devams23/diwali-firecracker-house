// Owns every cracker currently in the village: adds them to the scene, updates each one, answers the
// "which unlit cracker is under the fuse tip" query for lighting, and removes finished crackers a few seconds
// after their effect ends so the scene and sparks do not accumulate.
import * as THREE from 'three';
import type { Updatable } from '../core/Engine';
import { Cracker, DONE_LINGER_SECONDS } from './Cracker';

/** Scratch vector for fuse-tip queries, reused so lighting checks do not allocate every frame. */
const tip = new THREE.Vector3();

/** Tracks the live crackers in the scene and drives their updates and removal. */
export class CrackerManager implements Updatable {
  /** Every cracker currently in the scene, in the order they were added. */
  readonly list: Cracker[] = [];

  /** Scene the crackers' objects are added to. */
  private readonly scene: THREE.Scene;

  /** Creates a manager that places its crackers in the given scene. */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Adds a cracker's object to the scene and starts tracking it. */
  add(c: Cracker): void {
    this.list.push(c);
    this.scene.add(c.object);
  }

  /**
   * Returns the nearest cracker that has not been lit yet, measured from its fuse tip to `point`, within `maxDist`
   * metres; null if none is close enough.
   */
  nearestUnlit(point: THREE.Vector3, maxDist = 0.6): Cracker | null {
    let best: Cracker | null = null;
    let bestDist = maxDist;
    for (const c of this.list) {
      if (c.timer.phase !== 'idle') continue;
      c.fuseWorld(tip);
      const d = tip.distanceTo(point);
      if (d <= bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  }

  /** Number of crackers that have not been lit yet. */
  get unlitCount(): number {
    let n = 0;
    for (const c of this.list) if (c.timer.phase === 'idle') n++;
    return n;
  }

  /** Updates every cracker, then removes the ones that finished more than 12 s ago. */
  update(dt: number, t: number): void {
    for (const c of this.list) c.update(dt, t);
    // Walk backwards so removing an entry does not skip the one that moves into its slot.
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      if (c.timer.phase === 'done' && c.age >= DONE_LINGER_SECONDS) {
        this.list.splice(i, 1);
        c.dispose();
      }
    }
  }
}
