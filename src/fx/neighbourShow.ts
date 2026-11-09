// The neighbours' background fireworks: a weighted picker for burst shapes and colours, rising comet shells that
// climb the sky before they break, and small anar-style fountains on the village lanes so the street feels alive.
// Shells and fountains live in small fixed-cap lists drained by neighbourShowTick(dt); all scratch objects are
// module-level, so nothing allocates per frame.
import * as THREE from 'three';
import type { FxContext } from './FxContext';
import { aerialBurst, type BurstStyle, type BurstTune } from './aerialBurst';
import type { EmitOptions } from './SparkSystem';

/** Burst shapes with their weights: round peonies and rings are common, the showy ones rarer. */
const STYLE_WEIGHTS: [BurstStyle, number][] = [
  ['peony', 3],
  ['chrysanthemum', 3],
  ['ring', 2],
  ['doubleRing', 2],
  ['willow', 2],
  ['crossette', 2],
  ['palm', 1],
  ['crackle', 2],
];

/** Festive three-colour mixes for the neighbours' shells: gold, saffron, magenta, emerald, royal blue. */
export const NEIGHBOUR_PALETTES: number[][] = [
  [0xffb83a, 0xff7a1f, 0xfff0c0],
  [0xf0409a, 0xffc04a, 0xfff4f0],
  [0x2fbf86, 0xffd24a, 0xe8fff0],
  [0x4a6bff, 0xffffff, 0xffc24a],
  [0xff7a1f, 0xe8452f, 0xffe08a],
  [0x9a5cff, 0xf06aa8, 0xfff0c0],
];

/** Most rising shells in flight at once; further launches burst at once instead of climbing. */
const MAX_SHELLS = 8;
/** Most lane fountains alive at once. */
const MAX_FOUNTAINS = 4;
/** Seconds a shell takes to climb, as a base and a random extra. */
const RISE_BASE = 0.9;
const RISE_EXTRA = 0.5;
/** Height the shell is launched from, in metres (behind the roofline). */
const LAUNCH_HEIGHT = 8;
/** Seconds a fountain spouts, and the gap between its puffs of sparks. */
const FOUNTAIN_SECONDS = 2.2;
const FOUNTAIN_GAP = 0.07;
/** Lane centres of the village: east/west x = +-19, south z = 19, north z = -18; fountains sit just outside them. */
const LANE_X = 19;
const LANE_Z_SOUTH = 19;
const LANE_Z_NORTH = -18;
/** How far outside a lane centre a fountain is set, and how far along the lane it may wander from the middle. */
const LANE_OFFSET = 1.6;
const LANE_HALF = 15;

/** Gold sparks the rising comet drops behind it. */
const COMET_COLORS = [0xffd36a, 0xffb030, 0xfff2c0];
/** Warm sparks of a fountain. */
const FOUNTAIN_COLORS = [0xffc24a, 0xffa030, 0xfff2c0, 0xff7a3c];

/** One shell climbing to its burst point. */
interface Shell {
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  style: BurstStyle;
  palette: number[];
  tune: BurstTune;
}

/** One lane fountain spouting. */
interface Fountain {
  at: THREE.Vector3;
  remaining: number;
  gap: number;
}

/** Shells in flight and fountains alive; capped at MAX_SHELLS and MAX_FOUNTAINS. */
const shells: Shell[] = [];
const fountains: Fountain[] = [];
/** Scratch point for the comet's current position. */
const cometPos = new THREE.Vector3();
/** Reused option object for the comet's tail sparks. */
const cometOpts: EmitOptions = {
  position: cometPos,
  speed: [0.5, 1.5],
  spread: Math.PI,
  count: 2,
  colors: COMET_COLORS,
  life: [0.35, 0.6],
  size: [0.25, 0.4],
  gravity: 1.5,
  drag: 1,
  crackle: true,
};
/** Reused option object for a fountain puff. */
const fountainOpts: EmitOptions = {
  position: new THREE.Vector3(),
  speed: [6, 10],
  spread: 0.3,
  count: 14,
  colors: FOUNTAIN_COLORS,
  life: [0.7, 1.2],
  size: [0.18, 0.3],
  gravity: 9,
  drag: 0.5,
  crackle: true,
};

