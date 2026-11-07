// Chakri (spinning wheel): a pinwheel pinned to the ground that spins up to 40 rad/s for six seconds while
// wandering slowly across the takht, throwing green and gold sparks off its rim with a whistle and fizz.
// It is kept on the floor by clampPlacement and turns back at the edges.
import * as THREE from 'three';
import { Cracker } from './Cracker';
import { clampPlacement } from './placement';
import type { FxContext } from '../fx/FxContext';

/** How long the wheel spins after ignition, in seconds. */
const CHAKRI_SECONDS = 6;
/** Top spin rate about the vertical axis, in rad/s. */
const MAX_SPIN = 40;
/** Seconds for the spin to ramp up to its top rate. */
const SPIN_RAMP = 1.5;
/** Walking speed across the floor, in m/s. */
const WANDER_SPEED = 0.4;
/** Maximum change of heading per second, in radians, for the random walk. */
const TURN_RATE = 2.5;
/** Radius of the rim where sparks leave, in metres. */
const RIM_RADIUS = 0.03;
/** Rim sparks per second at full spin. */
const SPARK_RATE = 120;
/** Height of the rim above the floor, in metres. */
const RIM_HEIGHT = 0.02;
const TAU = Math.PI * 2;

/** Chakri: a ground wheel that spins and wanders, throwing tangential sparks from its rim. */
export class Chakri extends Cracker {
  /** Current heading of the random walk, in radians around the vertical axis. */
  private heading = Math.random() * TAU;
  /** Current spin rate in rad/s, ramped up after ignition. */
  private spin = 0;
  /** Fractional spark count carried between frames. */
  private sparkAcc = 0;
  /** Scratch vector for the rim spark origin. */
  private readonly rimPos = new THREE.Vector3();
  /** Scratch vector for the rim spark direction. */
  private readonly tangent = new THREE.Vector3();
  /** Scratch vector for the origin of one rim spark, reused so sparks do not allocate. */
  private readonly sparkOrigin = new THREE.Vector3();

  /** Builds the chakri around its model; spinning starts when the fuse runs out. */
  constructor(fx: FxContext, model: THREE.Group) {
    super('chakri', fx, model);
  }

  /** Starts the whistle and fizz, both running for the full spin. */
  protected onIgnite(): void {
    this.object.getWorldPosition(this.rimPos);
    this.fx.audio.play('whistle', this.rimPos, { duration: CHAKRI_SECONDS });
    this.fx.audio.play('fizz', this.rimPos, { duration: CHAKRI_SECONDS });
  }

  /** Spins, wanders and throws rim sparks; ends after six seconds. */
  protected onActive(dt: number): boolean {
    if (this.activeTime >= CHAKRI_SECONDS) return true;

    // Spin: ramps to the top rate, then holds it.
    this.spin = MAX_SPIN * Math.min(1, this.activeTime / SPIN_RAMP);
    this.object.rotation.y += this.spin * dt;

    this.wander(dt);
    this.emitRimSparks(dt);
    return false;
  }

  /** Random-walks the wheel across the floor and turns it back when it reaches the edge of the takht. */
  private wander(dt: number): void {
    this.heading += (Math.random() - 0.5) * 2 * TURN_RATE * dt;
    const pos = this.object.position;
    const nx = pos.x + Math.sin(this.heading) * WANDER_SPEED * dt;
    const nz = pos.z + Math.cos(this.heading) * WANDER_SPEED * dt;
    const c = clampPlacement(nx, nz);
    // Hitting the edge reverses the heading so the wheel turns back rather than sticking to the wall.
    if (c.x !== nx || c.z !== nz) this.heading += Math.PI;
    pos.x = c.x;
    pos.z = c.z;
  }

  /** Throws sparks from random points on the rim, moving along the tangent of the spin. */
  private emitRimSparks(dt: number): void {
    this.sparkAcc += SPARK_RATE * dt * Math.min(1, this.activeTime / SPIN_RAMP);
    const n = Math.floor(this.sparkAcc);
    if (n <= 0) return;
    this.sparkAcc -= n;
    this.object.getWorldPosition(this.rimPos);
    const rimSpeed = Math.abs(this.spin) * RIM_RADIUS;
    for (let i = 0; i < n; i++) {
      // Random point on the rim; for spin about +y the rim velocity at angle psi is (sin psi, 0, -cos psi).
      const psi = Math.random() * TAU;
      const cx = Math.cos(psi);
      const cz = Math.sin(psi);
      const ox = this.rimPos.x + cx * RIM_RADIUS;
      const oz = this.rimPos.z + cz * RIM_RADIUS;
      this.tangent.set(cz, 0, -cx);
      this.sparkOrigin.set(ox, this.rimPos.y + RIM_HEIGHT, oz);
      this.fx.sparks.emit({
        position: this.sparkOrigin,
        direction: this.tangent,
        speed: rimSpeed * (0.8 + Math.random() * 0.4),
        spread: 0.35,
        count: 1,
        colors: [0x8cff8c, 0xffc860],
        life: [0.4, 0.9],
        size: [0.015, 0.03],
      });
    }
  }
}
