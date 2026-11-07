// Ladi (string of crackers): a braided fuse laid on the ground with about twenty red tubes standing on it. Once lit,
// it pops 60 times along the laid curve from the lit end, 18 pops a second. Each pop is a small bang with gold
// sparks and red paper bits, every sixth one has a tiny flash, and every second one plays the sound to save voices.
// The tubes vanish as the pops pass them and the braid burns away behind the pops.
import * as THREE from 'three';
import { Cracker } from './Cracker';
import type { FxContext } from '../fx/FxContext';
import { LADI_BRAID_NAME, LADI_BRAID_SEGMENTS, ladiPoint } from '../items/crackerModels';

/** Total pops along the ladi. */
export const LADI_POPS = 60;
/** Pops per second; pop k happens at k / POP_RATE seconds after ignition. */
const POP_RATE = 18;
/** Every this-many pops plays the bang sound, so the string does not use up all the voices. */
const SOUND_EVERY = 2;
/** Every this-many pops gets a tiny flash of light. */
const FLASH_EVERY = 6;
/** Height above the braid where a pop happens, in metres, which is the top of a tube. */
const POP_LIFT = 0.02;
/** Camera shake trauma added by each pop when the player is close. */
const POP_SHAKE = 0.05;
/** Distance within which pops shake the camera, in metres. */
const SHAKE_RANGE = 3;
/** Red paper shades for the bits thrown by each pop. */
const PAPER_RED = [0x9c3b22, 0x7a1c14];

/**
 * How many pops should have fired after `seconds` of burning: pop 0 is at the ignition instant, so the count is
 * one more than the whole pop intervals elapsed, capped at LADI_POPS. Negative times have no pops yet.
 */
export function popsDueBy(seconds: number): number {
  if (seconds < 0) return 0;
  return Math.min(LADI_POPS, Math.floor(seconds * POP_RATE) + 1);
}

/** Ladi: a laid string of crackers that pops along the ground, with the tubes and braid disappearing as it goes. */
export class Ladi extends Cracker {
  /** The red tubes in the order they sit along the fuse; each is hidden when its pop passes it. */
  private readonly tubes: THREE.Object3D[];
  /** The braided fuse mesh, whose draw range is trimmed as the pops burn along it, or null if the model lacks it. */
  private readonly braid: THREE.Mesh | null;
  /** Number of pops that have fired so far. */
  private popped = 0;
  /** Number of tubes already hidden, counted from the lit end. */
  private tubesHidden = 0;
  /** Scratch vector for the pop point in the model's local space. */
  private readonly local = new THREE.Vector3();
  /** Scratch vector for the pop point in world space, reused by every pop. */
  private readonly at = new THREE.Vector3();
  /** Scratch vector for the camera position, used by the shake check. */
  private readonly eye = new THREE.Vector3();

  /** Builds the ladi around its model; the pops start when the fuse runs out. */
  constructor(fx: FxContext, model: THREE.Group) {
    super('ladi', fx, model);
    // The builder tags each tube, and the tubes are the first children in lit-end order.
    this.tubes = model.children.filter((c) => c.userData.ladiTube === true);
    const braid = model.getObjectByName(LADI_BRAID_NAME);
    this.braid = braid instanceof THREE.Mesh ? braid : null;
  }

  /** Puts the opening burst at the lit end of the string. */
  protected onIgnite(): void {
    this.burst(0.6);
  }

  /** Fires every pop that has come due, then ends once the last one has gone off. */
  protected onActive(): boolean {
    if (this.popped >= LADI_POPS) return true;
    // Pops are placed by local-to-world, which needs the matrix to be current.
    this.object.updateWorldMatrix(true, false);
    const due = popsDueBy(this.activeTime);
    while (this.popped < due) {
      this.pop(this.popped);
      this.popped++;
    }
    return this.popped >= LADI_POPS;
  }

  /** Fires pop number `k`: the bang, sparks, paper, light and shake, then hides or burns what it has passed. */
  private pop(k: number): void {
    const s = k / (LADI_POPS - 1);
    ladiPoint(s, this.local);
    this.local.y += POP_LIFT;
    this.at.copy(this.local);
    this.object.localToWorld(this.at);

    if (k % SOUND_EVERY === 0) this.fx.audio.play('popSmall', this.at);

    // Gold sparks flung up and out, with a few heavier red paper bits.
    this.fx.sparks.emit({
      position: this.at,
      speed: [1.5, 3],
      spread: Math.PI / 2,
      count: 25,
      colors: [0xffc24a, 0xfff0c0],
      life: [0.3, 0.6],
      size: [0.01, 0.02],
      crackle: true,
    });
    this.fx.sparks.emit({
      position: this.at,
      speed: [0.8, 1.8],
      spread: Math.PI / 2,
      count: 4,
      colors: PAPER_RED,
      life: [0.6, 1.0],
      size: [0.008, 0.012],
      gravity: 4,
      drag: 2,
    });

    if (k % FLASH_EVERY === 0) this.fx.flashes.flash(this.at, 0xffc24a, 1.2, 2.5, 0.06);

    // Only a player standing near the string feels the pops.
    this.fx.camera.getWorldPosition(this.eye);
    if (this.eye.distanceTo(this.at) < SHAKE_RANGE) this.fx.shake.add(POP_SHAKE);

    this.hideTubesBehind(s);
    this.burnBraid(s);
  }

  /** Hides each tube whose position along the string the pop front has reached. */
  private hideTubesBehind(s: number): void {
    const last = this.tubes.length - 1;
    while (this.tubesHidden < this.tubes.length && (this.tubesHidden / last) <= s + 1e-9) {
      this.tubes[this.tubesHidden].visible = false;
      this.tubesHidden++;
    }
  }

  /**
   * Trims the braid from the lit end up to the pop front by moving the start of its draw range. The braid's index
   * is built one block per curve segment, so a segment count gives the index offset directly.
   */
  private burnBraid(s: number): void {
    const index = this.braid?.geometry.index;
    if (!this.braid || !index) return;
    const perSegment = index.count / LADI_BRAID_SEGMENTS;
    const start = Math.min(index.count, Math.round(s * LADI_BRAID_SEGMENTS) * perSegment);
    // The count must stop at the end of the index buffer, so it is what is left after the start.
    this.braid.geometry.setDrawRange(start, index.count - start);
  }
}
