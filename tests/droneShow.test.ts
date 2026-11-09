// Pure logic of the drone show: the state machine, the stage timeline, the countdown number, the banner wording and
// the formations (every drone placed, finite, and the sky formations high over the village).
import { describe, expect, it } from 'vitest';
import {
  COUNTDOWN_SECONDS,
  DRONE_COUNT,
  SHOW_SECONDS,
  advanceDroneState,
  burstFormation,
  countdownNumber,
  diyaFormation,
  easeInOut,
  mandalaFormation,
  scatterFormation,
  stageAt,
  textFormation,
} from '../src/features/DroneShow';
import { droneBannerText } from '../src/ui/DroneBanner';

describe('advanceDroneState', () => {
  it('waits until every diya is lit', () => {
    expect(advanceDroneState('waiting', 100, false)).toBe('waiting');
    expect(advanceDroneState('waiting', 0, true)).toBe('countdown');
  });
  it('runs countdown, then live, then done', () => {
    expect(advanceDroneState('countdown', COUNTDOWN_SECONDS - 0.1, true)).toBe('countdown');
    expect(advanceDroneState('countdown', COUNTDOWN_SECONDS, true)).toBe('live');
    expect(advanceDroneState('live', SHOW_SECONDS - 1, true)).toBe('live');
    expect(advanceDroneState('live', SHOW_SECONDS, true)).toBe('done');
    expect(advanceDroneState('done', 1000, true)).toBe('done');
  });
});

describe('countdownNumber and stageAt', () => {
  it('counts 5 down to 1', () => {
    expect(countdownNumber(0)).toBe(5);
    expect(countdownNumber(1.2)).toBe(4);
    expect(countdownNumber(4.9)).toBe(1);
  });
  it('walks the stages in order and ends in the descent', () => {
    expect(stageAt(0).stage).toBe(0);
    let prev = 0;
    for (let t = 0; t <= SHOW_SECONDS; t += 0.5) {
      const s = stageAt(t).stage;
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
    expect(stageAt(SHOW_SECONDS - 1).stage).toBe(6);
    expect(SHOW_SECONDS).toBeGreaterThan(45);
    expect(SHOW_SECONDS).toBeLessThan(60);
  });
  it('eases from 0 to 1', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
  });
});

describe('droneBannerText', () => {
  it('words each state', () => {
    expect(droneBannerText('waiting', 3, 12, 5)).toContain('Light all 12 diyas');
    expect(droneBannerText('waiting', 3, 12, 5)).toContain('3/12');
    expect(droneBannerText('countdown', 12, 12, 4)).toContain('starting in 4');
    expect(droneBannerText('live', 12, 12, 1)).toContain('LIVE');
    expect(droneBannerText('done', 12, 12, 1)).toBeNull();
  });
});

describe('formations', () => {
  it('place every drone at a finite point high in the sky', () => {
    const all = [
      scatterFormation(DRONE_COUNT, 1),
      diyaFormation(DRONE_COUNT),
      mandalaFormation(DRONE_COUNT),
      textFormation(DRONE_COUNT),
      burstFormation(DRONE_COUNT),
    ];
    for (const f of all) {
      expect(f.pos).toHaveLength(DRONE_COUNT * 3);
      for (let i = 0; i < DRONE_COUNT; i++) {
        expect(Number.isFinite(f.pos[i * 3])).toBe(true);
        expect(f.pos[i * 3 + 1]).toBeGreaterThan(30);
        expect(f.pos[i * 3 + 2]).toBeLessThan(-70);
      }
    }
  });
});
