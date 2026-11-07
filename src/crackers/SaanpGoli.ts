// Saanp Goli (snake pellet): a black pellet that, once lit, grows into a long curling ash snake along the ground
// over three seconds, wiggling as it goes and giving off heavy dark smoke for seven seconds in all. The snake is
// a TubeGeometry along a curve that is rebuilt every 0.1 s, so the old geometry is disposed on each rebuild.
import * as THREE from 'three';
import { Cracker } from './Cracker';
import type { FxContext } from '../fx/FxContext';

/** How long the snake effect runs after ignition, in seconds. */
const SAANP_SECONDS = 7;
/** Seconds for the snake to grow to full length. */
const GROW_SECONDS = 3;
/** Longest the snake grows, in metres. */
const MAX_LENGTH = 0.8;
/** Shortest snake shown, in metres; keeps the curve non-degenerate on the first frame. */
const MIN_LENGTH = 0.02;
/** Seconds between tube rebuilds. */
const REBUILD_INTERVAL = 0.1;
/** Curve samples along the snake body. */
const SEGMENTS = 24;
/** Tube radius of the snake body, in metres. */
const BODY_RADIUS = 0.011;
/** Radial segments of the snake tube. */
const RADIAL_SEGMENTS = 6;
/** Seconds between heavy smoke puffs. */
const SMOKE_INTERVAL = 0.25;
/** Dark grey smoke colour. */
const SMOKE_COLOR = 0x3d3d3d;

/** Saanp goli: a pellet that grows a curling black snake of ash and releases heavy smoke. */
export class SaanpGoli extends Cracker {
  /** Black matte material for the snake body; owned by this cracker and disposed with it. */
  private readonly material = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.45, metalness: 0.05 });
  /** The snake body mesh once it exists; its geometry is replaced on every rebuild. */
  private body: THREE.Mesh | null = null;
  /** Seconds since the last tube rebuild. */
  private rebuildAcc = REBUILD_INTERVAL;
  /** Seconds since the last smoke puff. */
  private smokeAcc = 0;
  /** Scratch vector for the pellet's world position, used for smoke. */
  private readonly origin = new THREE.Vector3();

  /** Builds the pellet around its model; the snake begins growing when the fuse runs out. */
  constructor(fx: FxContext, model: THREE.Group) {
    super('saanp', fx, model);
  }

  /** Starts the sizzle, which runs for the whole effect. */
  protected onIgnite(): void {
    this.object.getWorldPosition(this.origin);
    this.fx.audio.play('sizzle', this.origin, { duration: SAANP_SECONDS });
  }

  /** Grows and rebuilds the snake every 0.1 s, smokes heavily, and ends after seven seconds. */
  protected onActive(dt: number, t: number): boolean {
    if (this.activeTime >= SAANP_SECONDS) return true;

    this.rebuildAcc += dt;
    if (this.rebuildAcc >= REBUILD_INTERVAL) {
      this.rebuildAcc = 0;
      const grow = Math.min(1, this.activeTime / GROW_SECONDS);
      this.rebuild(Math.max(MIN_LENGTH, MAX_LENGTH * grow), t);
    }

    this.smokeAcc += dt;
    if (this.smokeAcc >= SMOKE_INTERVAL) {
      this.smokeAcc -= SMOKE_INTERVAL;
      this.object.getWorldPosition(this.origin);
      this.fx.smoke.puff(this.origin, { count: 2, size: 0.3, life: 4, rise: 0.35, color: SMOKE_COLOR });
    }
    return false;
  }

  /**
   * Replaces the body tube with one that follows a curling path of the given length. Heading curls along the
   * body and a wave travels down it over time, so the snake writhes while it grows.
   */
  private rebuild(length: number, t: number): void {
    const points: THREE.Vector3[] = [];
    const step = length / SEGMENTS;
    let x = 0;
    let z = 0;
    for (let i = 0; i <= SEGMENTS; i++) {
      const s = i / SEGMENTS;
      points.push(new THREE.Vector3(x, BODY_RADIUS, z));
      // Static curl bends the body into a coil; the travelling wave is the wiggle.
      const heading = 1.6 * Math.sin(s * 3.0) + 0.5 * Math.sin(t * 6 - s * 9);
      x += Math.cos(heading) * step;
      z += Math.sin(heading) * step;
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, SEGMENTS * 2, BODY_RADIUS, RADIAL_SEGMENTS, false);

    if (this.body) {
      // The previous tube is replaced, so free its GPU buffers now rather than leaking them.
      this.body.geometry.dispose();
      this.body.geometry = geo;
    } else {
      this.body = new THREE.Mesh(geo, this.material);
      this.object.add(this.body);
    }
  }

  /** Frees the snake's material on top of the base cleanup, which frees the tube geometry. */
  override dispose(): void {
    super.dispose();
    this.material.dispose();
  }
}
