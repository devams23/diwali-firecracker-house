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

/**
 * Chime for lighting a diya: two pure sine partials (a fundamental near 1.3 kHz and a fifth above it) struck softly
 * together, the upper one dying sooner, so it rings like a small brass bell. `pitch` varies it from lamp to lamp.
 */
function chime(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  const t = ctx.currentTime;
  strike(v.gain.gain, t, 0.5 * o.volume, 0.004, 1.6);
  const partials: [number, number, number][] = [[1320, 1, 1.6], [1980, 0.45, 0.9], [3520, 0.12, 0.4]];
  for (const [f, amp, dur] of partials) {
    const osc = oscillator(ctx, v, 'sine', f * o.pitch);
    const g = v.track(ctx.createGain());
    strike(g.gain, t, amp, 0.003, dur);
    osc.connect(g).connect(v.gain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
  return v.handle();
}

/** Temple bell: inharmonic sine partials over a 440 Hz strike tone, ringing for about three seconds. */
function bell(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  const t = ctx.currentTime;
  strike(v.gain.gain, t, 0.55 * o.volume, 0.006, 3.4);
  const partials: [number, number, number][] = [[1, 1, 3.2], [2.01, 0.6, 2.4], [2.76, 0.4, 1.8], [5.4, 0.2, 1.0], [8.9, 0.08, 0.5]];
  for (const [ratio, amp, dur] of partials) {
    const osc = oscillator(ctx, v, 'sine', 440 * ratio * o.pitch);
    const g = v.track(ctx.createGain());
    strike(g.gain, t, amp, 0.004, dur);
    osc.connect(g).connect(v.gain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
  return v.handle();
}

/**
 * Shankh (conch) call: a warm low tone, sawtooth softened by a lowpass, that swells in over 0.6 s, holds with a slight
 * vibrato and fades out, about three seconds in all.
 */
function shankh(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  const t = ctx.currentTime;
  const dur = 3;
  const base = 233 * o.pitch;
  const filt = biquad(ctx, v, 'lowpass', 900, 1.2);
  filt.connect(v.gain);
  v.gain.gain.setValueAtTime(0, t);
  v.gain.gain.linearRampToValueAtTime(0.32 * o.volume, t + 0.6);
  v.gain.gain.setValueAtTime(0.32 * o.volume, t + 1.8);
  v.gain.gain.linearRampToValueAtTime(0, t + dur);
  const vib = oscillator(ctx, v, 'sine', 5.2);
  const vibDepth = v.track(ctx.createGain());
  vibDepth.gain.value = 3;
  vib.connect(vibDepth);
  for (const mult of [1, 2.002, 3.005]) {
    const osc = oscillator(ctx, v, mult === 1 ? 'sawtooth' : 'triangle', base * mult);
    vibDepth.connect(osc.frequency);
    const g = v.track(ctx.createGain());
    g.gain.value = mult === 1 ? 1 : 0.35 / mult;
    osc.connect(g).connect(filt);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
  vib.start(t);
  vib.stop(t + dur + 0.05);
  return v.handle();
}

/**
 * Soft "whoomp" of a diya flame catching: a low sine that sags in pitch plus a breath of lowpassed noise, both
 * rounded and quiet. `pitch` varies it a little from lamp to lamp.
 */
function whoomp(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  const t = ctx.currentTime;
  strike(v.gain.gain, t, 0.4 * o.volume, 0.03, 0.5);
  // Warm body: a sine that drops from 170 Hz to 85 Hz as the flame settles.
  const body = oscillator(ctx, v, 'sine', 170 * o.pitch);
  body.frequency.exponentialRampToValueAtTime(85 * o.pitch, t + 0.35);
  body.connect(v.gain);
  body.start(t);
  body.stop(t + 0.55);
  // Breath of the flame: noise through a lowpass that opens then closes.
  const n = noise(ctx, v, false, 0.7);
  const lp = biquad(ctx, v, 'lowpass', 500, 0.7);
  lp.frequency.linearRampToValueAtTime(1400, t + 0.08);
  lp.frequency.linearRampToValueAtTime(300, t + 0.45);
  const ng = v.track(ctx.createGain());
  strike(ng.gain, t, 0.35, 0.04, 0.45);
  n.connect(lp).connect(ng).connect(v.gain);
  n.start(t, Math.random());
  n.stop(t + 0.5);
  return v.handle();
}

/**
 * Manjira / ghungroo shimmer: a handful of tiny, high, inharmonic sine glints scattered over about 0.35 s, very
 * quiet, so it sparkles rather than rings. Each call scatters differently.
 */
function manjira(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  const t = ctx.currentTime;
  v.gain.gain.value = 0.16 * o.volume;
  for (let k = 0; k < 5; k++) {
    const at = t + Math.random() * 0.25;
    const f = (3600 + Math.random() * 2600) * o.pitch;
    const dur = 0.12 + Math.random() * 0.1;
    const osc = oscillator(ctx, v, 'sine', f);
    const g = v.track(ctx.createGain());
    strike(g.gain, at, 0.5, 0.002, dur);
    osc.connect(g).connect(v.gain);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }
  return v.handle();
}

/**
 * Shehnai phrase: one sawtooth, bandpassed to a reedy nasal tone, with vibrato, gliding up a Bhairav-style scale in
 * about 3 s and settling on a held top note. Kept quiet.
 */
function shehnai(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  const t = ctx.currentTime;
  const dur = 3.4;
  const g = v.gain.gain;
  g.setValueAtTime(0, t);
  g.linearRampToValueAtTime(0.2 * o.volume, t + 0.15);
  g.setValueAtTime(0.2 * o.volume, t + 2.6);
  g.linearRampToValueAtTime(0, t + dur);
  // Rising phrase (Hz): Sa, komal Re, Ga, Pa, Dha, then the upper Sa held.
  const notes = [294, 311, 370, 440, 466, 587];
  const times = [0, 0.4, 0.8, 1.3, 1.8, 2.3];
  const osc = oscillator(ctx, v, 'sawtooth', notes[0] * o.pitch);
  notes.forEach((f, i) => {
    // Each note slides in over 80 ms, like a reed player's glide.
    osc.frequency.setValueAtTime(i ? notes[i - 1] * o.pitch : f * o.pitch, t + times[i]);
    osc.frequency.linearRampToValueAtTime(f * o.pitch, t + times[i] + 0.08);
  });
  const vib = oscillator(ctx, v, 'sine', 5.6);
  const vibDepth = v.track(ctx.createGain());
  vibDepth.gain.value = 6;
  vib.connect(vibDepth).connect(osc.frequency);
  const bp = biquad(ctx, v, 'bandpass', 1500, 1.6);
  osc.connect(bp).connect(v.gain);
  for (const s of [osc, vib]) {
    s.start(t);
    s.stop(t + dur + 0.05);
  }
  return v.handle();
}

/**
 * Dhol rhythm with manjira: a bass thump on the beat and a bright slap on the off-beat, a 3 s pattern of 12 steps,
 * with tiny cymbal glints on every step. Soft enough to sit under the shehnai.
 */
function dhol(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  const t = ctx.currentTime;
  v.gain.gain.value = 0.5 * o.volume;
  // 1 = bass (dagga), 2 = slap (tabli), 0 = rest; a lively Keherwa-like pattern.
  const pattern = [1, 0, 2, 0, 1, 1, 2, 0, 1, 0, 2, 2];
  const step = 0.25;
  pattern.forEach((hit, i) => {
    const at = t + i * step;
    if (hit === 1) {
      const osc = oscillator(ctx, v, 'sine', 120 * o.pitch);
      osc.frequency.setValueAtTime(120 * o.pitch, at);
      osc.frequency.exponentialRampToValueAtTime(60 * o.pitch, at + 0.15);
      const g = v.track(ctx.createGain());
      strike(g.gain, at, 0.8, 0.004, 0.22);
      osc.connect(g).connect(v.gain);
      osc.start(at);
      osc.stop(at + 0.25);
    } else if (hit === 2) {
      const n = noise(ctx, v, false, 1);
      const bp = biquad(ctx, v, 'bandpass', 1800, 1.2);
      const g = v.track(ctx.createGain());
      strike(g.gain, at, 0.35, 0.002, 0.09);
      n.connect(bp).connect(g).connect(v.gain);
      n.start(at, Math.random());
      n.stop(at + 0.12);
    }
    // Manjira glint on every step, very faint.
    const osc = oscillator(ctx, v, 'sine', 5200 + (i % 3) * 700);
    const g = v.track(ctx.createGain());
    strike(g.gain, at, 0.05, 0.002, 0.08);
    osc.connect(g).connect(v.gain);
    osc.start(at);
    osc.stop(at + 0.12);
  });
  return v.handle();
}

/** Distant cheering crowd: three soft swells of bandpassed noise over about 3.4 s, low and far away. */
function crowd(ctx: AudioContext, out: AudioNode, o: RecipeOpts): SoundHandle {
  const v = new Voice(ctx, out, o.onEnd);
  const t = ctx.currentTime;
  const n = noise(ctx, v, true, 0.9);
  const bp = biquad(ctx, v, 'bandpass', 900, 0.8);
  n.connect(bp).connect(v.gain);
  v.gain.gain.setValueAtTime(0, t);
  for (const [at, peak] of [[0.2, 0.09], [1.3, 0.12], [2.3, 0.08]]) {
    v.gain.gain.linearRampToValueAtTime(peak * o.volume, t + at + 0.4);
    v.gain.gain.linearRampToValueAtTime(0.01, t + at + 0.95);
  }
  v.gain.gain.linearRampToValueAtTime(0, t + 3.6);
  n.start(t);
  n.stop(t + 3.7);
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
  chime,
  bell,
  shankh,
  whoomp,
  manjira,
  shehnai,
  dhol,
  crowd,
};
