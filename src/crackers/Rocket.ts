// Rocket: a rocket tube on a bamboo stick, standing in its green bottle on the ground. When the fuse runs out the
// rocket body pulls out of the bottle (the bottle stays behind) and sputters at the mouth for 0.3 s. Then it
// whooshes off along a slightly tilted path with a small wobble, accelerating to 35 m/s and trailing a dense gold
// spark stream with a hot glowing head and a brief flash at launch. At a random apex of 30 to 38 m it bursts in one
// of five shapes (peony, chrysanthemum, ring, crossette or palm) in a festive colour pair. The flying body is built
// per cracker and freed when it bursts; the shared label and body materials stay.
import * as THREE from 'three';
import { Cracker } from './Cracker';
import type { FxContext } from '../fx/FxContext';
import type { SoundHandle } from '../audio/AudioEngine';
import { BOTTLE_NAME } from '../items/crackerModels';
import { aerialBurst, FESTIVE_PALETTES, type BurstStyle } from '../fx/aerialBurst';
import { events } from '../core/events';

/** Seconds of pre-ignition sputter at the bottle mouth before the rocket leaves. */
export const SPUTTER_SECONDS = 0.3;
/** Longest the flight may last before the rocket bursts anyway, in seconds. */
const FLIGHT_CAP = 3;
/** Lowest and highest apex the rocket can burst at, in metres of flight. */
const APEX_MIN = 30;
const APEX_MAX = 38;
/** Top speed of the rocket, in m/s. */
const TOP_SPEED = 35;
/** Acceleration on the way up, in m/s². */
const ACCEL = 30;
/** Largest tilt of the flight path away from straight up, in radians. */
const TILT_MAX = 0.12;
/** Sideways wobble of the body in flight, in metres, and its angular rate in rad/s. */
const WOBBLE_AMP = 0.1;
const WOBBLE_RATE = 9;
/** Seconds of flight over which the wobble grows from nothing. */
const WOBBLE_RAMP = 0.4;
/** Seconds between smoke puffs along the trail. */
const SMOKE_INTERVAL = 0.1;
/** Trail sparks per second: dense enough to read as a gold stream. */
const TRAIL_RATE = 420;
/** Sparks per frame in the hot glowing head. */
const HEAD_PER_FRAME = 2;
/** Bright sparks laid along each frame's flight segment, so the ascent reads as one continuous gold streak. */
const STREAK_PER_FRAME = 7;
/** Distance from the camera, in metres, at which the streak and head sparks reach their full size. */
const STREAK_FULL_DISTANCE = 30;
/** Sparks per second in the sputter at the mouth, before the rocket leaves. */
const SPUTTER_RATE = 220;
/** Trail and head colours: gold and hot white-gold. */
const TRAIL_COLORS = [0xffb83a, 0xffd36a, 0xfff0b8];
const HEAD_COLORS = [0xfff4d0, 0xffe08a];
/** Colours of the continuous streak: saturated gold up to hot yellow. */
const STREAK_COLORS = [0xffb02e, 0xffc94a, 0xffe27a];
/** Launch flash: gold, with a short reach and duration. */
const LAUNCH_FLASH_COLOR = 0xffc24a;
const LAUNCH_FLASH_INTENSITY = 14;
const LAUNCH_FLASH_DISTANCE = 30;
const LAUNCH_FLASH_SECONDS = 0.3;
/** Burst power announced on the game event bus when the rocket bursts. */
const BURST_POWER = 0.7;
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

/** The five shapes a rocket can burst into. */
export const ROCKET_STYLES: BurstStyle[] = ['peony', 'chrysanthemum', 'ring', 'crossette', 'palm'];

/**
 * Picks the burst shape for a rocket from a unit random number, so each shape is equally likely. Values at or above
 * 1 give the last shape rather than running off the list.
 */
export function pickRocketStyle(u: number): BurstStyle {
  const i = Math.min(ROCKET_STYLES.length - 1, Math.max(0, Math.floor(u * ROCKET_STYLES.length)));
  return ROCKET_STYLES[i];
}

/** Picks one festive colour pair from a unit random number, so each pair is equally likely. */
export function pickFestivePalette(u: number): number[] {
  const i = Math.min(FESTIVE_PALETTES.length - 1, Math.max(0, Math.floor(u * FESTIVE_PALETTES.length)));
  return FESTIVE_PALETTES[i];
}

