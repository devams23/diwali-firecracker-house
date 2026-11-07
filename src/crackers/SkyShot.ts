// Sky shot: a multi-shot cake on the ground. Once lit it fires twelve shells, one every 0.55 s, each bursting 25 to
// 32 m up in a little random sideways offset. The shapes cycle through peony, willow, crackle and ring, and the palettes
// cycle through the sky palettes, so the sequence never repeats a look in a row. Each shell is a shared aerial burst
// with its own bang and event at the burst point.
import * as THREE from 'three';
import { Cracker } from './Cracker';
import type { FxContext } from '../fx/FxContext';
import { aerialBurst, SKY_PALETTES, type BurstStyle } from '../fx/aerialBurst';
import { events } from '../core/events';

/** Number of shells in one sky shot. */
const SHELL_COUNT = 12;
/** Seconds between one shell's burst and the next. */
const SHELL_INTERVAL = 0.55;
/** Lowest burst height above the ground, in metres. */
const MIN_HEIGHT = 25;
/** Highest burst height above the ground, in metres. */
const MAX_HEIGHT = 32;
/** Largest sideways shift of a burst from the cake's centre, in metres, each way on each axis. */
const SIDE_JITTER = 3;
/** Burst power announced on the game event bus for each shell. */
const BURST_POWER = 0.6;
/** Shapes the shells cycle through, in order. */
const STYLES: BurstStyle[] = ['peony', 'willow', 'crackle', 'ring'];

/** Sky shot: fires twelve shells on a steady beat, each bursting high over the cake. */
export class SkyShot extends Cracker {
  /** Number of shells that have burst so far. */
  private fired = 0;
  /** Cake position on the ground, in world space, copied at ignition. */
  private readonly base = new THREE.Vector3();
  /** Scratch vector for the burst point of the shell being fired, reused by every shell. */
  private readonly sky = new THREE.Vector3();

  /** Builds the sky shot around its model; the shells start when the fuse runs out. */
  constructor(fx: FxContext, model: THREE.Group) {
    super('skyshot', fx, model);
  }

  /** Records where the cake stands and plays the launch whoosh. */
  protected onIgnite(): void {
    this.object.getWorldPosition(this.base);
    this.fx.audio.play('whoosh', this.base);
  }

  /** Bursts each shell as its time comes, and ends after the twelfth. */
  protected onActive(): boolean {
    while (this.fired < SHELL_COUNT && this.activeTime >= this.fired * SHELL_INTERVAL) {
      this.fireShell(this.fired);
      this.fired++;
    }
    return this.fired >= SHELL_COUNT;
  }

  /** Bursts shell number `k`: a random height and sideways offset, the cycled shape and palette, and the burst event. */
  private fireShell(k: number): void {
    const height = MIN_HEIGHT + Math.random() * (MAX_HEIGHT - MIN_HEIGHT);
    this.sky.copy(this.base);
    this.sky.x += (Math.random() * 2 - 1) * SIDE_JITTER;
    this.sky.z += (Math.random() * 2 - 1) * SIDE_JITTER;
    this.sky.y += height;

    const style = STYLES[k % STYLES.length];
    const palette = SKY_PALETTES[k % SKY_PALETTES.length];
    aerialBurst(this.fx, this.sky, style, palette);
    events.emit('burst', { x: this.sky.x, y: this.sky.y, z: this.sky.z, power: BURST_POWER });
  }
}
