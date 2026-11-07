// Sound recipes: every named sound is synthesized from a shared white-noise buffer and oscillators, then routed
// into the caller's output node. A recipe returns a SoundHandle and a Voice frees its nodes once the sources
// have ended, so one-shots never leak and looping sounds stop cleanly on stop() or their duration.
import type { SoundHandle, SoundName } from './AudioEngine';

/** Resolved options a recipe receives from AudioEngine.play. */
export interface RecipeOpts {
  /** Loudness multiplier; 1 is the recipe's natural level. */
  volume: number;
  /** Frequency and playback-rate multiplier; 1 is the natural pitch. */
  pitch: number;
  /** Seconds an open-ended sound runs for; one-shots ignore it. */
  duration?: number;
  /** Called once every source has ended and the voice's nodes are disconnected. */
  onEnd?: () => void;
}

/** A recipe builds its graph into `out` and returns the handle that controls it. */
export type Recipe = (ctx: AudioContext, out: AudioNode, o: RecipeOpts) => SoundHandle;

/** Near-silence used as the floor for exponential ramps, which cannot reach zero. */
const FLOOR = 1e-4;

const noiseCache = new WeakMap<AudioContext, AudioBuffer>();

/** Shared 2 s white-noise buffer, generated once per context and reused by every noise-based sound. */
export function noiseBuffer(ctx: AudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return buf;
}

/** Attack then exponential decay to silence over `dur` seconds, starting at time `t`. */
export function strike(g: AudioParam, t: number, peak: number, attack: number, dur: number): void {
  g.setValueAtTime(FLOOR, t);
  g.linearRampToValueAtTime(Math.max(peak, FLOOR), t + attack);
  g.exponentialRampToValueAtTime(FLOOR, t + dur);
}

/** Smooth swell in and back out to silence over `dur` seconds, used for roars and whooshes. */
function swell(g: AudioParam, t: number, peak: number, attack: number, dur: number): void {
  g.setValueAtTime(0, t);
  g.linearRampToValueAtTime(Math.max(peak, 0), t + attack);
  g.linearRampToValueAtTime(0, t + dur);
}

/**
 * Owns one playing sound: its output gain, every node and source it created, and any timers. It tears
 * everything down exactly once, after the last source reports it has ended.
 */
export class Voice {
  /** Output gain that every node in this voice feeds; automate it for envelopes and fades. */
  readonly gain: GainNode;
  private readonly ctx: AudioContext;
  private readonly onEnd: (() => void) | undefined;
  private readonly nodes: AudioNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly timers: number[] = [];
  private live = 0;
  private stopped = false;
  private torn = false;

  /** Creates the output gain and connects it to `out`; `onEnd` runs when the voice is torn down. */
  constructor(ctx: AudioContext, out: AudioNode, onEnd?: () => void) {
    this.ctx = ctx;
    this.onEnd = onEnd;
    this.gain = ctx.createGain();
    this.gain.connect(out);
    this.nodes.push(this.gain);
  }

  /** Registers an intermediate node (filter, gain, panner) so it is disconnected when the voice ends. */
  track<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }

  /** Registers a source; the last one to end tears the voice down. */
  source<T extends AudioScheduledSourceNode>(s: T): T {
    this.nodes.push(s);
    this.sources.push(s);
    this.live++;
    s.onended = () => {
      this.live--;
      if (this.live === 0) this.teardown();
    };
    return s;
  }

  /** Runs `fn` every `ms` until the voice stops; drives the random crackle flutter. */
  every(ms: number, fn: () => void): void {
    this.timers.push(setInterval(fn, ms));
  }

  /** Stops the voice on a timer after `sec` seconds, fading out over `fade`. */
  endAfter(sec: number, fade: number): void {
    this.timers.push(setTimeout(() => this.stop(fade), sec * 1000));
  }

  /** Fades the voice to silence over `fade` seconds and stops every source. Repeated calls are harmless. */
  stop(fade = 0.05): void {
    if (this.stopped) return;
    this.stopped = true;
    this.clearTimers();
    const now = this.ctx.currentTime;
    const g = this.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + fade);
    for (const s of this.sources) s.stop(now + fade);
  }

  /** The handle returned to callers; AudioEngine replaces setPosition for positional sounds. */
  handle(): SoundHandle {
    return {
      stop: (fade) => this.stop(fade),
      setPosition: () => {},
    };
  }

  /** Cancels every pending timer so no callback touches a torn-down voice. */
  private clearTimers(): void {
    for (const id of this.timers) clearInterval(id);
    this.timers.length = 0;
  }

  /** Disconnects every node once and reports the end to the owner. */
  private teardown(): void {
    if (this.torn) return;
    this.torn = true;
    this.clearTimers();
    for (const n of this.nodes) n.disconnect();
    this.onEnd?.();
  }
}

