// Shared aerial burst for everything that goes up: a shell bursts at a point in the sky in one of four shapes,
// lights a short flash at once, and its bang reaches the listener after sound's travel time. Bangs and the
// crackle's second pop are held in a small timer queue that aerialBurstTick(dt) drains each frame, so nothing
// here needs setTimeout. Scratch vectors and option objects are module-level, so emission does not allocate
// per spark.
import * as THREE from 'three';
import type { FxContext } from './FxContext';
import type { EmitOptions } from './SparkSystem';

/** Shapes a shell can burst into. */
export type BurstStyle = 'peony' | 'willow' | 'crackle' | 'ring';

/** Muted sky palettes (red, green, gold, blue-violet), each a deep shade and a pale one. */
export const SKY_PALETTES: number[][] = [
  [0xff5a3c, 0xff8c6e],
  [0x7bdc6e, 0xb6eaa4],
  [0xffc24a, 0xffe6a0],
  [0x9a8cff, 0xc6bdff],
];

/** Speed of sound in air, in m/s, used to delay the bang for distant bursts. */
const SPEED_OF_SOUND = 343;
/** Seconds the crackle waits before its second, smaller pop. */
const CRACKLE_DELAY = 0.6;
/** Sparks in the white glitter that follows the crackle's second pop. */
const GLITTER_COUNT = 80;
/** Sparks in the flat ring burst. */
const RING_SPARKS = 160;
/** Peak intensity of the flash at the burst point. */
const FLASH_INTENSITY = 5;
/** Reach of the flash at the burst point, in metres. */
const FLASH_DISTANCE = 40;
/** Seconds the flash at the burst point lasts. */
const FLASH_SECONDS = 0.4;
const TAU = Math.PI * 2;
const WHITE_GLITTER = [0xffffff, 0xfff8e8];

/** Per-style tuning for the spherical bursts; the ring is handled separately. */
interface StyleSpec {
  /** Sparks emitted in one burst. */
  count: number;
  /** Launch speed range in m/s. */
  speed: [number, number];
  /** Lifetime range in seconds. */
  life: [number, number];
  /** Downward acceleration in m/s². */
  gravity: number;
  /** Linear drag per second. */
  drag: number;
  /** Spark size range in metres. */
  size: [number, number];
  /** Whether sparks flicker like crackling stars. */
  crackle: boolean;
}

/** Sphere burst tuning for each non-ring style. */
const STYLES: Record<Exclude<BurstStyle, 'ring'>, StyleSpec> = {
  // Full round peony: dense, quick to fall.
  peony: { count: 350, speed: [14, 18], life: [1.4, 2.0], gravity: 4, drag: 1.2, size: [0.03, 0.05], crackle: false },
  // Willow: fewer, slower sparks that hang and droop for a long time.
  willow: { count: 220, speed: [9, 13], life: [2.8, 3.6], gravity: 2.5, drag: 2.2, size: [0.025, 0.04], crackle: false },
  // Crackle: a bright round burst whose sparks flicker; the second pop comes later (see aerialBurst).
  crackle: { count: 250, speed: [10, 14], life: [1.0, 1.6], gravity: 4, drag: 1.2, size: [0.03, 0.045], crackle: true },
};

/** A bang or sub-burst waiting in the timer queue; `remaining` counts down in seconds. */
interface Pending {
  /** Seconds until this entry fires. */
  remaining: number;
  /** Effect systems and audio to use when it fires. */
  fx: FxContext;
  /** Burst point, copied so the caller's vector can change. */
  pos: THREE.Vector3;
  /** What to do when it fires: the listener's bang, or the crackle's second pop and glitter. */
  kind: 'bang' | 'crackleBang';
}

/** Every queued bang or crackle pop, drained by aerialBurstTick. */
const pending: Pending[] = [];

/** Scratch vector for the camera position, used to work out the sound's travel time. */
const eye = new THREE.Vector3();
/** Scratch vector for the ring plane's normal. */
const ringNormal = new THREE.Vector3();
/** Scratch vector for the ring plane's first in-plane axis. */
const ringU = new THREE.Vector3();
/** Scratch vector for the ring plane's second in-plane axis. */
const ringV = new THREE.Vector3();
/** Scratch vector for an axis that is never parallel to the ring normal, used to build the in-plane basis. */
const helperAxis = new THREE.Vector3();
/** Scratch vector for the direction of one ring spark. */
const ringDir = new THREE.Vector3();
/** Reused option object for the ring; each spark only changes direction and speed. */
const ringOpts: EmitOptions = {
  position: new THREE.Vector3(),
  direction: ringDir,
  speed: 12,
  spread: 0.02,
  count: 1,
  colors: [],
  life: [1.6, 2.2],
  size: [0.03, 0.045],
  gravity: 3,
  drag: 1.5,
};
/** Reused option object for the spherical bursts. */
const sphereOpts: EmitOptions = {
  position: new THREE.Vector3(),
  speed: [1, 1],
  spread: Math.PI,
  count: 0,
  colors: [],
  life: [1, 1],
  size: [0.03, 0.05],
};
/** Reused option object for the crackle's glitter. */
const glitterOpts: EmitOptions = {
  position: new THREE.Vector3(),
  speed: [3, 5],
  spread: Math.PI,
  count: GLITTER_COUNT,
  colors: WHITE_GLITTER,
  life: [0.4, 0.8],
  size: [0.015, 0.025],
  crackle: true,
};

