// Hand-held sparklers, phuljhadi and pencil: lit and held in the left hand rather than placed on the ground, so they
// have no fuse and start burning the moment they are lit. Each burns for a fixed time and throws sparks the whole
// while, with a flickering light and a looping hiss or fizz that follow the burn point. The phuljhadi's burn point
// slides down its wire; the pencil jets sparks forward from its tip, switching colour every few seconds.
import * as THREE from 'three';
import { Cracker } from './Cracker';
import type { FxContext } from '../fx/FxContext';
import type { SoundHandle, SoundName } from '../audio/AudioEngine';
import { PHULJHADI_WIRE_BOTTOM, PHULJHADI_WIRE_LENGTH } from '../items/crackerModels';

/** Which hand-held sparkler this is. */
export type HandHeldVariant = 'phuljhadi' | 'pencil';

/** Per-variant burn settings. */
interface HandHeldSpec {
  /** Seconds the sparkler burns after it is lit. */
  seconds: number;
  /** Looping sound that runs for the whole burn. */
  sound: SoundName;
}

/** Burn time and sound for each sparkler. */
const SPECS: Record<HandHeldVariant, HandHeldSpec> = {
  phuljhadi: { seconds: 20, sound: 'fizz' },
  pencil: { seconds: 12, sound: 'hiss' },
};

/** Phuljhadi sparks per second. */
const PHULJHADI_RATE = 500;
/** Pencil sparks per second. */
const PENCIL_RATE = 600;
/** Fraction of the wire left when the phuljhadi's burn point reaches its end; the rest of the wire is unburnt. */
const PHULJHADI_END_FRACTION = 0.15;
/** Seconds between the pencil's colour changes, which alternate green and red. */
const COLOUR_SWITCH_SECONDS = 3;
/** Seconds between the light flickers that follow the burn point. */
const FLASH_INTERVAL = 0.12;
/** Gold colours for the phuljhadi's crackle. */
const GOLD = [0xffc24a, 0xfff0c0];
/** Green shades for the pencil's jet. */
const GREEN = [0x7bdc6e, 0xb6eaa4];
/** Red shades for the pencil's jet. */
const RED = [0xff5a3c, 0xff8c6e];

/** A phuljhadi or pencil: burns in the hand for a fixed time, with sparks, light and sound. */
export class HandHeld extends Cracker {
  /** Called once when the sparkler burns out, so the game can take it out of the hand. */
  onBurnOut: (() => void) | null = null;

  /** Which sparkler this is. */
  private readonly variant: HandHeldVariant;
  /** Seconds of burn for this variant. */
  private readonly seconds: number;
  /** Looping hiss or fizz, kept so it can follow the burn point and stop when the burn ends. */
  private sound: SoundHandle | null = null;
  /** Fractional spark count carried between frames. */
  private sparkAcc = 0;
  /** Seconds since the last light flicker. */
  private flashAcc = 0;
  /** Where the burn point is this frame, in world space; reused every frame. */
  private readonly point = new THREE.Vector3();
  /** The pencil's forward direction this frame, in world space; reused every frame. */
  private readonly forward = new THREE.Vector3();

  /** Builds the sparkler around its model; it starts burning as soon as it is lit. */
  constructor(variant: HandHeldVariant, fx: FxContext, model: THREE.Group) {
    super(variant, fx, model);
    this.variant = variant;
    this.seconds = SPECS[variant].seconds;
  }

  /**
   * Puts the sparkler in the hand: it becomes a child of `hand`, with its origin at the hand's origin. Call it
   * before or after lighting; it does not change the burn.
   */
  attach(hand: THREE.Object3D): void {
    hand.add(this.object);
    this.object.position.set(0, 0, 0);
    this.object.rotation.set(0, 0, 0);
  }

  /** Starts the burn: the start burst, and a looping sound that follows the burn point. */
  protected onIgnite(): void {
    this.burst(0.2);
    this.object.updateWorldMatrix(true, false);
    this.locate(0);
    this.sound = this.fx.audio.play(SPECS[this.variant].sound, this.point, { duration: this.seconds });
  }

  /** Throws sparks at the variant's rate, flickers the light, and ends when the burn time is up. */
  protected onActive(dt: number): boolean {
    const progress = this.activeTime / this.seconds;
    if (progress >= 1) {
      // Burnt out: the looping sound stops, the game is told, and the cracker is finished.
      this.sound?.stop();
      this.sound = null;
      this.onBurnOut?.();
      return true;
    }

    this.object.updateWorldMatrix(true, false);
    this.locate(progress);
    this.sound?.setPosition(this.point);
    if (this.variant === 'phuljhadi') this.emitPhuljhadi(dt);
    else this.emitPencil(dt);
    return false;
  }

  /** Frees the looping sound on top of the base cleanup, so a removed sparkler goes silent at once. */
  override dispose(): void {
    this.sound?.stop();
    this.sound = null;
    super.dispose();
  }

  /**
   * Puts the burn point where the sparks come from: on the phuljhadi it slides from the top of the wire down to
   * 15% of its length as the burn goes on; on the pencil it is the tip.
   */
  private locate(progress: number): void {
    if (this.variant === 'phuljhadi') {
      const along = 1 - (1 - PHULJHADI_END_FRACTION) * progress;
      this.point.set(0, PHULJHADI_WIRE_BOTTOM + PHULJHADI_WIRE_LENGTH * along, 0);
      this.object.localToWorld(this.point);
    } else {
      this.fuseWorld(this.point);
    }
  }

  /** Phuljhadi: gold crackle sparks thrown in every direction from the burn point, plus a flicker of light. */
  private emitPhuljhadi(dt: number): void {
    this.sparkAcc += PHULJHADI_RATE * dt;
    const n = Math.floor(this.sparkAcc);
    if (n > 0) {
      this.sparkAcc -= n;
      this.fx.sparks.emit({
        position: this.point,
        speed: [2, 4],
        spread: Math.PI,
        count: n,
        colors: GOLD,
        life: [0.25, 0.6],
        size: [0.008, 0.014],
        gravity: 6,
        crackle: true,
      });
    }
    this.flicker(dt, GOLD[0], 1.2, 3);
  }

  /** Pencil: a jet of green or red sparks forward from the tip, alternating colour every few seconds. */
  private emitPencil(dt: number): void {
    // The jet goes along the pencil's own axis, so take the object's up direction in world space.
    this.forward.set(0, 1, 0).transformDirection(this.object.matrixWorld);
    const colours = Math.floor(this.activeTime / COLOUR_SWITCH_SECONDS) % 2 === 0 ? GREEN : RED;
    this.sparkAcc += PENCIL_RATE * dt;
    const n = Math.floor(this.sparkAcc);
    if (n > 0) {
      this.sparkAcc -= n;
      this.fx.sparks.emit({
        position: this.point,
        direction: this.forward,
        speed: [3, 5],
        spread: 0.35,
        count: n,
        colors: colours,
        life: [0.5, 0.9],
        size: [0.01, 0.018],
        gravity: 3,
        drag: 0.6,
      });
    }
    this.flicker(dt, colours[0], 1.0, 3);
  }

  /** Re-triggers a low light on the burn point every FLASH_INTERVAL seconds so it flickers as it burns. */
  private flicker(dt: number, color: number, intensity: number, distance: number): void {
    this.flashAcc += dt;
    if (this.flashAcc >= FLASH_INTERVAL) {
      this.flashAcc -= FLASH_INTERVAL;
      this.fx.flashes.flash(this.point, color, intensity, distance, FLASH_INTERVAL + 0.05);
    }
  }
}
