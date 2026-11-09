// Drone show: unlocked by lighting every diya. A flock of glowing drones, drawn as one additive point cloud, rises from
// the ground far beyond the house, glides through a handful of formations (scatter, a big diya with a flickering
// flame, a turning rangoli mandala, "HAPPY DIWALI", a colour burst), scatters, then sinks and fades. The state machine
// (waiting, countdown, live, done), the stage timeline and every formation are pure and tested under Node; only the
// text raster needs a canvas, and it falls back to a ring when none exists.
import * as THREE from 'three';
import type { Updatable } from '../core/Engine';

/** Number of drones in the flock. */
export const DRONE_COUNT = 420;
/** Seconds of "starting in 5..." between the last diya and the first drone leaving the ground. */
export const COUNTDOWN_SECONDS = 5;
/** Seconds each formation is held once the drones have arrived. */
const HOLD_SECONDS = 5;
/** Seconds the flock takes to glide from one formation to the next. */
const GLIDE_SECONDS = 3.5;
/** Seconds the final descent takes. */
const DESCEND_SECONDS = 5;
/** Number of formations that are held: scatter, diya, mandala, text, burst, scatter. */
const HELD_STAGES = 6;
/** Seconds one held stage lasts, glide in plus hold. */
const STAGE_SECONDS = GLIDE_SECONDS + HOLD_SECONDS;
/** Total length of the live show in seconds, about 56. */
export const SHOW_SECONDS = HELD_STAGES * STAGE_SECONDS + DESCEND_SECONDS;
/** Longest random head start a single drone waits before leaving on a glide, so the flock flows rather than snaps. */
const STAGGER_SECONDS = 0.9;
/** Seconds the flock takes to fade in at the start and out at the end. */
const FADE_IN = 1.5;
const FADE_OUT = 2.5;
/**
 * Centre of the show: high over the village, straight ahead of a player who stands in the courtyard facing the house.
 * Raised so the verandah eave hides less of it; the countdown pill also asks the player to step back and look up.
 */
const CENTRE = new THREE.Vector3(0, 80, -100);
/** Height of the ground-level start and landing positions, metres. */
const GROUND_Y = 2;

/** Where the show is in its life. */
export type DroneState = 'waiting' | 'countdown' | 'live' | 'done';

/**
 * Pure state machine: waiting becomes countdown once every diya is lit, countdown becomes live after
 * COUNTDOWN_SECONDS, live becomes done after SHOW_SECONDS. `since` is the time spent in `state`.
 */
export function advanceDroneState(state: DroneState, since: number, allLit: boolean): DroneState {
  switch (state) {
    case 'waiting':
      return allLit ? 'countdown' : 'waiting';
    case 'countdown':
      return since >= COUNTDOWN_SECONDS ? 'live' : 'countdown';
    case 'live':
      return since >= SHOW_SECONDS ? 'done' : 'live';
    default:
      return 'done';
  }
}

/** The whole number shown in "starting in N...", counting 5 down to 1, after `since` seconds of countdown. */
export function countdownNumber(since: number): number {
  return Math.min(COUNTDOWN_SECONDS, Math.max(1, Math.ceil(COUNTDOWN_SECONDS - since)));
}

/** Position of the live show on its timeline. */
export interface StageInfo {
  /** 0 to 5 are the held formations, 6 is the descent to the ground. */
  stage: number;
  /** Seconds since this stage began. */
  local: number;
  /** How long the glide into this stage takes. */
  glide: number;
}

/** Maps seconds since the show began to its stage; times past the end stay in the descent. */
export function stageAt(t: number): StageInfo {
  const time = Math.max(0, t);
  if (time >= HELD_STAGES * STAGE_SECONDS) return { stage: HELD_STAGES, local: time - HELD_STAGES * STAGE_SECONDS, glide: DESCEND_SECONDS };
  const stage = Math.floor(time / STAGE_SECONDS);
  return { stage, local: time - stage * STAGE_SECONDS, glide: GLIDE_SECONDS };
}

