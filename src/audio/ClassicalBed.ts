// Classical background music: real sitar-and-tabla raga recordings played softly under the village sounds.
// The tracks are Ranjit Makkuni's sitar ragas with Mithilesh Jha on tabla, from Wikimedia Commons (CC BY-SA 3.0,
// credited in the README), loudness-matched and re-encoded to MP3 in public/audio. They play in turn, forever, through
// one quiet bus with a gentle lowpass, so the music feels like it drifts in from a neighbour's verandah and never
// competes with the fireworks. It feeds the master bus, so the game's mute toggle silences it too.

/** The playlist, in play order; paths are relative to the site base. */
const TRACKS = ['audio/raga-kaushi-kanra.mp3', 'audio/raga-bag-bhim.mp3', 'audio/raga-sri.mp3'];
/** Music level on the master bus: low, so it reads as background. */
const MUSIC_GAIN = 0.42;
/** Seconds for the music to fade in when it first starts. */
const FADE_IN = 6;
/** Pause between tracks, in seconds, like the hush between two pieces. */
const TRACK_GAP = 2.5;
/** Lowpass cutoff (Hz) that takes the edge off the sitar's bright strokes. */
const SOFTEN_HZ = 5200;

/**
 * Starts the playlist on `out`. Must be called after a user gesture (the game calls it from the intro click), since
 * browsers only allow media to start playing after one. If the browser still refuses, it retries on the next click.
 */
export function startClassicalBed(ctx: AudioContext, out: AudioNode): void {
  // One media element reused for every track, routed into the Web Audio graph.
  const el = new Audio();
  el.crossOrigin = 'anonymous';
  el.preload = 'auto';
  const src = ctx.createMediaElementSource(el);

  // Soften, then set the level, fading in from silence.
  const soften = ctx.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = SOFTEN_HZ;
  soften.Q.value = 0.5;
  const level = ctx.createGain();
  level.gain.setValueAtTime(0, ctx.currentTime);
  level.gain.linearRampToValueAtTime(MUSIC_GAIN, ctx.currentTime + FADE_IN);
  src.connect(soften);
  soften.connect(level);
  level.connect(out);

  let index = 0;

  /** Plays the current track; if autoplay is blocked, waits for the next click and tries once more. */
  const play = (): void => {
    el.src = import.meta.env.BASE_URL + TRACKS[index];
    el.play().catch(() => {
      window.addEventListener('pointerdown', () => void el.play().catch(() => {}), { once: true });
    });
  };

  // When a track ends, rest for a moment and move on to the next, wrapping round to the first.
  el.addEventListener('ended', () => {
    index = (index + 1) % TRACKS.length;
    setTimeout(play, TRACK_GAP * 1000);
  });
  // A missing or broken file skips ahead instead of leaving the village silent; after every track has failed in a
  // row it gives up, so a missing folder never loops forever.
  let failures = 0;
  el.addEventListener('playing', () => {
    failures = 0;
  });
  el.addEventListener('error', () => {
    if (++failures >= TRACKS.length) return;
    index = (index + 1) % TRACKS.length;
    setTimeout(play, TRACK_GAP * 1000);
  });

  play();
}
