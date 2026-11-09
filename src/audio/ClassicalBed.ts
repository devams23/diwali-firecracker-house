// Classical background bed: a soft Hindustani evening sound under the village. A tanpura plucks its four strings
// (Pa, Sa, Sa, low Sa) in an endless slow cycle, and a bansuri wanders through Raag Bhoopali (Sa Re Ga Pa Dha,
// a festive evening raga) in short breathy phrases with glides and gentle vibrato. Both run through a synthetic
// hall reverb and one quiet bus, so the music sits behind the crickets and never competes with the fireworks.

/** Overall level of the music bus on the master; low so it reads as background. */
const MUSIC_GAIN = 0.32;
/** Tonic (Sa) of the tanpura in Hz, D3. The bansuri plays an octave above. */
const SA = 146.83;
/** Seconds between tanpura plucks; one full four-string cycle takes four of these. */
const PLUCK_GAP = 1.25;
/** Bhoopali scale degrees as just ratios of Sa: Sa, Re, Ga, Pa, Dha. */
const BHOOPALI = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
/** How far ahead (s) notes are scheduled, and how often (ms) the scheduler wakes up. */
const LOOKAHEAD = 1.5;
const TICK_MS = 400;

/** Random number in [a, b). */
function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** Frequency of Bhoopali degree `i` counted from the bansuri's Sa (i may go below 0 or above 4 into other octaves). */
function bansuriFreq(i: number): number {
  const oct = Math.floor(i / BHOOPALI.length);
  const deg = ((i % BHOOPALI.length) + BHOOPALI.length) % BHOOPALI.length;
  return SA * 2 * BHOOPALI[deg] * 2 ** oct;
}

/** Builds a decaying stereo noise impulse response: a cheap, smooth hall for the music to sit in. */
function hallImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.5;
  }
  return buf;
}

/** Disconnects every node once `src` stops, so finished notes leave nothing behind in the graph. */
function cleanup(src: AudioScheduledSourceNode, ...nodes: AudioNode[]): void {
  src.onended = () => {
    src.disconnect();
    for (const n of nodes) n.disconnect();
  };
}

/**
 * One tanpura pluck: two slightly detuned sawtooths (the shimmer of the jawari bridge) through a lowpass that
 * slowly closes, with a fast attack and a long ring-out.
 */
function pluck(ctx: AudioContext, out: AudioNode, when: number, freq: number): void {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 2;
  lp.frequency.setValueAtTime(2400, when);
  lp.frequency.exponentialRampToValueAtTime(500, when + 4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.09, when + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0008, when + 5);
  lp.connect(g);
  g.connect(out);
  for (const detune of [-4, 5]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(lp);
    o.start(when);
    o.stop(when + 5.1);
    cleanup(o);
  }
  // The filter and gain outlive both oscillators by a hair; release them shortly after.
  setTimeout(() => {
    lp.disconnect();
    g.disconnect();
  }, (when - ctx.currentTime + 5.3) * 1000);
}

/**
 * One bansuri note: a sine with a touch of triangle for body, a glide (meend) from the previous pitch, a slow
 * vibrato that blooms as the note holds, and a puff of filtered breath noise at its start.
 */