/** Smooth ease in and out of 0..1. */
export function easeInOut(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/** One target arrangement of the flock: a position and colour per drone, plus how it moves while held. */
export interface Formation {
  /** World positions, x y z per drone. */
  pos: Float32Array;
  /** Linear colours, r g b per drone, already brightened a little so the bloom pass lifts them. */
  col: Float32Array;
  /** Rotation about the view axis while held, radians per second. */
  spin: number;
  /** The first `flame` drones flicker like a flame. */
  flame: number;
  /** Amplitude of a slow breathing in and out about the centre, as a fraction of the radius. */
  pulse: number;
}

/** Small deterministic random generator, so formations are the same every run and testable. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Brightness multiplier for drone colours; above 1 so the brightest centres cross the bloom threshold lightly. */
const GLOW = 1.35;
const tmpColor = new THREE.Color();

/** Writes an HSL colour (each 0..1) into drone `i` of `col`, brightened by GLOW. */
function setCol(col: Float32Array, i: number, h: number, s: number, l: number): void {
  tmpColor.setHSL(h, s, l);
  col[i * 3] = tmpColor.r * GLOW;
  col[i * 3 + 1] = tmpColor.g * GLOW;
  col[i * 3 + 2] = tmpColor.b * GLOW;
}

/** Empty formation arrays for `n` drones. */
function blank(n: number, spin = 0, flame = 0, pulse = 0): Formation {
  return { pos: new Float32Array(n * 3), col: new Float32Array(n * 3), spin, flame, pulse };
}

/** Puts drone `i` at an offset from the show centre. */
function put(f: Formation, i: number, dx: number, dy: number, dz = 0): void {
  f.pos[i * 3] = CENTRE.x + dx;
  f.pos[i * 3 + 1] = CENTRE.y + dy;
  f.pos[i * 3 + 2] = CENTRE.z + dz;
}

/** A loose, warm-gold scatter across the sky, different for each seed. */
export function scatterFormation(n: number, seed: number): Formation {
  const r = seeded(seed);
  const f = blank(n);
  for (let i = 0; i < n; i++) {
    put(f, i, (r() - 0.5) * 100, (r() - 0.5) * 48, (r() - 0.5) * 30);
    setCol(f.col, i, 0.08 + r() * 0.06, 0.85, 0.6 + r() * 0.15);
  }
  return f;
}

/** The flock on the ground, spread in a band behind the village; the start and the landing. */
export function groundFormation(n: number): Formation {
  const r = seeded(7);
  const f = blank(n);
  for (let i = 0; i < n; i++) {
    f.pos[i * 3] = (r() - 0.5) * 70;
    f.pos[i * 3 + 1] = GROUND_Y + r() * 2;
    f.pos[i * 3 + 2] = CENTRE.z + (r() - 0.5) * 24;
    setCol(f.col, i, 0.09, 0.8, 0.55);
  }
  return f;
}

/** A big clay diya: a filled shallow bowl with a flat rim and a teardrop flame above whose drones flicker. */
export function diyaFormation(n: number): Formation {
  const r = seeded(11);
  const flame = Math.round(n * 0.27);
  const rim = Math.round(n * 0.12);
  const f = blank(n, 0, flame);
  for (let i = 0; i < n; i++) {
    if (i < flame) {
      // Flame: a teardrop that is widest low down and tapers to a point, hottest (whiter) at the core.
      const v = (i + 0.5) / flame;
      const w = 7 * Math.sin(Math.PI * Math.pow(v, 0.6));
      put(f, i, (r() * 2 - 1) * w, -4 + 28 * v, (r() - 0.5) * 3);
      setCol(f.col, i, 0.14 - 0.06 * (1 - v), 0.95 - 0.5 * (1 - v), 0.55 + 0.3 * (1 - v));
    } else if (i < flame + rim) {
      // Rim: an evenly spaced line across the top of the bowl.
      const k = (i - flame) / (rim - 1);
      put(f, i, -26 + 52 * k, -8, 0);
      setCol(f.col, i, 0.12, 0.9, 0.62);
    } else {
      // Bowl: a filled lower half-ellipse, denser at its edge so the outline reads.
      const th = r() * Math.PI;
      const s = Math.sqrt(0.25 + 0.75 * r());
      put(f, i, 24 * s * Math.cos(th), -8 - 12 * s * Math.sin(th), (r() - 0.5) * 3);
      setCol(f.col, i, 0.06 + 0.03 * s, 0.9, 0.5);
    }
  }
  return f;
}

/** A rangoli lotus mandala: six petalled rings in turning colours, slowly rotating. */
export function mandalaFormation(n: number): Formation {
  const f = blank(n, 0.25);
  const rings = 6;
  const radii = Array.from({ length: rings }, (_, k) => 5 + k * 5);
  const total = radii.reduce((a, b) => a + b, 0);
  const hues = [0.95, 0.06, 0.12, 0.88, 0.02, 0.1];
  let i = 0;
  for (let k = 0; k < rings && i < n; k++) {
    const count = k === rings - 1 ? n - i : Math.round((n * radii[k]) / total);
    const petals = k % 2 === 0 ? 8 : 12;
    for (let j = 0; j < count && i < n; j++, i++) {
      const th = (j / count) * Math.PI * 2;
      const rad = radii[k] * (1 + 0.2 * Math.cos(petals * th));
      put(f, i, rad * Math.cos(th), rad * Math.sin(th), 0);
      setCol(f.col, i, hues[k], 0.85, 0.6);
    }
  }
  return f;
}

/** A starburst: rays of drones fanning from the centre, each ray its own hue, breathing gently. */
export function burstFormation(n: number): Formation {
  const f = blank(n, 0.12, 0, 0.05);
  const rays = 16;
  for (let i = 0; i < n; i++) {
    const ray = i % rays;
    const step = Math.floor(i / rays);
    const per = Math.ceil(n / rays);
    const d = 4 + 31 * ((step + 1) / per);
    const th = (ray / rays) * Math.PI * 2;
    put(f, i, d * Math.cos(th), d * Math.sin(th), 0);
    setCol(f.col, i, (ray / rays + 0.55) % 1, 0.7, 0.55 + 0.2 * (d / 35));
  }
  return f;
}

/** Colours a point cloud in two lines of text: gold on top, warm pink below, shifting with x. */
function colourText(f: Formation, n: number): void {
  for (let i = 0; i < n; i++) {
    const dy = f.pos[i * 3 + 1] - CENTRE.y;
    const dx = f.pos[i * 3] - CENTRE.x;
    setCol(f.col, i, dy > 0 ? 0.12 : 0.97, 0.85, 0.6 + 0.1 * Math.sin(dx * 0.2));
  }
}

/**
 * "HAPPY DIWALI" in two lines, sampled from a canvas rasterisation into drone positions about 70 m wide. Without a
 * canvas (Node tests) the same number of drones form a ring instead, so the formation is always valid.
 */
export function textFormation(n: number): Formation {
  const f = blank(n);
  const pts: number[] = [];
  if (typeof document !== 'undefined') {
    const w = 640;
    const h = 260;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = '#fff';
      g.font = "900 120px Nunito, 'Arial Black', Arial, sans-serif";
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('HAPPY', w / 2, h * 0.27);
      g.fillText('DIWALI', w / 2, h * 0.73);
      const data = g.getImageData(0, 0, w, h).data;
      for (let y = 0; y < h; y += 3) {
        for (let x = 0; x < w; x += 3) if (data[(y * w + x) * 4 + 3] > 128) pts.push(x, y);
      }
    }
  }
  if (pts.length >= 2) {
    const count = pts.length / 2;
    const scale = 70 / 640;
    const r = seeded(5);
    for (let i = 0; i < n; i++) {
      // Even stride through the pixel list so the drones cover every letter.
      const k = Math.floor((i * count) / n);
      put(f, i, (pts[k * 2] - 320) * scale + (r() - 0.5) * 0.4, (130 - pts[k * 2 + 1]) * scale, (r() - 0.5) * 0.6);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2;
      put(f, i, 30 * Math.cos(th), 12 * Math.sin(th));
    }
  }
  colourText(f, n);
  return f;
}