/** Looping or one-shot noise source at the given playback rate, registered with the voice. */
function noise(ctx: AudioContext, v: Voice, loop: boolean, rate: number): AudioBufferSourceNode {
  const s = v.source(ctx.createBufferSource());
  s.buffer = noiseBuffer(ctx);
  s.loop = loop;
  s.playbackRate.value = rate;
  return s;
}

/** Biquad filter of the given type, registered with the voice. */
function biquad(ctx: AudioContext, v: Voice, type: BiquadFilterType, freq: number, q: number): BiquadFilterNode {
  const f = v.track(ctx.createBiquadFilter());
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/** Oscillator at a fixed starting frequency, registered with the voice. */
function oscillator(ctx: AudioContext, v: Voice, type: OscillatorType, freq: number): OscillatorNode {
  const osc = v.source(ctx.createOscillator());
  osc.type = type;
  osc.frequency.value = freq;
  return osc;
}

/** Re-randomises the voice gain every `ms` around `base` by up to +/-`depth` (a fraction): the crackle. */
function crackle(ctx: AudioContext, v: Voice, base: number, depth: number, ms: number): void {
  v.gain.gain.value = base;
  v.every(ms, () => {
    const target = base * (1 - depth + Math.random() * 2 * depth);
    v.gain.gain.setTargetAtTime(target, ctx.currentTime, ms / 3000);
  });
}

/** Open-ended sounds: an explicit or default duration stops them on a timer, otherwise they run until stop(). */
function open(v: Voice, o: RecipeOpts, defaultSec?: number): SoundHandle {
  const sec = o.duration ?? defaultSec;
  if (sec !== undefined) v.endAfter(sec, 0.1);
  return v.handle();
}

/**
 * One filtered noise hit scheduled at `when`: the building block for ticks, pops, booms and barks.
 * The noise source stops just after the envelope ends so the voice can tear down.
 */
export function noiseHit(
  ctx: AudioContext,
  v: Voice,
  when: number,
  type: BiquadFilterType,
  freq: number,
  q: number,
  peak: number,
  attack: number,
  dur: number,
): void {
  const n = noise(ctx, v, false, 1);
  const f = biquad(ctx, v, type, freq, q);
  const g = v.track(ctx.createGain());
  n.connect(f);
  f.connect(g);
  g.connect(v.gain);
  strike(g.gain, when, peak, attack, dur);
  n.start(when);
  n.stop(when + dur + 0.02);
}

/** Burning fuse: highpassed noise with fast random gain flutter, looping until stopped. */
function fuse(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  const n = noise(ctx, v, true, o.pitch);
  n.connect(biquad(ctx, v, 'highpass', 2600 * o.pitch, 0.7)).connect(v.gain);
  crackle(ctx, v, 0.22 * o.volume, 0.6, 30);
  n.start();
  return open(v, o);
}

/** Fizz of sparks and wet paper: bandpassed noise with slow crackle, looping until stopped. */
function fizz(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  const n = noise(ctx, v, true, o.pitch);
  n.connect(biquad(ctx, v, 'bandpass', 3400 * o.pitch, 1.1)).connect(v.gain);
  crackle(ctx, v, 0.2 * o.volume, 0.5, 45);
  n.start();
  return open(v, o);
}

/** Steady hiss of a rocket or a sparkler: higher bandpassed noise with very light flutter. */
function hiss(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  const n = noise(ctx, v, true, o.pitch);
  n.connect(biquad(ctx, v, 'bandpass', 6000 * o.pitch, 0.5)).connect(v.gain);
  crackle(ctx, v, 0.1 * o.volume, 0.2, 120);
  n.start();
  return open(v, o);
}

/** Crowd or wind roar: noise through a lowpass whose cutoff opens from 400 Hz to 2.2 kHz over its length. */
function roar(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  const dur = o.duration ?? 3;
  const t = ctx.currentTime;
  const n = noise(ctx, v, true, o.pitch);
  const lp = biquad(ctx, v, 'lowpass', 400 * o.pitch, 1.2);
  lp.frequency.setValueAtTime(400 * o.pitch, t);
  lp.frequency.exponentialRampToValueAtTime(2200 * o.pitch, t + dur);
  n.connect(lp);
  lp.connect(v.gain);
  swell(v.gain.gain, t, 0.5 * o.volume, Math.min(0.6, dur * 0.25), dur);
  n.start(t);
  n.stop(t + dur);
  return v.handle();
}

/** Thin whistle: a sine gliding from 1800 Hz down to 900 Hz with a small vibrato. */
function whistle(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  const dur = o.duration ?? 0.9;
  const t = ctx.currentTime;
  const osc = oscillator(ctx, v, 'sine', 1800 * o.pitch);
  osc.frequency.setValueAtTime(1800 * o.pitch, t);
  osc.frequency.exponentialRampToValueAtTime(900 * o.pitch, t + dur);
  const vib = oscillator(ctx, v, 'sine', 6);
  const depth = v.track(ctx.createGain());
  depth.gain.value = 25 * o.pitch;
  vib.connect(depth);
  depth.connect(osc.frequency);
  osc.connect(v.gain);
  swell(v.gain.gain, t, 0.18 * o.volume, 0.05, dur);
  osc.start(t);
  vib.start(t);
  osc.stop(t + dur);
  vib.stop(t + dur);
  return v.handle();
}

/** Air whoosh of a rising rocket: noise through a bandpass sweeping 300 Hz to 3 kHz over 1.2 s. */
function whoosh(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  const dur = 1.2;
  const t = ctx.currentTime;
  const n = noise(ctx, v, false, o.pitch);
  const bp = biquad(ctx, v, 'bandpass', 300 * o.pitch, 1.4);
  bp.frequency.setValueAtTime(300 * o.pitch, t);
  bp.frequency.exponentialRampToValueAtTime(3000 * o.pitch, t + dur);
  n.connect(bp);
  bp.connect(v.gain);
  swell(v.gain.gain, t, 0.35 * o.volume, 0.35, dur);
  n.start(t);
  n.stop(t + dur);
  return v.handle();
}

/** Big cracker boom: a falling 55 to 30 Hz sine body, a lowpassed noise burst and a quieter echo 0.35 s later. */
function boomBig(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  const dur = 0.9;
  const t = ctx.currentTime;
  const body = oscillator(ctx, v, 'sine', 55 * o.pitch);
  body.frequency.setValueAtTime(55 * o.pitch, t);
  body.frequency.exponentialRampToValueAtTime(30 * o.pitch, t + dur);
  const bodyGain = v.track(ctx.createGain());
  body.connect(bodyGain);
  bodyGain.connect(v.gain);
  strike(bodyGain.gain, t, 0.9 * o.volume, 0.01, dur);
  body.start(t);
  body.stop(t + dur);
  noiseHit(ctx, v, t, 'lowpass', 420 * o.pitch, 0.7, 0.55 * o.volume, 0.005, dur);
  noiseHit(ctx, v, t + 0.35, 'lowpass', 300 * o.pitch, 0.7, 0.22 * o.volume, 0.005, dur);
  return v.handle();
}

/** Sharp crack: 40 ms of bandpassed noise at 2.5 kHz with an immediate attack. */
function crack(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  noiseHit(ctx, v, ctx.currentTime, 'bandpass', 2500 * o.pitch, 1.2, 0.9 * o.volume, 0.002, 0.04);
  return v.handle();
}

/** Pop: a short 100 ms bandpassed click around 1.8 kHz. */
function pop(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  noiseHit(ctx, v, ctx.currentTime, 'bandpass', 1800 * o.pitch, 2, 0.6 * o.volume, 0.003, 0.1);
  return v.handle();
}

/** Small pop: a 50 ms, higher and quieter click around 3.2 kHz. */
function popSmall(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  noiseHit(ctx, v, ctx.currentTime, 'bandpass', 3200 * o.pitch, 2.5, 0.35 * o.volume, 0.002, 0.05);
  return v.handle();
}

/** Sizzle of frying or a damp fuse: highpassed noise with crackle that ends on its own after 0.8 s. */
function sizzle(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  const n = noise(ctx, v, true, o.pitch);
  n.connect(biquad(ctx, v, 'highpass', 3800 * o.pitch, 0.9)).connect(v.gain);
  crackle(ctx, v, 0.14 * o.volume, 0.7, 25);
  n.start();
  return open(v, o, 0.8);
}

/** Low thump: an 80 ms sine dropping from 70 to 45 Hz. */
function thump(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  const t = ctx.currentTime;
  const osc = oscillator(ctx, v, 'sine', 70 * o.pitch);
  osc.frequency.setValueAtTime(70 * o.pitch, t);
  osc.frequency.exponentialRampToValueAtTime(45 * o.pitch, t + 0.08);
  osc.connect(v.gain);
  strike(v.gain.gain, t, 0.9 * o.volume, 0.004, 0.08);
  osc.start(t);
  osc.stop(t + 0.09);
  return v.handle();
}

/** Distant boom: noise lowpassed to 300 Hz with a slow swell, quiet enough to sit far away. */
function farBoom(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  noiseHit(ctx, v, ctx.currentTime, 'lowpass', 300 * o.pitch, 0.7, 0.22 * o.volume, 0.02, 1.6);
  return v.handle();
}

/** Ignition: a soft 350 ms fsss of bandpassed noise with a gentle attack. */
function ignite(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  noiseHit(ctx, v, ctx.currentTime, 'bandpass', 3000 * o.pitch, 0.8, 0.2 * o.volume, 0.05, 0.35);
  return v.handle();
}

/** Pickup: a soft 30 ms wooden tick around 1.2 kHz. */
function pickup(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  noiseHit(ctx, v, ctx.currentTime, 'bandpass', 1200 * o.pitch, 2, 0.2 * o.volume, 0.002, 0.03);
  return v.handle();
}

/** Place: a slightly lower, paper-like 30 ms tick around 800 Hz. */
function place(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  noiseHit(ctx, v, ctx.currentTime, 'bandpass', 800 * o.pitch, 2, 0.25 * o.volume, 0.002, 0.03);
  return v.handle();
}

/** Ear ring after a loud burst: a faint 4 kHz sine fading out over 2.5 s. */
function earRing(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  const t = ctx.currentTime;
  const osc = oscillator(ctx, v, 'sine', 4000 * o.pitch);
  osc.connect(v.gain);
  v.gain.gain.setValueAtTime(0.03 * o.volume, t);
  v.gain.gain.exponentialRampToValueAtTime(FLOOR, t + 2.5);
  osc.start(t);
  osc.stop(t + 2.5);
  return v.handle();
}

/** Recipe for every named sound; AudioEngine looks sounds up here by name. */
export const RECIPES: Record<SoundName, Recipe> = {
  fuse,
  fizz,
  hiss,
  roar,
  whistle,
  whoosh,
  boomBig,
  crack,
  pop,
  popSmall,
  sizzle,
  thump,
  farBoom,
  ignite,
  pickup,
  place,
  earRing,
};
