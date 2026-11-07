// A stylised villager for the aangan: a faceless capsule torso, sphere head and simple cylinder limbs in flat,
// muted clothes. Each one breathes and sways slowly at idle, can cheer (arms up with a small hop), and the kids
// walk a small loop holding a sparkler that throws gold sparks through the shared spark system. Geometry and
// materials are built once at module level and shared by every villager.
import * as THREE from 'three';
import type { Updatable } from '../core/Engine';
import { PALETTE } from '../core/palette';
import type { EmitOptions } from '../fx/SparkSystem';
import type { FxContext } from '../fx/FxContext';

/** Height, in metres, the figure geometry is built at; each villager is scaled from this. */
const REF_HEIGHT = 1.6;
/** Hip height of a standing figure above the floor, in metres. */
const HIP_STAND = 0.78;
/** Top of the charpai weave (props.ts: rail at 0.44 plus 0.026), the seat a sitting villager rests on. */
const SEAT_TOP = 0.466;
/** Radius of a thigh, which lies flat on the weave in the cross-legged pose. */
const THIGH_R = 0.07;
/** Hip height of a cross-legged figure: thighs rest flat on the weave with a little clearance above it. */
const HIP_SIT = SEAT_TOP + THIGH_R + 0.02;
/** Torso centre above the hip. */
const TORSO_UP = 0.27;
const TORSO_RADIUS = 0.17;
const TORSO_LENGTH = 0.36;
/** Head centre above the hip. */
const HEAD_UP = 0.72;
const HEAD_RADIUS = 0.11;
/** Shoulder height above the hip, and the shoulder's sideways offset from the centre line. */
const SHOULDER_UP = 0.54;
const SHOULDER_X = 0.22;
const ARM_LENGTH = 0.55;
/** Sideways offset of each hip from the centre line. */
const LEG_X = 0.09;
/** Length of a seated thigh, which points forward from the hip. */
const THIGH_LENGTH = 0.42;
/** Length of a cross-legged shin, which lies flat from the knee across the front. */
const SHIN_LENGTH = 0.5;
/** Sideways offset of each shin's centre from its hip, toward the centre line, so the two shins cross. */
const SHIN_CENTRE_X = 0.21;
/** Height the right shin lies above the left, so the two shins cross rather than intersect. */
const SHIN_STACK = 0.14;
/** Height of a saree skirt, from the floor up to the waist. */
const SKIRT_H = 0.72;
/** Length of the sparkler stick held in the hand, in metres. */
const STICK_LENGTH = 0.18;

/** Length of one cheer, in seconds. */
export const CHEER_SECONDS = 0.6;
/** Height of the hop at the peak of a cheer, in metres. */
const CHEER_HOP = 0.15;
/** Arm angle in radians, from hanging straight down, when the arms are fully raised overhead. */
const ARM_UP = 2.9;
/** Idle arm angle in radians: a little away from the body, so the arms do not clip the torso. */
const ARM_IDLE = 0.12;

/** Walking speed of a kid around the loop, in metres per second. */
const WALK_SPEED = 0.6;
/** Rate the gait advances while walking, in radians per second. */
const GAIT_RATE = 6;
/** Peak leg swing while walking, in radians. */
const LEG_SWING = 0.35;
/** A kid stops walking when the player is closer than this, in metres. */
export const KID_PAUSE_METRES = 1;

/** Breath amplitude as a fraction of the torso height, and its rate in radians per second. */
const BREATH_AMOUNT = 0.012;
const BREATH_RATE = 1.6;
/** Sway amplitude about the feet in radians, and its rate in radians per second. */
const SWAY_AMOUNT = 0.01;
const SWAY_RATE = 0.5;

/** Sparks per second from a lit sparkler. */
const SPARK_RATE = 40;
/** Gold sparkler colours: warm, not glowing, since the sparks are the only light-like effect here. */
const SPARK_COLORS = [0xffd27a, 0xfff0b8, 0xffb347];

/** Clamps a cheer progress value into the 0 to 1 range. */
function clamp01(progress: number): number {
  return Math.min(1, Math.max(0, progress));
}

/**
 * Arm raise for a cheer at `progress` (0 to 1 across the cheer): 0 at rest, rising to 1 fully overhead at the
 * middle of the cheer, and back to 0 at its end. Outside the cheer it is 0.
 */
export function cheerArms(progress: number): number {
  return Math.sin(Math.PI * clamp01(progress));
}