/** Soft round sprite so each drone is a glowing dot rather than a square. */
function dotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}

/** The drone show: owns the point cloud, runs the state machine and animates the flock. */
export class DroneShow implements Updatable {
  /** Scene root holding the point cloud; hidden unless the show is live. */
  readonly object = new THREE.Group();
  private stateNow: DroneState = 'waiting';
  private since = 0;
  private allLit = false;
  /** Seconds since the live show began. */
  private clock = 0;
  private lastStage = -1;
  private readonly formations: Formation[];
  private readonly cur = new Float32Array(DRONE_COUNT * 3);
  private readonly curCol = new Float32Array(DRONE_COUNT * 3);
  private readonly from = new Float32Array(DRONE_COUNT * 3);
  private readonly fromCol = new Float32Array(DRONE_COUNT * 3);
  /** Per-drone head start in seconds, fixed, so glides ripple through the flock. */
  private readonly delay = new Float32Array(DRONE_COUNT);
  private readonly points: THREE.Points;
  private readonly material: THREE.PointsMaterial;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly colAttr: THREE.BufferAttribute;

  constructor() {
    this.formations = [
      scatterFormation(DRONE_COUNT, 3),
      diyaFormation(DRONE_COUNT),
      mandalaFormation(DRONE_COUNT),
      textFormation(DRONE_COUNT),
      burstFormation(DRONE_COUNT),
      scatterFormation(DRONE_COUNT, 9),
      groundFormation(DRONE_COUNT),
    ];
    const r = seeded(21);
    for (let i = 0; i < DRONE_COUNT; i++) this.delay[i] = r() * STAGGER_SECONDS;
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.cur, 3);
    this.colAttr = new THREE.BufferAttribute(this.curCol, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    this.material = new THREE.PointsMaterial({
      size: 1.9,
      map: dotTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      // Far from the village the night fog would swallow them.
      fog: false,
    });
    this.points = new THREE.Points(geo, this.material);
    // Positions change every frame and span the whole sky, so the bounding sphere is never worth computing.
    this.points.frustumCulled = false;
    this.object.add(this.points);
    this.object.visible = false;
  }

