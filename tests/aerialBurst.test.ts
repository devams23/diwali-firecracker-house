import { describe, it, expect } from 'vitest';
import { drainQueue, soundDelay } from '../src/fx/aerialBurst';

describe('soundDelay', () => {
  it('is zero at the listener and grows with distance at 343 m/s', () => {
    expect(soundDelay(0)).toBe(0);
    expect(soundDelay(343)).toBeCloseTo(1, 10);
    expect(soundDelay(30)).toBeCloseTo(30 / 343, 10);
  });

  it('treats negative distances as zero', () => {
    expect(soundDelay(-5)).toBe(0);
  });
});

describe('drainQueue', () => {
  it('fires only entries that reach zero and keeps the rest in order', () => {
    const queue = [
      { remaining: 0.5, id: 'a' },
      { remaining: 0.1, id: 'b' },
      { remaining: 0.3, id: 'c' },
      { remaining: 0.05, id: 'd' },
    ];
    const fired: string[] = [];
    const n = drainQueue(queue, 0.2, (e) => fired.push(e.id));
    expect(n).toBe(2);
    expect(fired).toEqual(['b', 'd']);
    expect(queue.map((e) => e.id)).toEqual(['a', 'c']);
    expect(queue[0].remaining).toBeCloseTo(0.3, 10);
  });

  it('fires an entry that lands exactly on zero', () => {
    const queue = [{ remaining: 0.25, id: 'x' }];
    const fired: string[] = [];
    drainQueue(queue, 0.25, (e) => fired.push(e.id));
    expect(fired).toEqual(['x']);
    expect(queue).toHaveLength(0);
  });

  it('leaves an empty queue alone', () => {
    const queue: { remaining: number }[] = [];
    expect(drainQueue(queue, 1, () => {})).toBe(0);
    expect(queue).toHaveLength(0);
  });
});