/** Picks the apex of a rocket's flight, in metres, from a unit random number, within the 30 to 38 m band. */
export function pickApex(u: number): number {
  return APEX_MIN + (APEX_MAX - APEX_MIN) * Math.min(1, Math.max(0, u));
}

/** Rocket: sputters, flies its body out of the bottle, trails sparks and smoke, and bursts at its apex in the sky. */
export class Rocket extends Cracker {
  /** The flying body, or null before ignition and after the burst. */
  private body: THREE.Group | null = null;
  /** Unit direction of the flight path, set once at ignition. */
  private readonly flightDir = new THREE.Vector3();
  /** Direction the trail sparks are thrown, which is back down the flight path. */
  private readonly trailDir = new THREE.Vector3();
  /** Where the body is on its straight flight path, before the wobble is added. */
  private readonly basePos = new THREE.Vector3();
  /** Scratch position for each streak spark along the frame's path, reused every frame. */
  private readonly streakPos = new THREE.Vector3();
  /** Scratch vector for the camera position, used to scale the streak by distance. */
  private readonly eyePos = new THREE.Vector3();
  /** Scratch direction for the sputter sparks, reused every frame. */
  private readonly sputterDir = new THREE.Vector3();
  /** Current speed in m/s, ramped up to the top speed. */
  private speed = 0;
  /** Distance flown so far, in metres. */
  private travelled = 0;
  /** Height at which this rocket bursts, in metres, picked at ignition. */
  private apex = APEX_MAX;
  /** Seconds since launch; zero until the sputter ends. */
  private flightTime = 0;
  /** Whether the body has left the mouth; set once when the sputter ends. */
  private launched = false;
  /** The whoosh that follows the body, stopped when the rocket bursts. */
  private whoosh: SoundHandle | null = null;
  /** Seconds since the last smoke puff. */
  private smokeAcc = 0;
  /** Fractional trail-spark count carried between frames. */
  private sparkAcc = 0;
  /** Fractional sputter-spark count carried between frames. */
  private sputterAcc = 0;
  /** Seconds since the last sputter flash, so the mouth flickers rather than glowing steadily. */
  private sputterFlash = 0;
  /** Scratch vector for the body's world position at ignition. */
  private readonly worldPos = new THREE.Vector3();

  /** Builds the rocket around its model, bottle and all; the flight starts when the fuse runs out. */
  constructor(fx: FxContext, model: THREE.Group) {
    super('rocket', fx, model);
  }

