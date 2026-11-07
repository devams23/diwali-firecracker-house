// Anar (flower pot): a clay pot that throws a gold and silver spark fountain from its nozzle for nine seconds,
// with a warm flickering light, a rising light smoke and a continuous roar. Its effect is driven by Cracker's
// active phase; this file only describes the fountain.
import * as THREE from 'three';
import { Cracker } from './Cracker';
import type { FxContext } from '../fx/FxContext';

/** How long the fountain runs after ignition, in seconds. */
const ANAR_SECONDS = 9;
/** Seconds for the spark rate to climb from zero to its peak. */
const RAMP_SECONDS = 2;
/** Sparks per second at full fountain. */
const PEAK_RATE = 900;
/** Seconds between re-triggering the warm light; each flash lasts a little longer than this. */
const FLASH_INTERVAL = 0.15;
/** Seconds between light-smoke puffs. */
const SMOKE_INTERVAL = 0.5;
/** Height of the nozzle above the pot's base, in metres. */
const NOZZLE_HEIGHT = 0.04;
/** World up, used as the fountain's axis. */
const UP = new THREE.Vector3(0, 1, 0);

/** Anar: a sustained spark fountain for nine seconds with light and smoke. */
export class Anar extends Cracker {
  /** Where sparks leave the nozzle this frame, in world space. */
  private readonly nozzle = new THREE.Vector3();
  /** Fractional spark count carried between frames. */
  private sparkAcc = 0;
  /** Seconds since the last warm-light flash. */
  private flashAcc = 0;
  /** Seconds since the last smoke puff. */
  private smokeAcc = 0;

  /** Builds the anar around its model; the fountain starts when the fuse runs out. */
  constructor(fx: FxContext, model: THREE.Group) {
    super('anar', fx, model);
  }

  /** Starts the roar and the opening burst from the nozzle. */
  protected onIgnite(): void {
    this.updateNozzle();
    this.burst(0.4);
    this.fx.audio.play('roar', this.nozzle, { duration: ANAR_SECONDS });
  }

  /** Runs the fountain: spark rate ramps up, the light and smoke keep pace, and the effect ends after nine seconds. */
  protected onActive(dt: number): boolean {
    if (this.activeTime >= ANAR_SECONDS) return true;
    this.updateNozzle();

    // Sparks: the emit rate ramps linearly to its peak; fractional counts are carried so the rate stays exact.
    const rate = PEAK_RATE * Math.min(1, this.activeTime / RAMP_SECONDS);
    this.sparkAcc += rate * dt;
    const n = Math.floor(this.sparkAcc);
    if (n > 0) {
      this.sparkAcc -= n;
      this.fx.sparks.emit({
        position: this.nozzle,
        direction: UP,
        speed: [6, 9],
        spread: 0.22,
        count: n,
        colors: [0xffc860, 0xfff4e0],
        life: [0.8, 1.6],
        size: [0.02, 0.04],
        crackle: true,
      });
    }

    // Warm light: re-triggered on an interval so it stays lit for the whole effect.
    this.flashAcc += dt;
    if (this.flashAcc >= FLASH_INTERVAL) {
      this.flashAcc -= FLASH_INTERVAL;
      this.fx.flashes.flash(this.nozzle, 0xffc860, 4, 10, FLASH_INTERVAL + 0.05);
    }

    // Light smoke rising from the pot.
    this.smokeAcc += dt;
    if (this.smokeAcc >= SMOKE_INTERVAL) {
      this.smokeAcc -= SMOKE_INTERVAL;
      this.fx.smoke.puff(this.nozzle, { count: 1, size: 0.4, life: 4, rise: 0.4, color: 0x8a8680 });
    }
    return false;
  }

  /** Moves the nozzle point to the pot's mouth, in world space, without allocating. */
  private updateNozzle(): void {
    this.object.getWorldPosition(this.nozzle);
    this.nozzle.y += NOZZLE_HEIGHT;
  }
}