/**
 * Pure queue step: counts every entry down by dt, calls `fire` for each one that reaches zero, and keeps the rest
 * in their original order. `fire` must not add to the queue. Returns how many entries fired.
 */
export function drainQueue<T extends { remaining: number }>(queue: T[], dt: number, fire: (e: T) => void): number {
  let kept = 0;
  let fired = 0;
  for (let r = 0; r < queue.length; r++) {
    const e = queue[r];
    e.remaining -= dt;
    if (e.remaining <= 0) {
      fired++;
      fire(e);
    } else {
      queue[kept++] = e;
    }
  }
  queue.length = kept;
  return fired;
}

/** Seconds sound takes to travel `distance` metres to the listener. */
export function soundDelay(distance: number): number {
  return Math.max(0, distance) / SPEED_OF_SOUND;
}

/**
 * Advances every delayed bang and crackle pop by dt seconds. The game loop must call this every frame,
 * or the delayed sounds and the crackle's second pop never play.
 */
export function aerialBurstTick(dt: number): void {
  drainQueue(pending, dt, fireEntry);
}

/** Plays one queued entry: the bang at the burst point, or the crackle's second pop with its white glitter. */
function fireEntry(e: Pending): void {
  if (e.kind === 'bang') {
    e.fx.audio.play('pop', e.pos);
    return;
  }
  e.fx.audio.play('popSmall', e.pos);
  glitterOpts.position = e.pos;
  e.fx.sparks.emit(glitterOpts);
}

/**
 * Bursts a shell at `position`: a short flash, the sparks in the chosen shape, and a bang that arrives after
 * the sound's travel time. Crackle shells also queue a second, smaller pop 0.6 s later.
 */
export function aerialBurst(fx: FxContext, position: THREE.Vector3, style: BurstStyle, palette: number[]): void {
  // The light is seen at once, so it fires now; the bang is queued for the sound's travel time.
  fx.flashes.flash(position, palette[0], FLASH_INTENSITY, FLASH_DISTANCE, FLASH_SECONDS);
  fx.camera.getWorldPosition(eye);
  pending.push({ remaining: soundDelay(eye.distanceTo(position)), fx, pos: position.clone(), kind: 'bang' });

  if (style === 'ring') {
    emitRing(fx, position, palette);
    return;
  }
  const s = STYLES[style];
  sphereOpts.position = position;
  sphereOpts.count = s.count;
  sphereOpts.speed = s.speed;
  sphereOpts.life = s.life;
  sphereOpts.size = s.size;
  sphereOpts.gravity = s.gravity;
  sphereOpts.drag = s.drag;
  sphereOpts.colors = palette;
  sphereOpts.crackle = s.crackle;
  fx.sparks.emit(sphereOpts);

  if (style === 'crackle') {
    pending.push({ remaining: CRACKLE_DELAY, fx, pos: position.clone(), kind: 'crackleBang' });
  }
}

/**
 * Flat ring: sparks leave the centre at equal speed in a random plane, so they spread into a ring. Each spark is
 * its own emit call with a radial direction, reusing one option object and one direction vector.
 */
function emitRing(fx: FxContext, position: THREE.Vector3, palette: number[]): void {
  // Random plane: uniform random normal, with an in-plane basis built from a helper axis that is not parallel to it.
  const cosPhi = 2 * Math.random() - 1;
  const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
  const theta = Math.random() * TAU;
  ringNormal.set(sinPhi * Math.cos(theta), sinPhi * Math.sin(theta), cosPhi);
  if (Math.abs(ringNormal.y) < 0.9) helperAxis.set(0, 1, 0);
  else helperAxis.set(1, 0, 0);
  ringU.crossVectors(ringNormal, helperAxis).normalize();
  ringV.crossVectors(ringNormal, ringU);

  ringOpts.position = position;
  ringOpts.colors = palette;
  for (let k = 0; k < RING_SPARKS; k++) {
    // Each spark gets a slightly jittered angle so the ring is not a set of perfect spokes.
    const a = ((k + Math.random() * 0.5) / RING_SPARKS) * TAU;
    ringDir.set(0, 0, 0).addScaledVector(ringU, Math.cos(a)).addScaledVector(ringV, Math.sin(a));
    ringOpts.speed = 12 + Math.random() * 2;
    fx.sparks.emit(ringOpts);
  }
}
