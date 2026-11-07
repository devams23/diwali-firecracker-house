// Village night soundscape: crickets, a faint crackle bed, distant booms, a temple bell and a rare dog bark,
// each synthesized and retriggered on its own random timer. Everything goes to the master bus and sits well
// under the fireworks so it reads as background.
import { noiseHit, RECIPES, strike, Voice } from './recipes';

/** Random number in [a, b). */
function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** Runs `fn` after a random delay in [minSec, maxSec], then re-arms itself indefinitely. */
function repeat(minSec: number, maxSec: number, fn: () => void): void {
  setTimeout(() => {
    fn();
    repeat(minSec, maxSec, fn);
  }, rand(minSec, maxSec) * 1000);
}

/** One short sine blip with an exponential decay, used for cricket chirps and the bell's partials. */
function blip(ctx: AudioContext, out: AudioNode, when: number, freq: number, peak: number, attack: number, dur: number): void {
  const osc = ctx.createOscillator();
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = 0;
  osc.connect(g);
  g.connect(out);
  strike(g.gain, when, peak, attack, dur);
  osc.start(when);
  osc.stop(when + dur + 0.02);
  osc.onended = () => {
    osc.disconnect();
    g.disconnect();
  };
}

/**
 * Starts every ambience loop on `out`. Call once after the context exists; each loop re-arms itself with a
 * random gap so the village never sounds like a metronome.
 */
export function startAmbience(ctx: AudioContext, out: AudioNode): void {
  // Crackle bed: quiet, lowpassed small pops at random 0.1 to 1.5 s gaps, like distant firecrackers.
  repeat(0.1, 1.5, () => {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    lp.connect(out);
    RECIPES.popSmall(ctx, lp, { volume: 0.05, pitch: rand(0.7, 1.1), onEnd: () => lp.disconnect() });
  });

  // Crickets: a train of 4 to 8 very quiet high chirps.
  repeat(0.6, 2.2, () => {
    const pulses = 4 + Math.floor(rand(0, 5));
    const t0 = ctx.currentTime;
    for (let i = 0; i < pulses; i++) blip(ctx, out, t0 + i * 0.07, rand(3900, 4500), 0.012, 0.003, 0.03);
  });

  // Distant far booms: the same recipe as the game's far-away explosions, held back in level.
  repeat(6, 15, () => {
    RECIPES.farBoom(ctx, out, { volume: 0.5, pitch: rand(0.85, 1.15) });
  });

  // Temple bell: three inharmonic partials (520, 1340, 2210 Hz) decaying over 4 s.
  repeat(40, 70, () => {
    const t = ctx.currentTime + 0.05;
    blip(ctx, out, t, 520, 0.05, 0.003, 4);
    blip(ctx, out, t, 1340, 0.025, 0.003, 4);
    blip(ctx, out, t, 2210, 0.012, 0.003, 4);
  });

  // Dog bark: two short bandpassed noise hits, rare and very quiet.
  repeat(60, 120, () => {
    const v = new Voice(ctx, out);
    v.gain.gain.value = 0.04;
    const t = ctx.currentTime;
    noiseHit(ctx, v, t, 'bandpass', 700, 4, 0.5, 0.01, 0.15);
    noiseHit(ctx, v, t + 0.3, 'bandpass', 650, 4, 0.45, 0.01, 0.15);
  });
}
