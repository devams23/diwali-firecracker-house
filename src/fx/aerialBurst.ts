// Shared aerial burst for everything that goes up: a shell bursts at a point in the sky in one of seven shapes,
// lights a short flash at once, and its bang reaches the listener after sound's travel time. After every burst a
// golden crackle phase follows (glitter pops, a coloured sky flash and a soft smoke puff). Delayed work is held in
// a small timer queue that aerialBurstTick(dt) drains each frame, so nothing here needs setTimeout. Scratch vectors
// and option objects are module-level, so emission does not allocate per spark.
import * as THREE from 'three';
import type { FxContext } from './FxContext';
import type { EmitOptions } from './SparkSystem';

/** Shapes a shell can burst into. */
export type BurstStyle = 'peony' | 'willow' | 'crackle' | 'ring' | 'chrysanthemum' | 'crossette' | 'palm';

/** Optional tuning for one burst: spark count and size range of the main effect. */
export interface BurstTune {
  /** Sparks in the main effect; the style's own count is used when absent. */
  count?: number;
  /** Size range in metres for the main sparks; the style's own range is used when absent. */
  size?: [number, number];
}

/** Muted sky palettes (red, green, gold, blue-violet), each a deep shade and a pale one. */
export const SKY_PALETTES: number[][] = [
  [0xff5a3c, 0xff8c6e],
  [0x7bdc6e, 0xb6eaa4],
  [0xffc24a, 0xffe6a0],
  [0x9a8cff, 0xc6bdff],
];

/**
 * Rich festive colour pairs for rockets at strong, not neon, saturation: gold and red, green and gold,
 * magenta-rose and white, saffron and emerald. The first colour of each pair is the deep shade used for the flash.
 */
export const FESTIVE_PALETTES: number[][] = [
  [0xffb83a, 0xe8452f],
  [0x40c46f, 0xffc04a],
  [0xf06aa8, 0xfff4f0],
  [0xff9e35, 0x2fbf86],
];

/** Speed of sound in air, in m/s, used to delay the bang for distant bursts. */
const SPEED_OF_SOUND = 343;
/** Seconds the crackle waits before its second, smaller pop. */
const CRACKLE_DELAY = 0.6;
/** Sparks in the white glitter that follows the crackle's second pop. */
const GLITTER_COUNT = 80;
/** Sparks in the flat ring burst. */
const RING_SPARKS = 220;
/** Largest tilt of the ring's plane away from facing the viewer, in radians. */
const RING_TILT = 0.45;
/** Peak intensity of the flash at the burst point. */
const FLASH_INTENSITY = 5;
/** Reach of the flash at the burst point, in metres. */
const FLASH_DISTANCE = 40;
/** Seconds the flash at the burst point lasts. */
const FLASH_SECONDS = 0.4;
/** Earliest and latest the golden crackle phase starts after a burst, in seconds. */
const AFTERGLOW_MIN = 0.4;
const AFTERGLOW_MAX = 1.2;
/** Speed and drag of the crossette stars, which fly straight out and slow gently. */
const STAR_SPEED = 16;
const STAR_DRAG = 1.2;
/** Seconds a crossette star flies before it splits into four. */
const SPLIT_SECONDS = 0.7;
const TAU = Math.PI * 2;
const WHITE_GLITTER = [0xffffff, 0xfff8e8];
const GOLD_GLITTER = [0xffd36a, 0xfff2c0];
const PALM_GOLD = [0xffc24a, 0xffb030, 0xffd870];
const SMOKE_GREY = 0x9a948c;

/** Per-style tuning for the spherical bursts; the ring, crossette and palm are handled separately. */
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

/** Sphere burst tuning for each sphere style. */
const STYLES: Record<'peony' | 'willow' | 'crackle' | 'chrysanthemum', StyleSpec> = {
  // Full round peony: dense, quick to fall.
  peony: { count: 350, speed: [14, 18], life: [1.4, 2.0], gravity: 4, drag: 1.2, size: [0.03, 0.05], crackle: false },
  // Willow: fewer, slower sparks that hang and droop for a long time.
  willow: { count: 220, speed: [9, 13], life: [2.8, 3.6], gravity: 2.5, drag: 2.2, size: [0.025, 0.04], crackle: false },
  // Crackle: a bright round burst whose sparks flicker; the second pop comes later (see aerialBurst).
  crackle: { count: 250, speed: [10, 14], life: [1.0, 1.6], gravity: 4, drag: 1.2, size: [0.03, 0.045], crackle: true },
  // Chrysanthemum: a dense flickering sphere whose glittering tails are added by timed stamps (see emitTails).
  chrysanthemum: { count: 320, speed: [12, 16], life: [1.8, 2.4], gravity: 4, drag: 1.5, size: [0.02, 0.03], crackle: true },
};

