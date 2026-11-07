// Rocket: a rocket tube on a bamboo stick, standing in its green bottle on the ground. When the fuse runs out the
// rocket body pulls out of the bottle (the bottle stays behind) and flies up along a slightly tilted path, speeding
// to 35 m/s with a smoke and spark trail and a whoosh. At 1.6 s or 40 m it bursts in the sky in a random shape and
// palette. The flying body is built per cracker and freed when it bursts; the shared label and body materials stay.
import * as THREE from 'three';
import { Cracker } from './Cracker';
import type { FxContext } from '../fx/FxContext';
import type { SoundHandle } from '../audio/AudioEngine';
import { BOTTLE_NAME } from '../items/crackerModels';
import { aerialBurst, SKY_PALETTES, type BurstStyle } from '../fx/aerialBurst';
import { events } from '../core/events';

/** Seconds of flight before the rocket bursts, whatever its height. */
const FLIGHT_SECONDS = 1.6;
/** Distance flown before the rocket bursts, in metres. */
const MAX_RANGE = 40;
/** Top speed of the rocket, in m/s. */
const TOP_SPEED = 35;
/** Acceleration on the way up, in m/s². */
const ACCEL = 30;
/** Largest tilt of the flight path away from straight up, in radians. */
const TILT_MAX = 0.12;
/** Seconds between smoke puffs along the trail. */
const SMOKE_INTERVAL = 0.08;
/** Trail sparks per second. */
const SPARK_RATE = 120;
/** Burst power announced on the game event bus when the rocket bursts. */
const BURST_POWER = 0.7;
/** Shapes the rocket can burst into. */
const STYLES: BurstStyle[] = ['peony', 'willow', 'crackle', 'ring'];
/** Willow bursts use the gold palette, which reads as the classic drooping gold. */
const GOLD_INDEX = 2;
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

/** Rocket: flies its body out of the bottle, trails smoke and sparks, and bursts in the sky. */
export class Rocket extends Cracker {
  /** The flying body, or null before ignition and after the burst. */
  private body: THREE.Group | null = null;
  /** Unit direction of the flight path, set once at ignition. */
  private readonly flightDir = new THREE.Vector3();
  /** Direction the trail sparks are thrown, which is back down the flight path. */
  private readonly trailDir = new THREE.Vector3();
  /** Current speed in m/s, ramped up to the top speed. */
  private speed = 0;
  /** Distance flown so far, in metres. */
  private travelled = 0;
  /** The whoosh that follows the body, stopped when the rocket bursts. */
  private whoosh: SoundHandle | null = null;
  /** Seconds since the last smoke puff. */
  private smokeAcc = 0;
  /** Fractional trail-spark count carried between frames. */
  private sparkAcc = 0;
  /** Scratch vector for the body's world position at ignition. */
  private readonly worldPos = new THREE.Vector3();

  /** Builds the rocket around its model, bottle and all; the flight starts when the fuse runs out. */
  constructor(fx: FxContext, model: THREE.Group) {
    super('rocket', fx, model);
  }

  /** Lifts the body out of the bottle and starts the flight and its whoosh. */
  protected onIgnite(): void {
    this.detachBody();
    // A slightly random tilt, so no two rockets fly the same path.
    const az = Math.random() * TAU;
    const tilt = Math.random() * TILT_MAX;
    this.flightDir.set(Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az));
    this.trailDir.copy(this.flightDir).negate();
    this.body?.quaternion.setFromUnitVectors(UP, this.flightDir);
    if (this.body) this.whoosh = this.fx.audio.play('whoosh', this.body.position, { duration: FLIGHT_SECONDS });
  }

  /** Flies the body up, trails it, and bursts it at 1.6 s or 40 m. */
  protected onActive(dt: number): boolean {
    // onIgnite always runs first and creates the body, so a missing body means the flight is already over.
    const body = this.body;
    if (!body) return true;
    if (this.activeTime >= FLIGHT_SECONDS || this.travelled >= MAX_RANGE) {
      this.burstAndRelease();
      return true;
    }

    // Speed ramps up to the top speed, then holds it; the body moves along the flight path.
    this.speed = Math.min(TOP_SPEED, this.speed + ACCEL * dt);
    const step = this.speed * dt;
    body.position.addScaledVector(this.flightDir, step);
    this.travelled += step;
    this.whoosh?.setPosition(body.position);
    this.trail(dt, body.position);
    return false;
  }

  /** Frees the flying body and stops the whoosh on top of the base cleanup, in case it is removed mid-flight. */
  override dispose(): void {
    this.whoosh?.stop();
    this.whoosh = null;
    this.releaseBody();
    super.dispose();
  }

  /**
   * Moves the rocket body out of the bottle: a new group takes every part except the bottle, at the rocket's
   * world position, so the bottle stays on the ground and the body is free to fly.
   */
  private detachBody(): void {
    this.object.updateWorldMatrix(true, false);
    this.object.getWorldPosition(this.worldPos);
    const body = new THREE.Group();
    body.position.copy(this.worldPos);
    // Copy the list first, because add() takes each child out of this.object.children as it goes.
    for (const child of [...this.object.children]) {
      if (child.name !== BOTTLE_NAME) body.add(child);
    }
    this.fx.scene.add(body);
    this.body = body;
  }

  /** Throws a light smoke puff and a spark stream backwards from the body at the given rates. */
  private trail(dt: number, at: THREE.Vector3): void {
    this.smokeAcc += dt;
    if (this.smokeAcc >= SMOKE_INTERVAL) {
      this.smokeAcc -= SMOKE_INTERVAL;
      this.fx.smoke.puff(at, { count: 1, size: 0.25, life: 1.5, rise: 0.3, color: 0xb8b2a8 });
    }

    this.sparkAcc += SPARK_RATE * dt;
    const n = Math.floor(this.sparkAcc);
    if (n > 0) {
      this.sparkAcc -= n;
      this.fx.sparks.emit({
        position: at,
        direction: this.trailDir,
        speed: [1, 2.5],
        spread: 0.3,
        count: n,
        colors: [0xffb347, 0xffe0a0],
        life: [0.2, 0.5],
        size: [0.01, 0.02],
      });
    }
  }

  /**
   * Bursts the rocket where its body is now: a random shape and palette (willow always takes gold), the burst event
   * at that point in the sky, the whoosh stopped, and the body freed.
   */
  private burstAndRelease(): void {
    const body = this.body;
    if (!body) return;
    const style = STYLES[Math.floor(Math.random() * STYLES.length)];
    const palette = style === 'willow' ? SKY_PALETTES[GOLD_INDEX] : SKY_PALETTES[Math.floor(Math.random() * SKY_PALETTES.length)];
    aerialBurst(this.fx, body.position, style, palette);
    // The event is at the burst point in the sky, not the bottle on the ground, so lighting reacts where the light is.
    events.emit('burst', { x: body.position.x, y: body.position.y, z: body.position.z, power: BURST_POWER });
    this.whoosh?.stop();
    this.whoosh = null;
    this.releaseBody();
  }

  /** Removes the flying body from the scene and frees its per-instance geometry; materials are shared and kept. */
  private releaseBody(): void {
    if (!this.body) return;
    this.body.removeFromParent();
    this.body.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.body = null;
  }
}