  /** Where the show is: waiting, countdown, live or done. */
  get state(): DroneState {
    return this.stateNow;
  }

  /** The number to show during the countdown (5 down to 1). */
  get countdown(): number {
    return countdownNumber(this.since);
  }

  /** Tells the show how many diyas are lit; the countdown starts once all are. */
  notifyLit(lit: number, total: number): void {
    this.allLit = lit >= total;
  }

  /** Starts the live show at once, skipping the diyas and the countdown (debug hook). */
  force(): void {
    this.enter('live');
  }

  /** Advances the state machine and, while live, animates the flock. */
  update(dt: number): void {
    this.since += dt;
    const next = advanceDroneState(this.stateNow, this.since, this.allLit);
    if (next !== this.stateNow) this.enter(next);
    if (this.stateNow !== 'live') return;
    this.clock += dt;
    this.animate(this.clock);
  }

  /** Switches state, resetting the stage timer and putting the flock on the ground when the show goes live. */
  private enter(s: DroneState): void {
    this.stateNow = s;
    this.since = 0;
    if (s === 'live') {
      this.clock = 0;
      this.lastStage = -1;
      this.cur.set(this.formations[6].pos);
      this.curCol.set(this.formations[6].col);
      this.object.visible = true;
    } else if (s === 'done') {
      this.object.visible = false;
    }
  }

  /** Glides every drone toward the current stage's formation and sets the flock's overall opacity. */
  private animate(t: number): void {
    const { stage, local, glide } = stageAt(t);
    if (stage !== this.lastStage) {
      // New stage: remember where every drone is, and glide from there.
      this.lastStage = stage;
      this.from.set(this.cur);
      this.fromCol.set(this.curCol);
    }
    const f = this.formations[stage];
    const ang = f.spin * t;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const breathe = 1 + f.pulse * Math.sin(t * 1.6);
    for (let i = 0; i < DRONE_COUNT; i++) {
      const k = i * 3;
      // Held formation: rotate and breathe about the show centre.
      let dx = (f.pos[k] - CENTRE.x) * breathe;
      let dy = (f.pos[k + 1] - CENTRE.y) * breathe;
      const rx = dx * ca - dy * sa;
      const ry = dx * sa + dy * ca;
      // Ground formations are not about the centre, so only spin the ones that are (spin is 0 for the rest).
      dx = f.spin === 0 && f.pulse === 0 ? f.pos[k] - CENTRE.x : rx;
      dy = f.spin === 0 && f.pulse === 0 ? f.pos[k + 1] - CENTRE.y : ry;
      let tx = CENTRE.x + dx;
      let ty = CENTRE.y + dy;
      const tz = f.pos[k + 2];
      let bright = 1;
      if (i < f.flame) {
        // Flame drones sway and flicker brighter and dimmer, faster toward the tip.
        const q = Math.sin(t * 9 + i * 1.7) * 0.5 + Math.sin(t * 5.3 + i) * 0.5;
        tx += q * 0.6;
        ty += q * 0.9;
        bright = 0.85 + 0.15 * q;
      }
      // Tiny hover bob, so held drones never look frozen.
      ty += Math.sin(t * 1.3 + i) * 0.25;
      const e = easeInOut((local - this.delay[i]) / (glide - STAGGER_SECONDS));
      this.cur[k] = this.from[k] + (tx - this.from[k]) * e;
      this.cur[k + 1] = this.from[k + 1] + (ty - this.from[k + 1]) * e;
      this.cur[k + 2] = this.from[k + 2] + (tz - this.from[k + 2]) * e;
      for (let c = 0; c < 3; c++) {
        this.curCol[k + c] = (this.fromCol[k + c] + (f.col[k + c] - this.fromCol[k + c]) * e) * bright;
      }
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.material.opacity = Math.max(0, Math.min(1, t / FADE_IN, (SHOW_SECONDS - t) / FADE_OUT));
  }
}