/** Picks a burst shape by weight, never the same one twice in a row. `rand` returns [0,1). */
export function pickBurstStyle(rand: () => number, last?: BurstStyle): BurstStyle {
  const pool = STYLE_WEIGHTS.filter(([s]) => s !== last);
  let total = 0;
  for (const [, w] of pool) total += w;
  let r = rand() * total;
  for (const [s, w] of pool) {
    r -= w;
    if (r < 0) return s;
  }
  return pool[pool.length - 1][0];
}

/** Picks a palette from the neighbours' mixes, never the same one twice in a row. `rand` returns [0,1). */
export function pickNeighbourPalette(rand: () => number, last?: number[]): number[] {
  const pool = NEIGHBOUR_PALETTES.filter((p) => p !== last);
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

/** A point just outside one of the village lanes, for a fountain. `rand` returns [0,1). */
export function pickLanePoint(rand: () => number, out: THREE.Vector3): THREE.Vector3 {
  const along = (rand() * 2 - 1) * LANE_HALF;
  const side = rand() < 0.5 ? -1 : 1;
  const lane = Math.floor(rand() * 4);
  if (lane < 2) return out.set(side * (LANE_X + LANE_OFFSET), 0.1, along);
  if (lane === 2) return out.set(along, 0.1, LANE_Z_SOUTH + LANE_OFFSET);
  return out.set(along, 0.1, LANE_Z_NORTH - LANE_OFFSET);
}

/**
 * Sends a shell up from behind the rooftops: a gold comet climbs to `to` shedding sparks, then breaks there in the
 * given shape. When too many shells are already climbing it bursts at once.
 */
export function launchShell(fx: FxContext, to: THREE.Vector3, style: BurstStyle, palette: number[], tune: BurstTune = {}): void {
  if (shells.length >= MAX_SHELLS) {
    aerialBurst(fx, to, style, palette, tune);
    return;
  }
  const from = new THREE.Vector3(to.x * 0.9, LAUNCH_HEIGHT, to.z * 0.9);
  shells.push({ from, to: to.clone(), t: 0, dur: RISE_BASE + Math.random() * RISE_EXTRA, style, palette, tune });
}

/** Sets off a short anar-style fountain at `at` (copied), unless too many are already going. */
export function startFountain(fx: FxContext, at: THREE.Vector3): void {
  if (fountains.length >= MAX_FOUNTAINS) return;
  fountains.push({ at: at.clone(), remaining: FOUNTAIN_SECONDS, gap: 0 });
  fx.flashes.flash(at, 0xffa030, 40, 14, 0.4);
}

/** Advances every climbing shell and spouting fountain by dt seconds; the game loop calls this every frame. */
export function neighbourShowTick(fx: FxContext, dt: number): void {
  let kept = 0;
  for (let i = 0; i < shells.length; i++) {
    const s = shells[i];
    s.t += dt;
    const k = Math.min(1, s.t / s.dur);
    // Ease-out: the shell leaves fast and slows as it nears the top.
    const e = 1 - (1 - k) * (1 - k);
    cometPos.lerpVectors(s.from, s.to, e);
    fx.sparks.emit(cometOpts);
    if (k >= 1) aerialBurst(fx, s.to, s.style, s.palette, s.tune);
    else shells[kept++] = s;
  }
  shells.length = kept;

  kept = 0;
  for (let i = 0; i < fountains.length; i++) {
    const f = fountains[i];
    f.remaining -= dt;
    f.gap -= dt;
    if (f.gap <= 0) {
      fountainOpts.position.copy(f.at);
      fx.sparks.emit(fountainOpts);
      f.gap = FOUNTAIN_GAP;
    }
    if (f.remaining > 0) fountains[kept++] = f;
  }
  fountains.length = kept;
}
