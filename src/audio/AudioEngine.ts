// Web Audio front end: creates one AudioContext on the first user gesture, routes every sound through a
// master gain and compressor, places positional sounds with HRTF panners and keeps the listener on the camera.
// Sound recipes live in recipes.ts, the village soundscape in Ambience.ts and the raga playlist in ClassicalBed.ts.
import * as THREE from 'three';
import { RECIPES, type RecipeOpts } from './recipes';
import { startAmbience as runAmbience } from './Ambience';
import { startClassicalBed } from './ClassicalBed';

/** Every sound the game can request by name. */
export type SoundName =
  | 'fuse'
  | 'fizz'
  | 'hiss'
  | 'roar'
  | 'whistle'
  | 'whoosh'
  | 'boomBig'
  | 'crack'
  | 'pop'
  | 'popSmall'
  | 'sizzle'
  | 'thump'
  | 'farBoom'
  | 'ignite'
  | 'pickup'
  | 'place'
  | 'earRing'
  | 'chime'
  | 'bell'
  | 'shankh'
  | 'whoomp'
  | 'manjira'
  | 'shehnai'
  | 'dhol'
  | 'crowd';

/** Handle returned by play(); safe to call at any time, including after the sound has finished. */
export interface SoundHandle {
  /** Fades the sound out over `fadeSec` (default 0.05 s) and frees its nodes. */
  stop(fadeSec?: number): void;
  /** Moves a positional sound; does nothing for sounds played without a position. */
  setPosition(p: THREE.Vector3): void;
  /** Optional intensity control for looping sounds. */
  setParam?(v: number): void;
}

/** Optional per-call settings for play(). */
export interface PlayOpts {
  /** Loudness multiplier, clamped to 0..2. */
  volume?: number;
  /** Seconds an open-ended sound runs before stopping itself. */
  duration?: number;
  /** Frequency multiplier; 1 is the natural pitch. */
  pitch?: number;
}

/** Master level before the compressor; leaves headroom for many overlapping crackers. */
const MASTER_GAIN = 0.8;
/** Most sounds allowed to play at once; beyond this the quietest or oldest is cut short. */
const MAX_VOICES = 48;
/** Seconds of fade used when a voice is cut to make room for a new one. */
const EVICT_FADE = 0.03;

/** Returned whenever a sound cannot play (no context yet, muted, or skipped); every method does nothing. */
const NOOP_HANDLE: SoundHandle = {
  stop() {},
  setPosition() {},
};

/** Book-keeping for one sound that is still allowed to play, used to pick a voice to evict. */
interface ActiveVoice {
  volume: number;
  seq: number;
  stop(fadeSec: number): void;
}

/** Clamps `v` into [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Writes a world position into a panner, using the AudioParam setters with a setPosition fallback. */
function movePanner(pan: PannerNode, p: THREE.Vector3): void {
  if (pan.positionX) {
    pan.positionX.value = p.x;
    pan.positionY.value = p.y;
    pan.positionZ.value = p.z;
  } else {
    pan.setPosition(p.x, p.y, p.z);
  }
}

