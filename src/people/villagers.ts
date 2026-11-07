// Places the six villagers of the aangan: two kids on walking loops, an elder on the second charpai, a woman in
// the doorway, a man just inside the gate and a girl beside the rangoli. It registers the colliders of the
// standing ones and hands every villager to the engine loop. It also holds the rules for when a burst makes
// them cheer.
import * as THREE from 'three';
import type { Updatable } from '../core/Engine';
import type { CollisionWorld } from '../core/Collision';
import type { FxContext } from '../fx/FxContext';
import { Villager } from './Villager';

/** Horizontal distance, in metres, within which a burst makes villagers cheer. */
export const CHEER_RANGE = 15;
/** Lowest burst power that makes villagers cheer. */
export const CHEER_MIN_POWER = 0.5;
/** Longest random wait, in seconds, before each villager starts to cheer. */
export const CHEER_MAX_DELAY = 0.3;

/** Collider radius of a standing or seated villager, in metres. */
const BODY_RADIUS = 0.3;
/** Floor height of the verandah, from House.ts (VERANDAH_H). */
const VERANDAH_FLOOR = 0.3;
/** Kurta colour: off-white, matte. */
const KURTA = 0xe9e2d0;
/** Saree colour: deep maroon. */
const SAREE = 0x6b1f2a;
/** Dupatta colour: a shade lighter than the saree so the head covering reads. */
const DUPATTA = 0x7d2c3a;
/** Mustard, for a kid's kurta. */
const MUSTARD = 0xc08a2a;
/** Dark teal, for the other kid. */
const TEAL_DARK = 0x1f4e4a;
/** Muted terracotta, for the girl. */
const TERRACOTTA = 0xb0623a;

/**
 * True if a villager at (vx, vz) is within CHEER_RANGE of a burst at (bx, bz). Height is ignored: bursts are
 * usually high in the sky, and the villagers are on the ground under them.
 */
export function inCheerRange(vx: number, vz: number, bx: number, bz: number): boolean {
  const dx = vx - bx;
  const dz = vz - bz;
  return dx * dx + dz * dz <= CHEER_RANGE * CHEER_RANGE;
}

/**
 * Creates the six villagers, places them, registers the colliders of the standing ones with `world`, and adds
 * each to the scene and to the engine loop. Returns them so Game can give them the player position and cheer them.
 */
export function spawnVillagers(
  scene: THREE.Scene,
  fx: FxContext,
  game: { add(u: Updatable): void },
  world: CollisionWorld,
): Villager[] {
  // Two kids on small loops, each holding a lit sparkler, kept clear of the charpais and the tulsi chaura.
  const kidA = new Villager(
    {
      height: 1.12,
      clothes: MUSTARD,
      pose: 'walkLoop',
      loopCenter: new THREE.Vector3(-3, 0, 2),
      loopRadius: 1.5,
      sparkler: true,
    },
    fx,
  );
  const kidB = new Villager(
    {
      height: 1.18,
      clothes: TEAL_DARK,
      pose: 'walkLoop',
      loopCenter: new THREE.Vector3(3, 0, -2),
      loopRadius: 1.5,
      sparkler: true,
    },
    fx,
  );

  // The elder sits on the second charpai, facing east into the aangan.
  const elder = new Villager({ height: 1.6, clothes: KURTA, pose: 'sit' }, fx);
  elder.place(-6, 0, 2, Math.PI / 2);

  // The woman stands just inside the verandah, in front of the door and clear of its wall.
  const woman = new Villager({ height: 1.6, clothes: SAREE, dupatta: DUPATTA, pose: 'stand' }, fx);
  woman.place(0, VERANDAH_FLOOR, -7.75, 0);

  // The man stands just inside the gate, to one side of the path the player walks in, facing north.
  const man = new Villager({ height: 1.65, clothes: KURTA, pose: 'stand' }, fx);
  man.place(-1.35, 0, 6.4, Math.PI);

  // The girl stands beside the rangoli (which spans x of -0.8 to 0.8), not on it.
  const girl = new Villager({ height: 1.3, clothes: TERRACOTTA, pose: 'stand' }, fx);
  girl.place(1.15, VERANDAH_FLOOR, -7.9, 0);

  // Standing and seated villagers are solid to the player. The kids keep to their loops, so they are not.
  for (const v of [elder, woman, man, girl]) {
    world.addCircle(v.object.position.x, v.object.position.z, BODY_RADIUS);
  }

  const all = [kidA, kidB, elder, woman, man, girl];
  for (const v of all) {
    scene.add(v.object);
    game.add(v);
  }
  return all;
}