/**
 * Hop height in metres at cheer `progress`: one smooth rise and fall over the cheer, peaking at CHEER_HOP.
 * It is 0 at both ends, so the villager lands exactly where it stood.
 */
export function cheerHop(progress: number): number {
  return CHEER_HOP * Math.sin(Math.PI * clamp01(progress));
}

/**
 * True if a walking kid may keep walking: the player is at least KID_PAUSE_METRES away. Closer than that, the kid
 * stops and waits until the player steps back.
 */
export function kidMoves(distanceToPlayer: number): boolean {
  return distanceToPlayer >= KID_PAUSE_METRES;
}

/** Geometry shared by every villager, built once. All sizes are for the reference height of REF_HEIGHT. */
const GEO = {
  torso: new THREE.CapsuleGeometry(TORSO_RADIUS, TORSO_LENGTH, 4, 10),
  head: new THREE.SphereGeometry(HEAD_RADIUS, 14, 10),
  /** Top half of a sphere a little larger than the head, worn as a dupatta over the crown. */
  hood: new THREE.SphereGeometry(HEAD_RADIUS * 1.15, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
  arm: new THREE.CylinderGeometry(0.05, 0.045, ARM_LENGTH, 8),
  leg: new THREE.CylinderGeometry(0.07, 0.065, HIP_STAND, 8),
  thigh: new THREE.CylinderGeometry(0.07, 0.07, THIGH_LENGTH, 8),
  shin: new THREE.CylinderGeometry(0.065, 0.06, SHIN_LENGTH, 8),
  skirt: new THREE.CylinderGeometry(0.17, 0.26, SKIRT_H, 14),
  /** Open-ended gold band at the hem of the saree. */
  band: new THREE.CylinderGeometry(0.265, 0.265, 0.04, 14, 1, true),
  stick: new THREE.CylinderGeometry(0.006, 0.006, STICK_LENGTH, 4),
};

/** Materials shared by every villager that are not clothes. Matte and non-emissive throughout. */
const MAT = {
  skin: new THREE.MeshStandardMaterial({ color: 0xb98a63, roughness: 0.85, metalness: 0 }),
  gold: new THREE.MeshStandardMaterial({ color: PALETTE.brass, roughness: 0.5, metalness: 0.3 }),
  stick: new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9, metalness: 0 }),
};

/** One matte material per clothes colour, created the first time a colour is used and then shared. */
const clothMats = new Map<number, THREE.MeshStandardMaterial>();

/** Returns the shared flat matte material for a clothes colour, creating it on first use. */
function clothMaterial(hex: number): THREE.MeshStandardMaterial {
  let mat = clothMats.get(hex);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.92, metalness: 0 });
    clothMats.set(hex, mat);
  }
  return mat;
}

/** Scratch vector holding the sparkler tip's world position for the spark emission; reused every frame. */
const tmpTip = new THREE.Vector3();
/** Emission settings for a sparkler, reused every frame: only the count changes. */
const SPARK_OPTS: EmitOptions = {
  position: tmpTip,
  speed: [0.4, 1.1],
  spread: 0.9,
  count: 0,
  colors: SPARK_COLORS,
  life: [0.25, 0.5],
  size: [0.012, 0.022],
  gravity: 2.5,
  drag: 1.5,
  crackle: true,
};

/** How a villager is built and what it does. */
export interface VillagerOptions {
  /** Standing height in metres. */
  height: number;
  /** Flat colour of the kurta, saree or clothes, as a hex number. */
  clothes: number;
  /** Colour of a dupatta over the head. When given, the figure wears a saree skirt with a gold band at the hem. */
  dupatta?: number;
  /** stand: still; sit: cross-legged on a charpai's weave; walkLoop: walks a circle around loopCenter. */
  pose: 'stand' | 'sit' | 'walkLoop';
  /** Centre of the walking loop, on the ground, for a walkLoop villager. */
  loopCenter?: THREE.Vector3;
  /** Radius of the walking loop in metres. */
  loopRadius?: number;
  /** Angle on the walking loop at the start, in radians. Defaults to 0, so two kids can start apart. */
  loopStart?: number;
  /** Holds a lit sparkler in the right hand, which throws sparks while it burns. */
  sparkler?: boolean;
}

