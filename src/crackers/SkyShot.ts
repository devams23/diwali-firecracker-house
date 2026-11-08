// Sky shot: a multi-shot cake on the ground. Once lit it fires twelve shells, one every 0.55 s. Each shell gives a
// launch thump at the cake, then rises on a slightly tilted path to 25 to 32 m over about a second, leaving a small
// spark trail and a faint whistle. At the top it bursts with a shared aerial burst and its own event. Willow always
// takes the gold palette, so the shapes and colours never line up by accident. The shell slots are a fixed array
// reused every shot, and the trail option object and direction are module-level, so flying does not allocate.
import * as THREE from 'three';
import { Cracker } from './Cracker';
import type { FxContext } from '../fx/FxContext';
import type { SoundHandle } from '../audio/AudioEngine';
import type { EmitOptions } from '../fx/SparkSystem';
import { aerialBurst, SKY_PALETTES, type BurstStyle } from '../fx/aerialBurst';
import { events } from '../core/events';

/** Number of shells in one sky shot. */
const SHELL_COUNT = 12;
/** Seconds between one shell's launch and the next. */
const SHELL_INTERVAL = 0.55;
/** Lowest burst height above the cake, in metres. */
const MIN_HEIGHT = 38;
/** Highest burst height above the cake, in metres. */
const MAX_HEIGHT = 52;
/** Shortest rise time to the burst point, in seconds. */
const RISE_MIN = 1.0;
/** Longest rise time to the burst point, in seconds. */
const RISE_MAX = 1.4;
/** Largest tilt of the rise path away from straight up, in radians. */
const TILT_MAX = 0.1;
/** Trail sparks per second while a shell rises. */
const TRAIL_RATE = 90;
/** Volume of the whistle that follows each rising shell. */
const WHISTLE_VOLUME = 0.5;
/** Burst power announced on the game event bus for each shell. */
const BURST_POWER = 0.6;
/** Index of the gold palette in SKY_PALETTES; willow always uses it. */
const GOLD_INDEX = 2;
/** Shapes the shells cycle through, in order. */
const STYLES: BurstStyle[] = ['peony', 'willow', 'crackle', 'ring'];
const TAU = Math.PI * 2;
const DOWN = new THREE.Vector3(0, -1, 0);
/** Trail spark options, reused for every trail emit; only the position and count change. */
const trailOpts: EmitOptions = {
  position: new THREE.Vector3(),
  direction: DOWN,
  speed: [0.6, 1.4],
  spread: 0.3,
  count: 1,
  colors: [0xffd27a, 0xfff0c0],
  life: [0.2, 0.45],
  size: [0.2, 0.32],
  gravity: 2,
};

/** One shell in flight. Slots are preallocated and reused across shots. */
interface Shell {
  /** True while the shell is rising. */
  active: boolean;
  /** Seconds since launch. */
  t: number;
  /** Seconds the rise takes. */
  duration: number;
  /** Launch point, copied from the cake. */
  start: THREE.Vector3;
  /** Burst point at the top of the rise. */
  end: THREE.Vector3;
  /** Current position on the rise. */
  pos: THREE.Vector3;
  /** Fractional trail-spark count carried between frames. */
  trailAcc: number;
  /** Shape this shell bursts into. */
  style: BurstStyle;
  /** Palette this shell bursts with. */
  palette: number[];
  /** Whistle that follows the shell, or null once it has burst. */
  whistle: SoundHandle | null;
}

/** Sky shot: launches twelve shells on a steady beat, each rising and then bursting high over the cake. */
export class SkyShot extends Cracker {
  /** Number of shells launched so far, which is also the next slot to use. */
  private launched = 0;
  /** Cake position on the ground, in world space, copied at ignition. */
  private readonly base = new THREE.Vector3();
  /** Fixed slots for the shells, one per shell in the shot. */
  private readonly shells: Shell[] = Array.from({ length: SHELL_COUNT }, () => ({
    active: false,
    t: 0,
    duration: 1,
    start: new THREE.Vector3(),
    end: new THREE.Vector3(),
    pos: new THREE.Vector3(),
    trailAcc: 0,
    style: 'peony' as BurstStyle,
    palette: SKY_PALETTES[0],
    whistle: null,
  }));