function flute(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, when: number, from: number, to: number, dur: number): void {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.07, when + 0.12);
  g.gain.setValueAtTime(0.07, when + dur * 0.7);
  g.gain.linearRampToValueAtTime(0, when + dur);
  g.connect(out);

  // Vibrato: a 5 Hz wobble that fades in over the first half of the note.
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.2;
  const vibDepth = ctx.createGain();
  vibDepth.gain.setValueAtTime(0, when);
  vibDepth.gain.linearRampToValueAtTime(to * 0.006, when + dur * 0.5);
  vib.connect(vibDepth);
  vib.start(when);
  vib.stop(when + dur + 0.05);
  cleanup(vib, vibDepth);

  // Tone: a sine plus a quieter triangle, both gliding into the target pitch.
  const glide = Math.min(0.25, dur * 0.3);
  for (const [type, level] of [['sine', 1], ['triangle', 0.25]] as const) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, when);
    o.frequency.exponentialRampToValueAtTime(to, when + glide);
    vibDepth.connect(o.frequency);
    const lvl = ctx.createGain();
    lvl.gain.value = level;
    o.connect(lvl);
    lvl.connect(g);
    o.start(when);
    o.stop(when + dur + 0.05);
    cleanup(o, lvl);
  }

  // Breath: a short bandpassed noise puff around the pitch's upper harmonics.
  const n = ctx.createBufferSource();
  n.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = to * 3;
  bp.Q.value = 1.5;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.02, when);
  ng.gain.exponentialRampToValueAtTime(0.0005, when + 0.35);
  n.connect(bp);
  bp.connect(ng);
  ng.connect(out);
  n.start(when);
  n.stop(when + 0.4);
  cleanup(n, bp, ng);
  setTimeout(() => g.disconnect(), (when - ctx.currentTime + dur + 0.3) * 1000);
}

/**
 * Starts the classical bed on `out` and keeps it going for as long as the page lives. Notes are scheduled a
 * little ahead of time on the audio clock, so timing stays smooth even when the main thread is busy.
 */
export function startClassicalBed(ctx: AudioContext, out: AudioNode): void {
  // Music bus: everything below feeds `bus`, which splits into a dry path and a long reverb, then out.
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0, ctx.currentTime);
  bus.gain.linearRampToValueAtTime(MUSIC_GAIN, ctx.currentTime + 8); // fades in over 8 s
  const verb = ctx.createConvolver();
  verb.buffer = hallImpulse(ctx, 3.5);
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  const dry = ctx.createGain();
  dry.gain.value = 0.6;
  bus.connect(dry);
  bus.connect(verb);
  verb.connect(wet);
  dry.connect(out);
  wet.connect(out);

  // Shared half-second of white noise for the bansuri's breath.
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  // Tanpura string order for one cycle: Pa (below Sa), Sa, Sa, low Sa.
  const strings = [SA * 0.75, SA, SA, SA / 2];
  let nextPluck = ctx.currentTime + 0.2;
  let stringIdx = 0;

  // Bansuri state: the next note time, the current scale degree, and the last pitch (for glides).
  let nextNote = ctx.currentTime + 6; // the flute enters after the drone has settled
  let degree = 0;
  let lastFreq = bansuriFreq(0);
  let phraseLeft = 0;

  /** Schedules everything that falls inside the lookahead window. */
  const tick = (): void => {
    const horizon = ctx.currentTime + LOOKAHEAD;

    // Tanpura: an unbroken cycle of plucks.
    while (nextPluck < horizon) {
      pluck(ctx, bus, nextPluck, strings[stringIdx]);
      stringIdx = (stringIdx + 1) % strings.length;
      nextPluck += PLUCK_GAP;
    }

    // Bansuri: phrases of 4 to 9 notes moving by small steps, each ending on a held resting note, then a pause.
    while (nextNote < horizon) {
      if (phraseLeft <= 0) {
        phraseLeft = 4 + Math.floor(rand(0, 6));
        nextNote += rand(2.5, 6); // breathe between phrases
        continue;
      }
      // Mostly stepwise motion, sometimes a leap of two, kept within about an octave and a half.
      const step = Math.random() < 0.8 ? (Math.random() < 0.5 ? -1 : 1) : Math.random() < 0.5 ? -2 : 2;
      degree = Math.max(-2, Math.min(7, degree + step));
      phraseLeft--;
      // The last note of a phrase settles on Sa, Ga or Pa and holds longer.
      if (phraseLeft === 0) degree = [0, 2, 3, 5][Math.floor(rand(0, 4))];
      const dur = phraseLeft === 0 ? rand(2.2, 3.4) : rand(0.45, 1.1);
      const f = bansuriFreq(degree);
      flute(ctx, bus, noise, nextNote, lastFreq, f, dur);
      lastFreq = f;
      nextNote += dur * rand(0.92, 1.0);
    }
  };
  tick();
  setInterval(tick, TICK_MS);
}
