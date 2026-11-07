// Tests for the pure index pool behind the spark, smoke and flash systems: it hands out slots,
// counts live ones, and recycles the oldest slot when full so bursts never overflow capacity.
import { describe, it, expect } from 'vitest';
import { SparkPool } from '../src/fx/SparkPool';

describe('SparkPool', () => {
  it('returns distinct indices until capacity is reached', () => {
    const pool = new SparkPool(8);
    const seen = new Set<number>();
    for (let i = 0; i < 8; i++) seen.add(pool.alloc());
    expect(seen.size).toBe(8);
    for (const idx of seen) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(8);
    }
  });

  it('keeps alive equal to allocations minus releases', () => {
    const pool = new SparkPool(8);
    expect(pool.alive).toBe(0);
    const a = pool.alloc();
    const b = pool.alloc();
    pool.alloc();
    expect(pool.alive).toBe(3);
    pool.release(a);
    pool.release(b);
    expect(pool.alive).toBe(1);
  });

  it('still returns a valid index when full and keeps alive at capacity', () => {
    const pool = new SparkPool(4);
    for (let i = 0; i < 4; i++) pool.alloc();
    const recycled = pool.alloc();
    expect(recycled).toBeGreaterThanOrEqual(0);
    expect(recycled).toBeLessThan(4);
    expect(pool.alive).toBe(4);
    pool.alloc();
    pool.alloc();
    expect(pool.alive).toBe(4);
  });

  it('reuses a released index', () => {
    const pool = new SparkPool(4);
    const idx = [pool.alloc(), pool.alloc(), pool.alloc(), pool.alloc()];
    pool.release(idx[2]);
    expect(pool.alloc()).toBe(idx[2]);
  });

  it('ignores releasing an index that is not in use', () => {
    const pool = new SparkPool(4);
    const a = pool.alloc();
    pool.release(a);
    pool.release(a);
    expect(pool.alive).toBe(0);
  });
});