  /** Builds the sky shot around its model; the shells start when the fuse runs out. */
  constructor(fx: FxContext, model: THREE.Group) {
    super('skyshot', fx, model);
  }

  /** Records where the cake stands; the first thump follows on the first active frame. */
  protected onIgnite(): void {
    this.object.getWorldPosition(this.base);
  }

  /** Launches each shell as its slot comes, flies the rising ones, and ends when the last shell has burst. */
  protected onActive(dt: number): boolean {
    while (this.launched < SHELL_COUNT && this.activeTime >= this.launched * SHELL_INTERVAL) {
      this.launchShell(this.launched);
      this.launched++;
    }
    let live = 0;
    for (const s of this.shells) {
      if (!s.active) continue;
      live++;
      this.advance(s, dt);
    }
    return this.launched >= SHELL_COUNT && live === 0;
  }

  /** Stops any whistles still playing on top of the base cleanup, so a removed cake goes silent at once. */
  override dispose(): void {
    for (const s of this.shells) {
      s.whistle?.stop();
      s.whistle = null;
    }
    super.dispose();
  }

  /** Thump at the cake, then sets shell `k`'s rise: a random duration, a tilted path up to a random height, and its shape. */
  private launchShell(k: number): void {
    this.fx.audio.play('thump', this.base);
    const s = this.shells[k];
    const style = STYLES[k % STYLES.length];
    s.style = style;
    s.palette = style === 'willow' ? SKY_PALETTES[GOLD_INDEX] : SKY_PALETTES[k % SKY_PALETTES.length];
    s.active = true;
    s.t = 0;
    s.duration = RISE_MIN + Math.random() * (RISE_MAX - RISE_MIN);
    s.trailAcc = 0;

    const height = MIN_HEIGHT + Math.random() * (MAX_HEIGHT - MIN_HEIGHT);
    const az = Math.random() * TAU;
    const drift = height * Math.tan(Math.random() * TILT_MAX);
    s.start.copy(this.base);
    s.end.set(this.base.x + Math.cos(az) * drift, this.base.y + height, this.base.z + Math.sin(az) * drift);
    s.pos.copy(s.start);
    s.whistle = this.fx.audio.play('whistle', s.pos, { volume: WHISTLE_VOLUME, duration: s.duration });
  }

  /** Moves a rising shell along its path, trails sparks, and bursts it once it reaches the top. */
  private advance(s: Shell, dt: number): void {
    s.t += dt;
    const p = Math.min(1, s.t / s.duration);
    if (p >= 1) {
      this.burstShell(s);
      return;
    }
    // Ease-out: fast off the ground, slowing as the shell nears its burst point.
    const e = 1 - (1 - p) * (1 - p);
    s.pos.lerpVectors(s.start, s.end, e);
    s.whistle?.setPosition(s.pos);

    s.trailAcc += TRAIL_RATE * dt;
    const n = Math.floor(s.trailAcc);
    if (n > 0) {
      s.trailAcc -= n;
      trailOpts.position = s.pos;
      trailOpts.count = n;
      this.fx.sparks.emit(trailOpts);
    }
  }

  /** Bursts a shell at its end point with its shape and palette, announces the event, and frees its slot. */
  private burstShell(s: Shell): void {
    s.pos.copy(s.end);
    // Sky-show shells burst higher and wider than before, with every second one carrying a smaller second break.
    aerialBurst(this.fx, s.end, s.style, s.palette, { scale: 1.35, multiBreak: s.style !== 'willow' && Math.random() < 0.4 });
    events.emit('burst', { x: s.end.x, y: s.end.y, z: s.end.z, power: BURST_POWER });
    s.whistle?.stop();
    s.whistle = null;
    s.active = false;
  }
}
