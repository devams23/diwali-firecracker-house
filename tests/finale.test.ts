// Tests for the finale rule: only bursts at or above the minimum power count, and the finale fires once, on the
// call that reaches the target burst count.
import { describe, expect, it } from 'vitest';
import { FINALE_BURSTS, FINALE_MIN_POWER, FinaleCounter, countsTowardFinale } from '../src/ui/Finale';

describe('countsTowardFinale', () => {
  it('counts bursts at or above the minimum power', () => {
    expect(countsTowardFinale(FINALE_MIN_POWER)).toBe(true);
    expect(countsTowardFinale(1)).toBe(true);
  });

  it('ignores small starts below the minimum power', () => {
    expect(countsTowardFinale(FINALE_MIN_POWER - 0.01)).toBe(false);
    expect(countsTowardFinale(0)).toBe(false);
  });
});

describe('FinaleCounter', () => {
  it('fires exactly once, on the call that reaches the target', () => {
    const c = new FinaleCounter();
    const results: boolean[] = [];
    for (let i = 0; i < FINALE_BURSTS + 3; i++) results.push(c.record());
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results[FINALE_BURSTS - 1]).toBe(true);
    expect(c.done).toBe(true);
    expect(c.count).toBe(FINALE_BURSTS + 3);
  });

  it('does not fire before the target', () => {
    const c = new FinaleCounter(3);
    expect(c.record()).toBe(false);
    expect(c.record()).toBe(false);
    expect(c.done).toBe(false);
    expect(c.record()).toBe(true);
  });
});
