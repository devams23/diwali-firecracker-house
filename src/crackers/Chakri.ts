// Chakri (spinning wheel): a paper wheel pinned to the ground. It ramps up over half a second to 20 to 28 revolutions
// a second, wobbling and wandering across the takht in curving paths and sometimes hopping. Two opposite nozzles on
// its rim throw tangential sparks, whose colour cycles gold, emerald, rose and back to gold over its life. A bright
// additive ring at the wheel's radius reads as a blazing disc, a warm ground light flickers with it, and a final
// sputter ends the spin. It lasts seven seconds and is kept on the floor by clampPlacement, turning back at the edges.
import * as THREE from 'three';
import { Cracker } from './Cracker';
import { clampPlacement } from './placement';
import type { FxContext } from '../fx/FxContext';

/** How long the wheel spins after ignition, in seconds. */
const CHAKRI_SECONDS = 7;
/** Revolutions per second the wheel reaches, picked per wheel between these bounds. */
const REV_MIN = 20;
const REV_MAX = 28;
/** Seconds for the spin to ramp up to its top rate. */
const SPIN_RAMP = 0.5;
/** Seconds at the end over which the sparks sputter, stuttering on and off. */
const FINAL_SPUTTER = 0.6;
/** Walking speed across the floor, in m/s. */
const WANDER_SPEED = 0.45;
/** Maximum change of heading per second, in radians, for the random walk. */
const TURN_RATE = 2.2;
/** Rate at which the heading curves in a slow sine, in rad/s, which makes the paths curve rather than zigzag. */
const CURVE_RATE = 1.1;
/** Radius of the rim where sparks leave, in metres; the chakri is about 7 cm across. */
const RIM_RADIUS = 0.035;
/** Height of the rim above the floor, in metres. */
const RIM_HEIGHT = 0.02;
/** Sparks per second at full spin, split between the two nozzles. */
const SPARK_RATE = 1000;
/** Radius of the glowing ring that sits above the wheel, in metres, and its height above the floor. */
const GLOW_RADIUS = 0.042;
const GLOW_HEIGHT = 0.03;
/** Largest tilt of the wheel while it wobbles, in radians. */
const WOBBLE_TILT = 0.06;
/** Wobble frequency in Hz. */
const WOBBLE_HZ = 3.1;
/** Hops: how long each takes, the height range, and the gap between them in seconds. */
const HOP_SECONDS = 0.32;
const HOP_HEIGHT: [number, number] = [0.02, 0.04];
const HOP_GAP: [number, number] = [1.2, 2.2];
/** Seconds between warm-light flickers on the ground. */
const FLASH_INTERVAL = 0.12;
/** Colours of the spark cycle, as hex numbers: gold, emerald, rose. */
const GOLD = 0xffc24a;
const EMERALD = 0x2fcf7a;
const ROSE = 0xff4f7a;
/** Warm light colour and its brightness range and reach. */
const LIGHT_COLOR = 0xffa040;
const LIGHT_INTENSITY: [number, number] = [0.8, 1.4];
const LIGHT_DISTANCE = 3.5;
const TAU = Math.PI * 2;

/**
 * Spark colour at a fraction `f` of the wheel's life: gold at the start, then emerald, then rose, then gold again at
 * the end. The fraction is clamped to 0..1, and each leg is a straight blend between two of the colours.
 */
export function chakriPhaseColor(f: number): number {
  const x = Math.min(1, Math.max(0, f)) * 3;
  const leg = Math.min(2, Math.floor(x));
  const u = x - leg;
  const from = [GOLD, EMERALD, ROSE][leg];
  const to = [EMERALD, ROSE, GOLD][leg];
  return blendHex(from, to, u);
}

/** Straight blend of two hex colours, channel by channel, with `u` in 0..1 from `a` to `b`. */
function blendHex(a: number, b: number, u: number): number {
  const r = Math.round(((a >> 16) & 0xff) + (((b >> 16) & 0xff) - ((a >> 16) & 0xff)) * u);
  const g = Math.round(((a >> 8) & 0xff) + (((b >> 8) & 0xff) - ((a >> 8) & 0xff)) * u);
  const bl = Math.round((a & 0xff) + ((b & 0xff) - (a & 0xff)) * u);
  return (r << 16) | (g << 8) | bl;
}

/**
 * Spin rate in rad/s at `t` seconds after ignition: a linear ramp to the top revolutions per second over `ramp`
 * seconds, then held. A top rate of 24 rev/s is 2π × 24 rad/s.
 */
export function spinRate(revPerSecond: number, t: number, ramp: number): number {
  return TAU * revPerSecond * Math.min(1, Math.max(0, t) / ramp);
}

/**
 * Height of a hop at `u` through it, where u runs from 0 at take-off to 1 at landing. A parabola: zero at both ends,
 * `height` at the top. Values outside 0..1 are on the ground.
 */
