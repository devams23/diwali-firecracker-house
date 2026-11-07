// Builds a ready-to-place cracker of a given kind: makes its model, picks the matching effect class, and sets its
// position and yaw. Kinds whose effects arrive in a later task throw here, so a missing one fails loudly.
import * as THREE from 'three';
import type { CrackerKind } from './catalog';
import type { FxContext } from '../fx/FxContext';
import { makeCrackerModel } from '../items/crackerModels';
import type { Cracker } from './Cracker';
import { Anar } from './Anar';
import { Chakri } from './Chakri';
import { Bomb } from './Bomb';
import { SaanpGoli } from './SaanpGoli';

/**
 * Creates a cracker of `kind` standing at `position` and turned by `yaw` radians about the vertical axis.
 * The cracker is not added to the scene; the caller hands it to CrackerManager.add().
 * Throws for kinds still to come (phuljhadi, pencil, rocket, ladi, skyshot).
 */
export function createCracker(kind: CrackerKind, fx: FxContext, position: THREE.Vector3, yaw: number): Cracker {
  let c: Cracker;
  switch (kind) {
    case 'anar':
      c = new Anar(fx, makeCrackerModel(kind));
      break;
    case 'chakri':
      c = new Chakri(fx, makeCrackerModel(kind));
      break;
    case 'laxmi':
    case 'sutli':
      c = new Bomb(kind, fx, makeCrackerModel(kind));
      break;
    case 'saanp':
      c = new SaanpGoli(fx, makeCrackerModel(kind));
      break;
    default:
      throw new Error(`Cracker kind "${kind}" is not implemented yet`);
  }
  c.object.position.copy(position);
  c.object.rotation.y = yaw;
  return c;
}
