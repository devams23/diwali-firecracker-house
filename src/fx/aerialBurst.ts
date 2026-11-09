// Shared aerial burst for everything that goes up: a shell bursts at a point in the sky in one of seven shapes,
// lights a short flash at once, and its bang reaches the listener after sound's travel time. After every burst a
// golden crackle phase follows (glitter pops, a coloured sky flash and a soft smoke puff). Delayed work is held in
// a small timer queue that aerialBurstTick(dt) drains each frame, so nothing here needs setTimeout. Scratch vectors
// and option objects are module-level, so emission does not allocate per spark.
import * as THREE from 'three';
import type { FxContext } from './FxContext';
import type { EmitOptions } from './SparkSystem';

/** Shapes a shell can burst into. */
export type BurstStyle = 'peony' | 'willow' | 'crackle' | 'ring' | 'chrysanthemum' | 'crossette' | 'palm' | 'doubleRing';

/** Optional tuning for one burst: spark count and size range of the main effect. */
export interface BurstTune {
  /** Sparks in the main effect; the style's own count is used when absent. */
  count?: number;
  /** Size range in metres for the main sparks; the style's own range is used when absent. */
  size?: [number, number];
  /**
   * Grandeur of the shell: a multiplier on the burst radius (and, a little, on the star count). 1 is the ordinary
   * shell; the grand rocket uses about 1.6. Absent means 1.
   */
  scale?: number;
  /** Adds a smaller secondary break a beat after the main shell, and a long golden willow that hangs after it. */
  multiBreak?: boolean;
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
const RING_SPARKS = 130;
/** Largest tilt of the ring's plane away from facing the viewer, in radians. */
const RING_TILT = 0.45;
/**
 * Light the burst throws on the courtyard. The burst is 35 m or more away, so with inverse-square falloff the
 * intensity has to be in the hundreds for the walls and ground to visibly take the colour.
 */
const FLASH_INTENSITY = 700;
/**
 * Flash intensity per square metre of distance to the listener: far bursts need more light for the same effect on
 * the courtyard (inverse-square falloff), so the intensity grows with distance squared above the base value.
 */
const FLASH_PER_M2 = 0.6;
const FLASH_MAX = 5200;
/** Reach of the flash at the burst point, in metres; it must exceed the distance to the courtyard. */
const FLASH_DISTANCE = 130;
/** Seconds after the main shell that the secondary break and the golden hang begin (multi-break shells only). */
const SECOND_BREAK_DELAY = 0.8;
const HANG_DELAY = 0.45;
/** Seconds the flash at the burst point lasts. */
const FLASH_SECONDS = 0.7;
/** Distance at which the sizes in the style table are meant to be seen; nearer or farther bursts are scaled from it. */
const REF_DISTANCE = 35;
/** Largest size multiplier the distance scaling may give; high bursts are far away and their stars must stay fat. */
const MAX_SIZE_SCALE = 3.2;
/** Sizes of the white and coloured flash sprites at the reference distance, in metres, and how long they last. */
const FLASH_CORE_SIZE = 6;
const FLASH_HALO_SIZE = 14;
const FLASH_SPRITE_SECONDS = 0.15;
/** Radius of the shell on which the afterglow's glitter pops twinkle, in metres, and the sparks in each cluster. */
const GLITTER_RADIUS = 9;
const GLITTER_GROUP = 12;
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
const GOLD_GLITTER = [0xffd36a, 0xfff2c0, 0xffffff];
const PALM_GOLD = [0xffc24a, 0xffb030, 0xffd870];
/** Warm gold the willow's drooping stars always take, whatever the palette. */
const WILLOW_GOLD = [0xffc850, 0xffb030, 0xffe28a];
const WHITE_HOT = [0xfff6d8];
/** Tail size as a fraction of each star, for stars that leave a trail. */
const TRAIL = 0.55;
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
  peony: { count: 200, speed: [14, 18], life: [1.8, 2.5], gravity: 4.5, drag: 1.3, size: [0.55, 0.85], crackle: false },
  // Willow: slower golden stars that hang and droop for a long time.
  willow: { count: 170, speed: [9, 13], life: [3.0, 3.8], gravity: 2.5, drag: 2.2, size: [0.5, 0.75], crackle: false },
  // Crackle: a bright round burst whose stars flicker; the second pop comes later (see aerialBurst).
  crackle: { count: 190, speed: [10, 14], life: [1.3, 1.9], gravity: 4, drag: 1.2, size: [0.5, 0.8], crackle: true },
  // Chrysanthemum: a dense flickering sphere, every star dragging a glittering tail.
  chrysanthemum: { count: 230, speed: [12, 16], life: [2.0, 2.6], gravity: 4, drag: 1.5, size: [0.45, 0.7], crackle: true },
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
/** Scratch vector for the point of one glitter pop in the afterglow. */
const popPos = new THREE.Vector3();
/** Size multiplier of the burst being emitted now: its distance from the camera over REF_DISTANCE, clamped. */
let sizeScale = 1;
/** Reused option object for the ring; each spark only changes direction and speed. */
const ringOpts: EmitOptions = {
  position: new THREE.Vector3(),
  direction: ringDir,
  speed: 12,
  spread: 0.02,
  count: 1,
  colors: [],
  life: [1.6, 2.2],
  size: [0.5, 0.7],
  gravity: 3,
  drag: 1.5,
  trail: TRAIL,
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
  size: [0.12, 0.22],
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
  glitterOpts.size = [0.12 * sizeScale, 0.22 * sizeScale];
  fx.sparks.emit(glitterOpts);
}

/**
 * One twinkling pop of the afterglow: `groups` small clusters of white-gold glitter, each at a random point on a
 * drooped shell around the burst, so the whole dandelion crackles at once instead of only its centre.
 */
function emitGlitterShell(fx: FxContext, at: THREE.Vector3, groups: number, colors: number[], radius = GLITTER_RADIUS): void {
  glitterOpts.speed = [0.5, 2];
  for (let g = 0; g < groups; g++) {
    const cosT = 2 * Math.random() - 1;
    const sinT = Math.sqrt(1 - cosT * cosT);
    const phi = Math.random() * TAU;
    const r = radius * (0.55 + Math.random() * 0.45);
    // The shell sags a couple of metres, since the stars it came from have drooped under gravity.
    popPos.set(sinT * Math.cos(phi) * r, cosT * r - 2, sinT * Math.sin(phi) * r).add(at);
    emitGlitter(fx, popPos, GLITTER_GROUP, colors);
  }
  glitterOpts.speed = [3, 5];
}

/**
 * The bright flash at the instant of the burst: a small white-hot sprite over a large coloured halo, each a single
 * oversized spark that lives 0.15 s, so the sky blooms and the stars appear out of it.
 */
function emitBurstFlash(fx: FxContext, at: THREE.Vector3, palette: number[]): void {
  fx.sparks.emit({ position: at, speed: 0, spread: 0, count: 1, colors: WHITE_HOT, life: [FLASH_SPRITE_SECONDS, FLASH_SPRITE_SECONDS], size: FLASH_CORE_SIZE * Math.min(sizeScale, 1.8), gravity: 0 });
  fx.sparks.emit({ position: at, speed: 0, spread: 0, count: 1, colors: palette, life: [FLASH_SPRITE_SECONDS * 1.3, FLASH_SPRITE_SECONDS * 1.3], size: FLASH_HALO_SIZE * Math.min(sizeScale, 1.8), gravity: 0 });
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
  const scale = tune.scale ?? 1;
  // The light is seen at once, so it fires now; the bang is queued for the sound's travel time.
  fx.camera.getWorldPosition(eye);
  const at = position.clone();
  const dist = eye.distanceTo(at);
  // Light grows with distance squared so a burst 80 m up still washes the courtyard, and with the shell's grandeur.
  const flashPower = Math.min(FLASH_MAX, Math.max(FLASH_INTENSITY, FLASH_PER_M2 * dist * dist) * (0.8 + 0.2 * scale));
  fx.flashes.flash(position, palette[0], flashPower, Math.max(FLASH_DISTANCE, dist * 2), FLASH_SECONDS);
  // Sub-linear in distance: far stars must grow to stay visible, but not so much that dense shells whiten out.
  sizeScale = Math.min(MAX_SIZE_SCALE, Math.max(0.8, Math.pow(dist / REF_DISTANCE, 0.7)));
  const sizeAtBurst = sizeScale;
  emitBurstFlash(fx, at, palette);
  const bangAt = at;
  later(soundDelay(dist), () => fx.audio.play('pop', bangAt));

  switch (style) {
    case 'ring':
      emitRing(fx, at, palette, Math.round((tune.count ?? RING_SPARKS) * Math.min(1.3, scale)), scale);
      break;
    case 'crossette':
      emitCrossette(fx, at, palette, scale);
      break;
    case 'doubleRing':
      // Two concentric rings in contrasting colours: a wide one in the first colour, a tight one in the second.
      emitRing(fx, at, [palette[0]], Math.round(RING_SPARKS * 0.8), scale);
      emitRing(fx, at, [palette[1] ?? palette[0]], Math.round(RING_SPARKS * 0.5), scale * 0.55);
      break;
    case 'palm':
      emitPalm(fx, at, palette, scale);
      break;
    default:
      emitSphere(fx, at, style, palette, tune, scale);
      break;
  }

  if (style === 'crackle') {
    later(CRACKLE_DELAY, () => {
      fx.audio.play('popSmall', bangAt);
      emitGlitterShell(fx, bangAt, 10, WHITE_GLITTER);
    });
  }
  if (tune.multiBreak) multiBreak(fx, at, palette, scale, sizeAtBurst, dist);
  afterglow(fx, at, palette, scale);
}

/**
 * The second act of a grand shell: a beat after the main break a smaller ring or crossette bursts from the same
 * point in the shell's second colour (with its own flash and bang), and a long golden willow hangs and falls
 * for several seconds, so the sky stays lit well after the first bloom.
 */
function multiBreak(fx: FxContext, at: THREE.Vector3, palette: number[], scale: number, size: number, dist: number): void {
  const second = [palette[1], palette[0], 0xfff4d8];
  later(HANG_DELAY, () => {
    sizeScale = size;
    emitHang(fx, at, scale);
  });
  later(SECOND_BREAK_DELAY, () => {
    sizeScale = size;
    fx.flashes.flash(at, palette[1], Math.min(FLASH_MAX, FLASH_PER_M2 * dist * dist * 0.7), Math.max(FLASH_DISTANCE, dist * 2), 0.45);
    fx.audio.play('popSmall', at);
    emitBurstFlash(fx, at, second);
    // Alternate the second break between a tight ring and a crossette, picked per shell.
    if (Math.random() < 0.5) emitRing(fx, at, second, 90, scale * 0.6);
    else emitCrossette(fx, at, second, scale * 0.7);
  });
}

/** Long golden willow hang: slow, heavy gold stars with trails that droop and glitter for five seconds or more. */
function emitHang(fx: FxContext, at: THREE.Vector3, scale: number): void {
  sphereOpts.position = at;
  sphereOpts.count = 150;
  sphereOpts.speed = [9 * scale, 13 * scale];
  sphereOpts.life = [4.6, 6];
  sphereOpts.size = [0.5 * sizeScale, 0.75 * sizeScale];
  sphereOpts.trail = TRAIL;
  sphereOpts.gravity = 2.2;
  sphereOpts.drag = 2.1;
  sphereOpts.colors = WILLOW_GOLD;
  sphereOpts.crackle = true;
  fx.sparks.emit(sphereOpts);
}

/** Emits a round sphere of sparks for the peony, willow, crackle and chrysanthemum styles. */
function emitSphere(fx: FxContext, at: THREE.Vector3, style: 'peony' | 'willow' | 'crackle' | 'chrysanthemum', palette: number[], tune: BurstTune, scale: number): void {
  const s = STYLES[style];
  sphereOpts.position = at;
  sphereOpts.count = Math.round((tune.count ?? s.count) * Math.min(1.3, scale));
  sphereOpts.speed = [s.speed[0] * scale, s.speed[1] * scale];
  sphereOpts.life = [s.life[0] * (0.9 + 0.1 * scale), s.life[1] * (0.9 + 0.1 * scale)];
  const sz = tune.size ?? s.size;
  sphereOpts.size = [sz[0] * sizeScale, sz[1] * sizeScale];
  sphereOpts.trail = TRAIL;
  sphereOpts.gravity = s.gravity;
  sphereOpts.drag = s.drag;
  sphereOpts.colors = style === 'willow' ? WILLOW_GOLD : palette;
  sphereOpts.crackle = s.crackle;
  fx.sparks.emit(sphereOpts);
}

/**
 * Flat ring: sparks leave the centre at equal speed in a plane tilted a little away from facing the viewer, so the
 * ring reads as a full circle from the courtyard. Each spark is its own emit with a radial direction, reusing one
 * option object and one direction vector.
 */
function emitRing(fx: FxContext, position: THREE.Vector3, palette: number[], count: number, scale: number): void {
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
  ringOpts.size = [0.5 * sizeScale, 0.7 * sizeScale];
  for (let k = 0; k < count; k++) {
    // Each spark gets a slightly jittered angle so the ring is not a set of perfect spokes.
    const a = ((k + Math.random() * 0.5) / count) * TAU;
    ringDir.set(0, 0, 0).addScaledVector(ringU, Math.cos(a)).addScaledVector(ringV, Math.sin(a));
    ringOpts.speed = (12 + Math.random() * 2) * scale;
    fx.sparks.emit(ringOpts);
  }
}

/**
 * Crossette: six to eight stars fly straight out in random directions, and each one splits into four sparks a
 * moment later at the point it has reached. The split is queued at the burst, using the drag-only distance.
 */
function emitCrossette(fx: FxContext, at: THREE.Vector3, palette: number[], scale: number): void {
  const stars = 12 + Math.floor(Math.random() * 5);
  const starSpeed = STAR_SPEED * scale;
  const reach = dragDistance(starSpeed, STAR_DRAG, SPLIT_SECONDS);
  for (let s = 0; s < stars; s++) {
    const cosT = 2 * Math.random() - 1;
    const sinT = Math.sqrt(1 - cosT * cosT);
    const phi = Math.random() * TAU;
    const dir = new THREE.Vector3(sinT * Math.cos(phi), cosT, sinT * Math.sin(phi));
    fx.sparks.emit({
      position: at,
      direction: dir,
      speed: starSpeed,
      spread: 0.05,
      count: 7,
      colors: palette,
      life: [1.6, 1.9],
      size: [0.5 * sizeScale, 0.7 * sizeScale],
      gravity: 0,
      drag: STAR_DRAG,
      trail: TRAIL,
    });
    const splitAt = new THREE.Vector3().copy(dir).multiplyScalar(reach).add(at);
    later(SPLIT_SECONDS + Math.random() * 0.1, () => {
      fx.sparks.emit({
        position: splitAt,
        direction: dir,
        speed: [6 * scale, 10 * scale],
        spread: 1.0,
        count: 9,
        colors: palette,
        life: [1.1, 1.5],
        size: [0.45 * sizeScale, 0.6 * sizeScale],
        gravity: 3,
        drag: 1.2,
        trail: TRAIL,
      });
    });
  }
}

/**
 * Palm: six to eight thick comet arms, each a dense line of gold sparks thrown out and up, with a bright head that
 * leads it. Gravity bends each arm into a drooping palm frond.
 */
function emitPalm(fx: FxContext, at: THREE.Vector3, palette: number[], scale: number): void {
  const arms = 6 + Math.floor(Math.random() * 3);
  for (let a = 0; a < arms; a++) {
    const az = (a / arms) * TAU + Math.random() * 0.3;
    const lift = 0.35 + Math.random() * 0.25;
    const dir = new THREE.Vector3(Math.cos(az) * 0.9, lift, Math.sin(az) * 0.9).normalize();
    fx.sparks.emit({
      position: at,
      direction: dir,
      speed: [13 * scale, 15 * scale],
      spread: 0.05,
      count: 24,
      colors: Math.random() < 0.6 ? PALM_GOLD : palette,
      life: [2.6, 3.4],
      size: [0.55 * sizeScale, 0.8 * sizeScale],
      gravity: 5,
      drag: 0.7,
      crackle: true,
      trail: TRAIL,
    });
    fx.sparks.emit({
      position: at,
      direction: dir,
      speed: [13 * scale, 15 * scale],
      spread: 0,
      count: 2,
      colors: [0xfff6d8],
      life: [0.3, 0.4],
      size: [1.1 * sizeScale, 1.4 * sizeScale],
      gravity: 0,
      drag: 0.4,
    });
  }
}

/**
 * The crackle phase after every burst: three glitter pops of gold sparks over about half a second, a brief coloured
 * sky flash, and a soft smoke puff that rises after them. Its start is random between 0.4 and 1.2 s.
 */
function afterglow(fx: FxContext, at: THREE.Vector3, palette: number[], scale: number): void {
  const t0 = AFTERGLOW_MIN + Math.random() * (AFTERGLOW_MAX - AFTERGLOW_MIN);
  later(t0, () => {
    fx.audio.play('crack', at, { volume: 0.8 });
    emitGlitterShell(fx, at, 14, GOLD_GLITTER, GLITTER_RADIUS * scale);
  });
  later(t0 + 0.15, () => emitGlitterShell(fx, at, 10, GOLD_GLITTER, GLITTER_RADIUS * scale));
  later(t0 + 0.35, () => emitGlitterShell(fx, at, 8, GOLD_GLITTER, GLITTER_RADIUS * scale));
  later(t0 + 0.55, () => emitGlitterShell(fx, at, 6, WHITE_GLITTER, GLITTER_RADIUS * scale));
  later(t0 + 0.05, () => fx.flashes.flash(at, palette[0], 250, 100, 0.45));
  later(t0 + 0.6, () => fx.smoke.puff(at, { count: 4, size: 1.4, life: 5, rise: 0.2, color: SMOKE_GREY }));
}