export function hopOffset(u: number, height: number): number {
  if (u <= 0 || u >= 1) return 0;
  return 4 * height * u * (1 - u);
}

/** Shared glow texture and material, made the first time a chakri is lit so they are not rebuilt per wheel. */
let glowTexture: THREE.CanvasTexture | null = null;
let glowMaterial: THREE.MeshBasicMaterial | null = null;

/**
 * The shared additive material for the rim glow: a radial gradient that is dark in the middle, bright at the rim
 * and fades out past it, so the spinning wheel reads as one blazing ring.
 */
function glowMat(): THREE.MeshBasicMaterial {
  if (glowMaterial) return glowMaterial;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,200,90,0)');
    grad.addColorStop(0.55, 'rgba(255,190,80,0)');
    grad.addColorStop(0.8, 'rgba(255,230,150,1)');
    grad.addColorStop(0.93, 'rgba(255,150,70,0.5)');
    grad.addColorStop(1, 'rgba(255,120,50,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  glowTexture = new THREE.CanvasTexture(canvas);
  glowMaterial = new THREE.MeshBasicMaterial({
    map: glowTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return glowMaterial;
}

/** Chakri: a ground wheel that spins and wanders, throwing phased sparks from two rim nozzles and glowing as a disc. */
export class Chakri extends Cracker {
  /** Current heading of the random walk, in radians around the vertical axis. */
  private heading = Math.random() * TAU;
  /** Phase of the slow curve in the walk, so no two wheels curve the same way. */
  private readonly curvePhase = Math.random() * TAU;
  /** Top spin rate of this wheel, in revolutions per second. */
  private readonly revPerSecond = REV_MIN + Math.random() * (REV_MAX - REV_MIN);
  /** Current spin rate in rad/s, ramped up after ignition. */
  private spin = 0;
  /** Accumulated spin angle of the wheel, in radians, added to its starting yaw. */
  private angle = 0;
  /** Fractional spark count carried between frames. */
  private sparkAcc = 0;
  /** Starting yaw and floor height, both set by the factory before ignition. */
  private baseYaw = 0;
  private groundY = 0;
  /** Time of the next hop and the start of the hop in progress, in seconds since ignition. */
  private nextHop = 0;
  private hopStart = -1;
  private hopHeight = 0;
  /** Seconds since the last warm-light flicker. */
  private flashAcc = 0;
  /** The rim glow, which sits above the wheel and rides its tilt. */
  private glow: THREE.Mesh | null = null;
  /** Scratch vectors, reused so sparks and the walk do not allocate. */
  private readonly rimPos = new THREE.Vector3();
  private readonly nozzle = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly lightPos = new THREE.Vector3();
  /** One-element colour list, reused for each emit so the phase colour needs no new array. */
  private readonly colorBuf: number[] = [GOLD];

  /** Builds the chakri around its model; spinning starts when the fuse runs out. */
  constructor(fx: FxContext, model: THREE.Group) {
    super('chakri', fx, model);
  }

  /** Starts the whistle and fizz, adds the glowing rim, and records the wheel's starting yaw and floor height. */
  protected onIgnite(): void {
    this.baseYaw = this.object.rotation.y;
    this.groundY = this.object.position.y;
    this.object.getWorldPosition(this.rimPos);
    this.nextHop = HOP_GAP[0] + Math.random() * (HOP_GAP[1] - HOP_GAP[0]);
    this.fx.audio.play('whistle', this.rimPos, { duration: CHAKRI_SECONDS });
    this.fx.audio.play('fizz', this.rimPos, { duration: CHAKRI_SECONDS });

    // The glow is a flat ring just above the wheel, sized to the rim so it reads as the spinning edge.
    const geo = new THREE.CircleGeometry(GLOW_RADIUS, 40);
    geo.rotateX(-Math.PI / 2);
    this.glow = new THREE.Mesh(geo, glowMat());
    this.glow.position.y = GLOW_HEIGHT;
    this.object.add(this.glow);
  }

  /** Spins, wobbles, hops, wanders, throws phased rim sparks and flickers its light; ends after seven seconds. */
  protected onActive(dt: number): boolean {
    const t = this.activeTime;
    if (t >= CHAKRI_SECONDS) return true;
    const ramp = Math.min(1, t / SPIN_RAMP);

    // Spin: ramps to the top rate for this wheel, then holds it.
    this.spin = spinRate(this.revPerSecond, t, SPIN_RAMP);
    this.angle += this.spin * dt;

    // Wobble and hops: the wheel tilts a little as it turns and lifts off the floor now and then.
    const wob = WOBBLE_TILT * ramp;
    this.object.rotation.set(
      wob * Math.sin(t * TAU * WOBBLE_HZ),
      this.baseYaw + this.angle,
      wob * Math.cos(t * TAU * WOBBLE_HZ * 0.8),
    );
    this.hop(t);
    this.object.position.y = this.groundY + hopOffset(this.hopStart < 0 ? 0 : (t - this.hopStart) / HOP_SECONDS, this.hopHeight);

    if (this.glow) {
      // The glow pulses very slightly in size, so the disc looks like it is blazing rather than static.
      const pulse = 1 + 0.06 * Math.sin(t * 40);
      this.glow.scale.set(pulse, 1, pulse);
    }

    this.wander(dt);
    this.emitRimSparks(dt);
    this.flickerLight(dt);
    return false;
  }

  /** Starts a hop when its time comes, and clears it once it has landed. */
  private hop(t: number): void {
    if (this.hopStart >= 0 && t - this.hopStart >= HOP_SECONDS) this.hopStart = -1;
    if (this.hopStart < 0 && t >= this.nextHop && t >= SPIN_RAMP) {
      this.hopStart = t;
      this.hopHeight = HOP_HEIGHT[0] + Math.random() * (HOP_HEIGHT[1] - HOP_HEIGHT[0]);
      this.nextHop = t + HOP_GAP[0] + Math.random() * (HOP_GAP[1] - HOP_GAP[0]);
    }
  }

  /** Random-walks the wheel across the floor along a gently curving path, turning it back at the edges of the takht. */
  private wander(dt: number): void {
    this.heading += (Math.random() - 0.5) * 2 * TURN_RATE * dt;
    this.heading += Math.sin(this.activeTime * 0.9 + this.curvePhase) * CURVE_RATE * dt;
    const pos = this.object.position;
    const nx = pos.x + Math.sin(this.heading) * WANDER_SPEED * dt;
    const nz = pos.z + Math.cos(this.heading) * WANDER_SPEED * dt;
    const c = clampPlacement(nx, nz);
    // Hitting the edge reverses the heading so the wheel turns back rather than sticking to the wall.
    if (c.x !== nx || c.z !== nz) this.heading += Math.PI;
    pos.x = c.x;
    pos.z = c.z;
  }

  /**
   * Throws sparks from the two opposite rim nozzles, each along the rim's tangent so they fly off like a spinning
   * wheel. The colour follows the wheel's phase; during the final sputter the rate stutters on and off.
   */
  private emitRimSparks(dt: number): void {
    const t = this.activeTime;
    const ramp = Math.min(1, t / SPIN_RAMP);
    // The nozzles are read from the world matrix, so it must reflect this frame's spin, not the last render.
    this.object.updateWorldMatrix(true, false);
    let rate = SPARK_RATE * ramp;
    const sputtering = t >= CHAKRI_SECONDS - FINAL_SPUTTER;
    if (sputtering) rate *= Math.random() < 0.5 ? 0 : 1.8;
    this.sparkAcc += rate * dt;
    const n = Math.floor(this.sparkAcc);
    if (n <= 0) return;
    this.sparkAcc -= n;

    // Rim velocity: the rim point at local +x moves along local -z, and the one at -x along +z.
    const rimSpeed = Math.abs(this.spin) * RIM_RADIUS;
    const colour = chakriPhaseColor(t / CHAKRI_SECONDS);
    this.colorBuf[0] = colour;
    const half = Math.ceil(n / 2);
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? 1 : -1;
      this.nozzle.set(sign * RIM_RADIUS, RIM_HEIGHT, 0);
      this.object.localToWorld(this.nozzle);
      this.dir.set(0, 0, -sign).applyQuaternion(this.object.quaternion);
      this.fx.sparks.emit({
        position: this.nozzle,
        direction: this.dir,
        speed: rimSpeed * (0.8 + Math.random() * 0.4),
        spread: 0.45,
        count: half,
        colors: this.colorBuf,
        life: [0.4, 0.9],
        size: [0.018, 0.03],
        drag: 0.6,
        crackle: true,
      });
    }
  }

  /** Flickers a warm point light on the ground at the wheel, at a fixed rate so the light stays in budget. */
  private flickerLight(dt: number): void {
    this.flashAcc += dt;
    if (this.flashAcc < FLASH_INTERVAL) return;
    this.flashAcc -= FLASH_INTERVAL;
    this.object.getWorldPosition(this.lightPos);
    this.lightPos.y += 0.03;
    const k = LIGHT_INTENSITY[0] + Math.random() * (LIGHT_INTENSITY[1] - LIGHT_INTENSITY[0]);
    this.fx.flashes.flash(this.lightPos, LIGHT_COLOR, k, LIGHT_DISTANCE, FLASH_INTERVAL + 0.04);
  }

  /** On top of the base cleanup: frees the glow's own geometry, keeping the shared material and texture. */
  override dispose(): void {
    this.glow = null;
    super.dispose();
  }
}
