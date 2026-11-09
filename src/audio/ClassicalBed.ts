// Classical background music: a soothing sitar recording looping softly and endlessly under the village sounds.
// The track is the first eight minutes of "Sitar For Scattered Thoughts" (an Indian meditation piece the owner chose),
// loudness-matched and re-encoded to MP3 in public/audio with no fades. Two players take turns: shortly before one
// reaches the end, the other starts from the top and the two crossfade, so the music never stops, dips or pauses.
// It feeds the master bus, so the game's mute toggle silences it too.

/** The looping recording, relative to the site base. */
const TRACK = 'audio/sitar-meditation.mp3';
/** Music level on the master bus: low and soothing, so it reads as background. */
const MUSIC_GAIN = 0.4;
/** Seconds for the music to fade in when it first starts. */
const FADE_IN = 6;
/** Seconds the outgoing and incoming players overlap at each loop point. */
const CROSSFADE = 6;
/** How often (ms) the loop point is checked; well under the crossfade, so timing jitter is inaudible. */
const POLL_MS = 250;
/** Lowpass cutoff (Hz) that rounds off the sitar's bright strokes for a gentler, warmer sound. */
const SOFTEN_HZ = 4200;

/** One media element and its own gain, so each can fade independently during a crossfade. */
interface Voice {
  el: HTMLAudioElement;
  gain: GainNode;
}

/**
 * Starts the endless loop on `out`. Must be called after a user gesture (the game calls it from the intro click),
 * since browsers only allow media to play after one. If the browser still refuses, it retries on the next click.
 */
export function startClassicalBed(ctx: AudioContext, out: AudioNode): void {
  // No media elements outside a browser (unit tests under Node, or a mocked context): stay silent.
  if (typeof Audio === 'undefined' || typeof ctx.createMediaElementSource !== 'function') return;

  // Shared soften filter and master level, fading in from silence on first start.
  const soften = ctx.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = SOFTEN_HZ;
  soften.Q.value = 0.5;
  const level = ctx.createGain();
  level.gain.setValueAtTime(0, ctx.currentTime);
  level.gain.linearRampToValueAtTime(MUSIC_GAIN, ctx.currentTime + FADE_IN);
  soften.connect(level);
  level.connect(out);

  /** Builds one player wired into the filter, silent until it is given a turn. */
  const makeVoice = (): Voice => {
    const el = new Audio(import.meta.env.BASE_URL + TRACK);
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    const gain = ctx.createGain();
    gain.gain.value = 0;
    ctx.createMediaElementSource(el).connect(gain);
    gain.connect(soften);
    return { el, gain };
  };
  const voices = [makeVoice(), makeVoice()];
  let active = 0;

  /** Ramps its gain linearly to `to` over `secs`. */
  const fadeVoice = (v: Voice, to: number, secs: number): void => {
    const g = v.gain.gain;
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(to, t + secs);
  };

  /** Plays a voice, retrying on the next click if autoplay is blocked. */
  const play = (v: Voice): void => {
    v.el.play().catch(() => {
      window.addEventListener('pointerdown', () => void v.el.play().catch(() => {}), { once: true });
    });
  };

  // First voice starts at full gain (the master level does the fade-in).
  voices[0].gain.gain.value = 1;
  play(voices[0]);

  // Loop point: when the active voice is one crossfade from its end, bring in the other from the top and swap.
  let swapping = false;
  setInterval(() => {
    const cur = voices[active];
    const dur = cur.el.duration;
    if (swapping || !Number.isFinite(dur) || cur.el.paused) return;
    if (dur - cur.el.currentTime > CROSSFADE) return;
    swapping = true;
    const next = voices[1 - active];
    next.el.currentTime = 0;
    play(next);
    fadeVoice(next, 1, CROSSFADE);
    fadeVoice(cur, 0, CROSSFADE);
    active = 1 - active;
    // Once the outgoing voice has faded, stop it and allow the next swap.
    setTimeout(() => {
      cur.el.pause();
      swapping = false;
    }, CROSSFADE * 1000 + 200);
  }, POLL_MS);
}