/**
 * The game's sound engine. Nothing touches AudioContext until init() runs on a user gesture, so every call
 * before that (and under Node tests) is a silent no-op.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muteFlag = false;
  private ambienceOn = false;
  private seq = 0;
  private readonly active = new Set<ActiveVoice>();
  private readonly listenerPos = new THREE.Vector3();
  private readonly listenerFwd = new THREE.Vector3();
  private readonly listenerUp = new THREE.Vector3();
  private readonly listenerQuat = new THREE.Quaternion();

  /** True once the AudioContext exists and sounds can play. */
  get ready(): boolean {
    return this.ctx !== null;
  }

  /** True while output is muted. */
  get muted(): boolean {
    return this.muteFlag;
  }

  /**
   * Creates the AudioContext (or the webkit fallback) and the master chain. Safe to call repeatedly; it
   * only resumes a suspended context after the first creation.
   */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
      return;
    }
    const Ctor =
      typeof AudioContext !== 'undefined'
        ? AudioContext
        : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = this.muteFlag ? 0 : MASTER_GAIN;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    } catch {
      // Audio is optional; a failed context leaves the engine silent rather than breaking the game.
      this.ctx = null;
      this.master = null;
    }
  }

  /**
   * Starts a named sound. Without a position it plays centred; with one it is panned and attenuated by
   * distance from the listener. Returns a no-op handle when the engine is not ready, muted or over capacity.
   */
  play(name: SoundName, position?: THREE.Vector3, opts: PlayOpts = {}): SoundHandle {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muteFlag) return NOOP_HANDLE;

    const volume = clamp(opts.volume ?? 1, 0, 2);
    if (!this.makeRoom(volume)) return NOOP_HANDLE;

    let panner: PannerNode | null = null;
    if (position) {
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 2;
      panner.rolloffFactor = 1.2;
      movePanner(panner, position);
      panner.connect(master);
    }

    const rec: ActiveVoice = { volume, seq: this.seq++, stop: () => {} };
    const recipeOpts: RecipeOpts = {
      volume,
      pitch: opts.pitch ?? 1,
      duration: opts.duration,
      onEnd: () => {
        this.active.delete(rec);
        panner?.disconnect();
      },
    };
    const inner = RECIPES[name](ctx, panner ?? master, recipeOpts);
    rec.stop = (fade) => inner.stop(fade);
    this.active.add(rec);

    return {
      stop: (fadeSec) => {
        this.active.delete(rec);
        inner.stop(fadeSec);
      },
      setPosition: (p) => {
        if (panner) movePanner(panner, p);
      },
    };
  }

  /**
   * Places the listener at the camera every frame. Writes through the AudioParam setters and reuses
   * preallocated vectors so the per-frame call creates no garbage.
   */
  updateListener(camera: THREE.Camera): void {
    const ctx = this.ctx;
    if (!ctx) return;
    camera.getWorldPosition(this.listenerPos);
    camera.getWorldDirection(this.listenerFwd);
    this.listenerUp.set(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(this.listenerQuat));
    const l = ctx.listener;
    const p = this.listenerPos;
    const f = this.listenerFwd;
    const u = this.listenerUp;
    if (l.positionX) {
      l.positionX.value = p.x;
      l.positionY.value = p.y;
      l.positionZ.value = p.z;
      l.forwardX.value = f.x;
      l.forwardY.value = f.y;
      l.forwardZ.value = f.z;
      l.upX.value = u.x;
      l.upY.value = u.y;
      l.upZ.value = u.z;
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }

  /** Mutes or unmutes by ramping the master gain, so toggling never clicks. */
  setMuted(m: boolean): void {
    this.muteFlag = m;
    if (!this.ctx || !this.master) return;
    const g = this.master.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(m ? 0 : MASTER_GAIN, t, 0.04);
  }

  /** Starts the village night loops (crickets, crackle bed, booms, bell, dog) and the sitar-and-tabla raga playlist. Idempotent. */
  startAmbience(): void {
    if (!this.ctx || !this.master || this.ambienceOn) return;
    this.ambienceOn = true;
    runAmbience(this.ctx, this.master);
    startClassicalBed(this.ctx, this.master);
  }

  /**
   * Makes space for a new sound when the cap is reached: the quietest (then oldest) voice is cut short,
   * unless the new sound is quieter than all of them, in which case the new sound is skipped.
   */
  private makeRoom(volume: number): boolean {
    if (this.active.size < MAX_VOICES) return true;
    let victim: ActiveVoice | null = null;
    for (const r of this.active) {
      if (!victim || r.volume < victim.volume || (r.volume === victim.volume && r.seq < victim.seq)) victim = r;
    }
    if (!victim || volume < victim.volume) return false;
    this.active.delete(victim);
    victim.stop(EVICT_FADE);
    return true;
  }
}