/** Drag-only distance a spark launched at `speed` covers in `t` seconds, used to place the timed stamps. */
export function dragDistance(speed: number, drag: number, t: number): number {
  return drag > 0 ? (speed / drag) * (1 - Math.exp(-drag * t)) : speed * t;
}

/** A queued step (a bang, a crackle pop, a glitter pop, a split) that runs once `remaining` reaches zero. */
interface Pending {
  /** Seconds until this entry runs. */
  remaining: number;
  /** What to do when it runs; entries are created when the burst happens, never from inside a run. */
  run: () => void;
}

/** Every delayed step waiting to run, drained by aerialBurstTick. */
const pending: Pending[] = [];

/** Scratch vector for the camera position, used to work out the sound's travel time and the ring's facing. */
const eye = new THREE.Vector3();
/** Scratch vectors for the ring's plane: the view direction, the tilted normal and the in-plane axes. */
const toView = new THREE.Vector3();
const ringNormal = new THREE.Vector3();
const ringU = new THREE.Vector3();
const ringV = new THREE.Vector3();
/** Scratch vector for an axis that is never parallel to the ring normal, used to build the in-plane basis. */
const helperAxis = new THREE.Vector3();
/** Scratch vector for the direction of one ring spark. */
const ringDir = new THREE.Vector3();
/** Scratch vector for the point of one tail spark on the chrysanthemum shell. */
const tailPos = new THREE.Vector3();
/** Reused option object for the ring; each spark only changes direction and speed. */
const ringOpts: EmitOptions = {
  position: new THREE.Vector3(),
  direction: ringDir,
  speed: 12,
  spread: 0.02,
  count: 1,
  colors: [],
  life: [1.6, 2.2],
  size: [0.025, 0.035],
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
/** Reused option object for the glitter pops of the crackle phase and the crackle's second pop. */
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
/** Reused option object for the glittering tail stamps of the chrysanthemum. */
const tailOpts: EmitOptions = {
  position: new THREE.Vector3(),
  speed: [2, 4],
  spread: Math.PI,
  count: 1,
  colors: [],
  life: [0.25, 0.4],
  size: [0.012, 0.018],
  gravity: 4,
  drag: 2,
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
 * Advances every delayed bang, crackle pop, glitter pop and split by dt seconds. The game loop must call this every
 * frame, or the delayed sounds and the crackle phases never play.
 */
export function aerialBurstTick(dt: number): void {
  drainQueue(pending, dt, runEntry);
}

/** Runs one queued step. */
function runEntry(e: Pending): void {
  e.run();
}

/** Queues `run` to happen `seconds` from now. */
function later(seconds: number, run: () => void): void {
  pending.push({ remaining: seconds, run });
}

/** Releases one round of glitter at `at`, reusing the glitter option object. */
function emitGlitter(fx: FxContext, at: THREE.Vector3, count: number, colors: number[]): void {
  glitterOpts.position = at;
  glitterOpts.count = count;
  glitterOpts.colors = colors;
  fx.sparks.emit(glitterOpts);
}

/**
 * Bursts a shell at `position`: a short flash, the sparks in the chosen shape, a bang that arrives after the sound's
 * travel time, and the golden crackle phase. Crackle shells also queue a second, smaller pop 0.6 s later.
 */
export function aerialBurst(
  fx: FxContext,
  position: THREE.Vector3,
  style: BurstStyle,
  palette: number[],
  tune: BurstTune = {},
): void {
  // The light is seen at once, so it fires now; the bang is queued for the sound's travel time.
  fx.flashes.flash(position, palette[0], FLASH_INTENSITY, FLASH_DISTANCE, FLASH_SECONDS);
  fx.camera.getWorldPosition(eye);
  const at = position.clone();
  const bangAt = at;
  later(soundDelay(eye.distanceTo(at)), () => fx.audio.play('pop', bangAt));

  switch (style) {
    case 'ring':
      emitRing(fx, at, palette, tune.count ?? RING_SPARKS);
      break;
    case 'crossette':
      emitCrossette(fx, at, palette);
      break;
    case 'palm':
      emitPalm(fx, at, palette);
      break;
    default:
      emitSphere(fx, at, style, palette, tune);
      break;
  }

  if (style === 'crackle') {
    later(CRACKLE_DELAY, () => {
      fx.audio.play('popSmall', bangAt);
      emitGlitter(fx, bangAt, GLITTER_COUNT, WHITE_GLITTER);
    });
  }
  afterglow(fx, at, palette);
}

/** Emits a round sphere of sparks for the peony, willow, crackle and chrysanthemum styles. */
function emitSphere(fx: FxContext, at: THREE.Vector3, style: 'peony' | 'willow' | 'crackle' | 'chrysanthemum', palette: number[], tune: BurstTune): void {
  const s = STYLES[style];
  sphereOpts.position = at;
  sphereOpts.count = tune.count ?? s.count;
  sphereOpts.speed = s.speed;
  sphereOpts.life = s.life;
  sphereOpts.size = tune.size ?? s.size;
  sphereOpts.gravity = s.gravity;
  sphereOpts.drag = s.drag;
  sphereOpts.colors = palette;
  sphereOpts.crackle = s.crackle;
  fx.sparks.emit(sphereOpts);

  if (style === 'chrysanthemum') {
    // Glittering tails: three timed stamps of short sparks along the expanding shell, so the sphere reads as trails.
    const speed = (s.speed[0] + s.speed[1]) / 2;
    for (const t of [0.15, 0.3, 0.45]) {
      const r = dragDistance(speed, s.drag, t);
      later(t, () => emitTails(fx, at, palette, r));
    }
  }
}

/** One tail stamp of the chrysanthemum: short glittering sparks scattered on the shell at radius `r`. */
function emitTails(fx: FxContext, at: THREE.Vector3, palette: number[], r: number): void {
  tailOpts.colors = palette;
  for (let k = 0; k < 90; k++) {
    // Random point on a sphere of radius r around the burst; each tail spark is its own emit so each sits at its point.
    const cosT = 2 * Math.random() - 1;
    const sinT = Math.sqrt(1 - cosT * cosT);
    const phi = Math.random() * TAU;
    tailOpts.position = tailPos.set(sinT * Math.cos(phi) * r, cosT * r, sinT * Math.sin(phi) * r).add(at);
    fx.sparks.emit(tailOpts);
  }
}

/**
 * Flat ring: sparks leave the centre at equal speed in a plane tilted a little away from facing the viewer, so the
 * ring reads as a full circle from the courtyard. Each spark is its own emit with a radial direction, reusing one
 * option object and one direction vector.
 */
function emitRing(fx: FxContext, position: THREE.Vector3, palette: number[], count: number): void {
  fx.camera.getWorldPosition(eye);
  toView.subVectors(eye, position).normalize();
  if (Math.abs(toView.y) < 0.9) helperAxis.set(0, 1, 0);
  else helperAxis.set(1, 0, 0);
  ringU.crossVectors(toView, helperAxis).normalize();
  ringV.crossVectors(toView, ringU);
  // Tilt the normal off the view direction by a random amount up to RING_TILT, around a random bearing.
  const tilt = Math.random() * RING_TILT;
  const bearing = Math.random() * TAU;
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  ringNormal.copy(toView).multiplyScalar(c).addScaledVector(ringU, s * Math.cos(bearing)).addScaledVector(ringV, s * Math.sin(bearing));
  // The in-plane basis is built from a helper axis that is not parallel to the new normal.
  if (Math.abs(ringNormal.y) < 0.9) helperAxis.set(0, 1, 0);
  else helperAxis.set(1, 0, 0);
  ringU.crossVectors(ringNormal, helperAxis).normalize();
  ringV.crossVectors(ringNormal, ringU);

  ringOpts.position = position;
  ringOpts.colors = palette;
  for (let k = 0; k < count; k++) {
    // Each spark gets a slightly jittered angle so the ring is not a set of perfect spokes.
    const a = ((k + Math.random() * 0.5) / count) * TAU;
    ringDir.set(0, 0, 0).addScaledVector(ringU, Math.cos(a)).addScaledVector(ringV, Math.sin(a));
    ringOpts.speed = 12 + Math.random() * 2;
    fx.sparks.emit(ringOpts);
  }
}

/**
 * Crossette: six to eight stars fly straight out in random directions, and each one splits into four sparks a
 * moment later at the point it has reached. The split is queued at the burst, using the drag-only distance.
 */
function emitCrossette(fx: FxContext, at: THREE.Vector3, palette: number[]): void {
  const stars = 6 + Math.floor(Math.random() * 3);
  const reach = dragDistance(STAR_SPEED, STAR_DRAG, SPLIT_SECONDS);
  for (let s = 0; s < stars; s++) {
    const cosT = 2 * Math.random() - 1;
    const sinT = Math.sqrt(1 - cosT * cosT);
    const phi = Math.random() * TAU;
    const dir = new THREE.Vector3(sinT * Math.cos(phi), cosT, sinT * Math.sin(phi));
    fx.sparks.emit({
      position: at,
      direction: dir,
      speed: STAR_SPEED,
      spread: 0.05,
      count: 22,
      colors: palette,
      life: [1.6, 1.9],
      size: [0.025, 0.035],
      gravity: 0,
      drag: STAR_DRAG,
    });
    const splitAt = new THREE.Vector3().copy(dir).multiplyScalar(reach).add(at);
    later(SPLIT_SECONDS + Math.random() * 0.1, () => {
      fx.sparks.emit({
        position: splitAt,
        direction: dir,
        speed: [5, 7],
        spread: 0.5,
        count: 4,
        colors: palette,
        life: [0.9, 1.2],
        size: [0.03, 0.04],
        gravity: 3,
        drag: 1.2,
      });
    });
  }
}

/**
 * Palm: six to eight thick comet arms, each a dense line of gold sparks thrown out and up, with a bright head that
 * leads it. Gravity bends each arm into a drooping palm frond.
 */
function emitPalm(fx: FxContext, at: THREE.Vector3, palette: number[]): void {
  const arms = 6 + Math.floor(Math.random() * 3);
  for (let a = 0; a < arms; a++) {
    const az = (a / arms) * TAU + Math.random() * 0.3;
    const lift = 0.35 + Math.random() * 0.25;
    const dir = new THREE.Vector3(Math.cos(az) * 0.9, lift, Math.sin(az) * 0.9).normalize();
    fx.sparks.emit({
      position: at,
      direction: dir,
      speed: [13, 15],
      spread: 0.05,
      count: 45,
      colors: Math.random() < 0.5 ? PALM_GOLD : palette,
      life: [2.4, 3.0],
      size: [0.04, 0.06],
      gravity: 5,
      drag: 0.7,
      crackle: true,
    });
    fx.sparks.emit({
      position: at,
      direction: dir,
      speed: [13, 15],
      spread: 0,
      count: 2,
      colors: [0xfff6d8],
      life: [0.3, 0.4],
      size: [0.1, 0.12],
      gravity: 0,
      drag: 0.4,
    });
  }
}

/**
 * The crackle phase after every burst: three glitter pops of gold sparks over about half a second, a brief coloured
 * sky flash, and a soft smoke puff that rises after them. Its start is random between 0.4 and 1.2 s.
 */
function afterglow(fx: FxContext, at: THREE.Vector3, palette: number[]): void {
  const t0 = AFTERGLOW_MIN + Math.random() * (AFTERGLOW_MAX - AFTERGLOW_MIN);
  later(t0, () => {
    fx.audio.play('crack', at, { volume: 0.8 });
    emitGlitter(fx, at, 70, GOLD_GLITTER);
  });
  later(t0 + 0.15, () => emitGlitter(fx, at, 40, GOLD_GLITTER));
  later(t0 + 0.35, () => emitGlitter(fx, at, 30, GOLD_GLITTER));
  later(t0 + 0.05, () => fx.flashes.flash(at, palette[0], 2.5, 30, 0.45));
  later(t0 + 0.6, () => fx.smoke.puff(at, { count: 4, size: 1.4, life: 5, rise: 0.2, color: SMOKE_GREY }));
}
