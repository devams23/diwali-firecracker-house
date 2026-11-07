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
/** Sparks per second at full fountain; high enough that the cone reads as a dense spray of separate sparks. */
const PEAK_RATE = 1800;
/** Launch speed range in m/s: about 2 to 3.5 m up once air drag takes its share, so the fountain rises clearly. */
const LAUNCH_SPEED: [number, number] = [6.5, 8];
/** Half-angle of the spray cone in radians, wide enough to read as a fountain rather than a single jet. */
const CONE = 0.3;
/** Gold and silver spark colours; each spark picks one, so the fountain shows a mix of both. */
const SPARK_COLORS = [0xffc24a, 0xffdf8a, 0xe8eef8, 0xffffff];
/** Light drag for the sparks, so they keep their height and fall in arcs. */
const SPARK_DRAG = 0.3;
/** Point glow intensity and reach of the warm light: small, so it lights the spray without washing out the sparks. */
const GLOW_INTENSITY = 1.2;
const GLOW_DISTANCE = 3.5;
/** Seconds between re-triggering the warm light; each flash lasts a little longer than this. */
const FLASH_INTERVAL = 0.15;
/** Seconds between light-smoke puffs. */
const SMOKE_INTERVAL = 0.5;
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
        speed: LAUNCH_SPEED,
        spread: CONE,
        count: n,
        colors: SPARK_COLORS,
        life: [0.9, 1.7],
        size: [0.018, 0.028],
        drag: SPARK_DRAG,
        crackle: true,
      });
    }

    // Warm light: re-triggered on an interval so it stays lit for the whole effect.
    this.flashAcc += dt;
    if (this.flashAcc >= FLASH_INTERVAL) {
      this.flashAcc -= FLASH_INTERVAL;
      this.fx.flashes.flash(this.nozzle, 0xffc860, GLOW_INTENSITY, GLOW_DISTANCE, FLASH_INTERVAL + 0.05);
    }

    // Light smoke rising from the pot.
    this.smokeAcc += dt;
    if (this.smokeAcc >= SMOKE_INTERVAL) {
      this.smokeAcc -= SMOKE_INTERVAL;
      this.fx.smoke.puff(this.nozzle, { count: 1, size: 0.4, life: 4, rise: 0.4, color: 0x8a8680 });
    }
    return false;
  }

  /**
   * Moves the nozzle point to the apex of the pot's cone, in world space, without allocating. The apex is the
   * fuse marker, so the sparks leave the cone's tip rather than a point inside its 0.1 m body.
   */
  private updateNozzle(): void {
    this.fuseWorld(this.nozzle);
  }
}