/** A faceless villager figure with idle motion, a cheer, and for kids a looping walk with a sparkler. */
export class Villager implements Updatable {
  /** Root of the figure, scaled to its height. Its position is the floor point under the feet, lifted by any cheer hop. */
  readonly object = new THREE.Group();
  /** Idle sway pivot at the feet; the whole figure hangs from it. */
  private readonly sway = new THREE.Group();
  /** Chest, breathed gently in and out at idle. */
  private readonly torso: THREE.Mesh;
  /** Shoulder pivots, raised together for a cheer. */
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  /** Hip pivots, swung while a kid walks. */
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  /** Where a held sparkler's sparks come from, or null when this villager holds none. */
  private tip: THREE.Object3D | null = null;
  private readonly fx: FxContext;
  /** True for a kid who walks a loop. */
  private readonly walks: boolean;
  private readonly loopX: number;
  private readonly loopZ: number;
  private readonly loopR: number;
  /** Floor height the figure stands on, which the cheer hop is lifted from. */
  private baseY = 0;
  /** Angle on the walking loop, in radians. */
  private angle = 0;
  /** Phase of the leg swing, in radians. */
  private gait = 0;
  /** Seconds since the cheer started, or -1 when not cheering. */
  private cheerAge = -1;
  /** Fractional sparks carried between frames, so the emission rate holds at any frame rate. */
  private sparkAcc = 0;
  /** Random phase so no two villagers breathe or sway in step. */
  private readonly phase = Math.random() * Math.PI * 2;
  /** The player's live position, which a kid reads to pause near them; null when not set. */
  private player: THREE.Vector3 | null = null;

  /** Builds the figure at its height and pose, and places a walking kid on its loop. */
  constructor(o: VillagerOptions, fx: FxContext) {
    this.fx = fx;
    this.walks = o.pose === 'walkLoop';
    this.loopX = o.loopCenter?.x ?? 0;
    this.loopZ = o.loopCenter?.z ?? 0;
    this.loopR = o.loopRadius ?? 1;
    this.angle = o.loopStart ?? 0;
    this.object.scale.setScalar(o.height / REF_HEIGHT);
    this.object.add(this.sway);

    const hipY = o.pose === 'sit' ? HIP_SIT : HIP_STAND;
    const cloth = clothMaterial(o.clothes);

    // Chest and head. The head is a plain sphere with no features; a dupatta is a half-sphere over the crown.
    this.torso = new THREE.Mesh(GEO.torso, cloth);
    this.torso.position.y = hipY + TORSO_UP;
    const head = new THREE.Mesh(GEO.head, MAT.skin);
    head.position.y = hipY + HEAD_UP;
    this.sway.add(this.torso, head);

    if (o.dupatta !== undefined) {
      head.add(new THREE.Mesh(GEO.hood, clothMaterial(o.dupatta)));
      // Saree: a flat skirt to the floor, with a gold band along the hem.
      const skirt = new THREE.Mesh(GEO.skirt, cloth);
      skirt.position.y = SKIRT_H / 2;
      const band = new THREE.Mesh(GEO.band, MAT.gold);
      band.position.y = 0.03;
      this.sway.add(skirt, band);
    }

    // Arms hang from the shoulders, so a cheer can swing each pivot overhead.
    for (const [arm, side] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      arm.position.set(side * SHOULDER_X, hipY + SHOULDER_UP, 0);
      const limb = new THREE.Mesh(GEO.arm, cloth);
      limb.position.y = -ARM_LENGTH / 2;
      arm.add(limb);
      this.sway.add(arm);
    }
    if (o.sparkler) this.buildSparkler();

    // Legs are omitted under a saree, where the skirt covers them. A seated figure sits cross-legged.
    if (o.dupatta === undefined) {
      for (const [leg, side] of [
        [this.legL, -1],
        [this.legR, 1],
      ] as const) {
        leg.position.set(side * LEG_X, hipY, 0);
        if (o.pose === 'sit') {
          // Thigh: lies flat on the weave, pointing forward from the hip, so its underside rests on the seat.
          const thigh = new THREE.Mesh(GEO.thigh, cloth);
          thigh.rotation.x = Math.PI / 2;
          thigh.position.z = THIGH_LENGTH / 2;
          // Shin: lies flat from the knee across the front, toward the centre line. The right shin sits on top
          // of the left, so the two cross and neither passes through the cot.
          const shin = new THREE.Mesh(GEO.shin, cloth);
          shin.rotation.z = Math.PI / 2;
          shin.position.set(-side * SHIN_CENTRE_X, side > 0 ? SHIN_STACK : 0, THIGH_LENGTH);
          leg.add(thigh, shin);
        } else {
          const limb = new THREE.Mesh(GEO.leg, cloth);
          limb.position.y = -HIP_STAND / 2;
          leg.add(limb);
        }
        this.sway.add(leg);
      }
    }

    if (this.walks) this.placeOnLoop();
  }

