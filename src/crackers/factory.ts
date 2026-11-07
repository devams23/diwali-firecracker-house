// Builds a ready-to-place cracker of a given kind: makes its model, picks the matching effect class, and sets its
// position and yaw. Every catalogue kind is covered; the default branch is a compile-time check that no kind is missed.
import * as THREE from 'three';
import type { CrackerKind } from './catalog';
import type { FxContext } from '../fx/FxContext';
import { makeCrackerModel } from '../items/crackerModels';
import type { Cracker } from './Cracker';
import { Anar } from './Anar';
import { Chakri } from './Chakri';
import { Bomb } from './Bomb';
import { SaanpGoli } from './SaanpGoli';
import { HandHeld } from './HandHeld';
import { Rocket } from './Rocket';
import { Ladi } from './Ladi';
import { SkyShot } from './SkyShot';

/**
 * Creates a cracker of `kind` standing at `position` and turned by `yaw` radians about the vertical axis.
 * The cracker is not added to the scene; the caller hands it to CrackerManager.add().
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
    case 'phuljhadi':
    case 'pencil':
      c = new HandHeld(kind, fx, makeCrackerModel(kind));
      break;
    case 'rocket':
      c = new Rocket(fx, makeCrackerModel(kind));
      break;
    case 'ladi':
      c = new Ladi(fx, makeCrackerModel(kind));
      break;
    case 'skyshot':
      c = new SkyShot(fx, makeCrackerModel(kind));
      break;
    default: {
      // Unreachable while every kind is handled: a new CrackerKind without a case fails to compile here.
      const missing: never = kind;
      throw new Error(`Cracker kind "${String(missing)}" is not implemented`);
    }
  }
  c.object.position.copy(position);
  c.object.rotation.y = yaw;
  return c;
}