  /** Lifts the body out of the bottle and sets its path and apex; the sputter starts at the mouth. */
  protected onIgnite(): void {
    this.detachBody();
    // A slightly random tilt, so no two rockets fly the same path.
    const az = Math.random() * TAU;
    const tilt = Math.random() * TILT_MAX;
    this.flightDir.set(Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az));
    this.trailDir.copy(this.flightDir).negate();
    this.apex = pickApex(Math.random());
    if (this.body) {
      this.basePos.copy(this.body.position);
      this.body.quaternion.setFromUnitVectors(UP, this.flightDir);
    }
    // Launch flash: the mouth lights up as the rocket is set off.
    if (this.body) this.fx.flashes.flash(this.body.position, LAUNCH_FLASH_COLOR, LAUNCH_FLASH_INTENSITY, LAUNCH_FLASH_DISTANCE, LAUNCH_FLASH_SECONDS);
  }

  /** Sputters, then flies the body up, trails it, and bursts it at its apex or after the flight cap. */
  protected onActive(dt: number): boolean {
    // onIgnite always runs first and creates the body, so a missing body means the flight is already over.
    const body = this.body;
    if (!body) return true;

    if (this.activeTime < SPUTTER_SECONDS) {
      this.sputter(dt, body.position);
      return false;
    }
    if (!this.launched) {
      this.launched = true;
      this.whoosh = this.fx.audio.play('whoosh', body.position, { duration: FLIGHT_CAP });
    }
    if (this.flightTime >= FLIGHT_CAP || this.travelled >= this.apex) {
      this.burstAndRelease();
      return true;
    }

    // Speed ramps up to the top speed, then holds it; the body moves along the flight path.
    this.flightTime += dt;
    this.speed = Math.min(TOP_SPEED, this.speed + ACCEL * dt);
    const step = this.speed * dt;
    this.basePos.addScaledVector(this.flightDir, step);
    this.travelled += step;

    // The body wobbles sideways, a little more each moment, so the flight is not a ruler-straight line.
    const ramp = Math.min(1, this.flightTime / WOBBLE_RAMP);
    body.position.set(
      this.basePos.x + Math.sin(this.flightTime * WOBBLE_RATE) * WOBBLE_AMP * ramp,
      this.basePos.y,
      this.basePos.z + Math.cos(this.flightTime * WOBBLE_RATE * 0.73) * WOBBLE_AMP * ramp,
    );
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

  /**
   * The pre-launch sputter: a flickering spray of gold sparks from the mouth, with the body trembling a hair's width
   * in the bottle, before it leaves.
   */
  private sputter(dt: number, at: THREE.Vector3): void {
    this.sputterFlash += dt;
    if (this.sputterFlash >= 0.07) {
      this.sputterFlash = 0;
      this.fx.flashes.flash(at, LAUNCH_FLASH_COLOR, 0.8 + Math.random() * 0.6, 4, 0.08);
    }
    this.sputterAcc += SPUTTER_RATE * dt;
    const n = Math.floor(this.sputterAcc);
    if (n > 0) {
      this.sputterAcc -= n;
      this.sputterDir.set((Math.random() - 0.5) * 0.6, 1, (Math.random() - 0.5) * 0.6).normalize();
      this.fx.sparks.emit({
        position: at,
        direction: this.sputterDir,
        speed: [1, 3],
        spread: 0.5,
        count: n,
        colors: TRAIL_COLORS,
        life: [0.2, 0.45],
        size: [0.018, 0.028],
        crackle: true,
      });
    }
  }

  /**
   * Throws a light smoke puff, a dense gold spark stream backwards from the body, and a hot glowing head at the
   * body's nose. The stream sparks drift and crackle; the head is a few extra-large sparks each frame.
   */
  private trail(dt: number, at: THREE.Vector3): void {
    // Smoke is kept small and thin: a faint warm wisp behind the streak, not grey blobs.
    this.smokeAcc += dt;
    if (this.smokeAcc >= SMOKE_INTERVAL) {
      this.smokeAcc -= SMOKE_INTERVAL;
      this.fx.smoke.puff(at, { count: 1, size: 0.12, life: 0.9, rise: 0.2, color: 0xa89c88 });
    }

    // The streak: bright gold sparks placed at even steps back along this frame's path (body speed times dt), so
    // there are no gaps between frames however fast the rocket flies.
    const stride = this.speed * dt;
    // Near the ground the streak is a few metres from the player, so its sparks shrink with closeness to the camera.
    this.fx.camera.getWorldPosition(this.eyePos);
    const near = Math.min(1, Math.max(0.12, this.eyePos.distanceTo(at) / STREAK_FULL_DISTANCE));
    for (let k = 0; k < STREAK_PER_FRAME; k++) {
      const back = (k / STREAK_PER_FRAME) * stride;
      this.streakPos.copy(at).addScaledVector(this.flightDir, -back);
      this.fx.sparks.emit({
        position: this.streakPos,
        direction: this.trailDir,
        speed: [0.2, 1],
        spread: 0.5,
        count: 1,
        colors: STREAK_COLORS,
        life: [0.45, 0.8],
        size: [0.22 * near, 0.32 * near],
        gravity: 1.5,
        drag: 2,
        crackle: true,
      });
    }

    // A thinner scatter of sparks thrown backwards, which fall away from the streak as glittering embers.
    this.sparkAcc += TRAIL_RATE * dt;
    const n = Math.floor(this.sparkAcc);
    if (n > 0) {
      this.sparkAcc -= n;
      this.fx.sparks.emit({
        position: at,
        direction: this.trailDir,
        speed: [1.5, 4],
        spread: 0.35,
        count: n,
        colors: TRAIL_COLORS,
        life: [0.4, 0.9],
        size: [0.1 * near, 0.18 * near],
        gravity: 3,
        drag: 1.5,
        crackle: true,
      });
    }

    // The hot head: a few very large, white-gold sparks where the body is.
    this.fx.sparks.emit({
      position: at,
      speed: [0, 0.2],
      spread: Math.PI,
      count: HEAD_PER_FRAME,
      colors: HEAD_COLORS,
      life: [0.06, 0.1],
      size: [0.55 * near, 0.8 * near],
    });
  }

  /**
   * Bursts the rocket where its body is now: a random shape and a festive colour pair, the burst event at that
   * point in the sky, the whoosh stopped, and the body freed. 
   */
  private burstAndRelease(): void {
    const body = this.body;
    if (!body) return;
    const style = pickRocketStyle(Math.random());
    const palette = pickFestivePalette(Math.random());
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