  /** Stands the villager at (x, y, z) with its feet at height y, facing `yaw` radians about the vertical axis. */
  place(x: number, y: number, z: number, yaw: number): void {
    this.baseY = y;
    this.object.position.set(x, y, z);
    this.object.rotation.y = yaw;
  }

  /** Gives the villager the player's position, which a walking kid reads to pause when the player is close. */
  setPlayer(p: THREE.Vector3 | null): void {
    this.player = p;
  }

  /**
   * Starts a cheer: arms swing up and the villager hops, over CHEER_SECONDS. A cheer already running is left to
   * finish, so a burst during one does not restart the arms from the bottom.
   */
  cheer(): void {
    if (this.cheerAge < 0) this.cheerAge = 0;
  }

  /**
   * One frame: a walking kid moves along its loop unless the player is close, the cheer advances, and the idle
   * breathing and sway continue. `t` is the total elapsed time, so the idle motion is continuous.
   */
  update(dt: number, t: number): void {
    const walking = this.walks && kidMoves(this.distanceToPlayer());
    if (walking) {
      this.angle += (WALK_SPEED / this.loopR) * dt;
      this.gait += GAIT_RATE * dt;
    }
    if (this.walks) this.placeOnLoop();

    // Cheer: the arms follow the envelope, and the hop lifts the figure off the floor and back.
    if (this.cheerAge >= 0) {
      this.cheerAge += dt;
      if (this.cheerAge >= CHEER_SECONDS) this.cheerAge = -1;
    }
    const progress = this.cheerAge < 0 ? 0 : this.cheerAge / CHEER_SECONDS;
    const arm = ARM_IDLE + (ARM_UP - ARM_IDLE) * cheerArms(progress);
    this.armR.rotation.z = arm;
    this.armL.rotation.z = -arm;
    this.object.position.y = this.baseY + cheerHop(progress);

    // Legs swing in opposite phase while walking, and stop as soon as the kid pauses.
    const swing = walking ? LEG_SWING * Math.sin(this.gait) : 0;
    this.legR.rotation.x = swing;
    this.legL.rotation.x = -swing;

    // Idle: a slow breath in the chest and a very small sway of the whole figure.
    this.torso.scale.y = 1 + BREATH_AMOUNT * Math.sin(t * BREATH_RATE + this.phase);
    this.sway.rotation.z = SWAY_AMOUNT * Math.sin(t * SWAY_RATE + this.phase);

    if (this.tip) this.sparkle(dt);
  }

  /** Adds the right-hand sparkler: a thin stick held out in front, with a tip that the sparks come from. */
  private buildSparkler(): void {
    const hand = new THREE.Object3D();
    hand.position.y = -ARM_LENGTH;
    this.armR.add(hand);
    const stick = new THREE.Mesh(GEO.stick, MAT.stick);
    stick.rotation.x = Math.PI / 2;
    stick.position.z = STICK_LENGTH / 2;
    hand.add(stick);
    const tip = new THREE.Object3D();
    tip.position.z = STICK_LENGTH;
    hand.add(tip);
    this.tip = tip;
  }

  /** Throws gold sparks from the sparkler tip at SPARK_RATE per second, carrying fractions between frames. */
  private sparkle(dt: number): void {
    if (!this.tip) return;
    this.sparkAcc += SPARK_RATE * dt;
    const n = Math.floor(this.sparkAcc);
    if (n <= 0) return;
    this.sparkAcc -= n;
    this.tip.getWorldPosition(tmpTip);
    SPARK_OPTS.count = n;
    this.fx.sparks.emit(SPARK_OPTS);
  }

  /** Puts a walking kid at its current angle on the loop, facing the way it walks. */
  private placeOnLoop(): void {
    const a = this.angle;
    this.object.position.x = this.loopX + this.loopR * Math.cos(a);
    this.object.position.z = this.loopZ + this.loopR * Math.sin(a);
    // The figure faces +z at zero yaw, so yaw follows the loop's tangent (-sin a, cos a).
    this.object.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a));
  }

  /** Horizontal distance from the figure to the player, or Infinity when the player is not set. */
  private distanceToPlayer(): number {
    if (!this.player) return Infinity;
    return Math.hypot(this.player.x - this.object.position.x, this.player.z - this.object.position.z);
  }
}
