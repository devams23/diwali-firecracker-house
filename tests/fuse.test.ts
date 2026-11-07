// Tests for the pure fuse state machine: idle to fusing to active to done, with the one-shot light rule
// and the zero-fuse shortcut that sends handheld-style items straight to active.
import { describe, it, expect } from 'vitest';
import { FuseTimer } from '../src/crackers/FuseTimer';

describe('FuseTimer', () => {
  it('lights once and moves through fusing to active after the fuse time', () => {
    const f = new FuseTimer(2.5);
    expect(f.light()).toBe(true);
    expect(f.phase).toBe('fusing');
    expect(f.tick(1)).toBe('fusing');
    expect(f.tick(1.6)).toBe('active');
  });

  it('refuses a second light', () => {
    const f = new FuseTimer(2.5);
    f.light();
    expect(f.light()).toBe(false);
  });

  it('goes straight to active when the fuse is zero', () => {
    const f = new FuseTimer(0);
    expect(f.light()).toBe(true);
    expect(f.phase).toBe('active');
  });

  it('reports fuse progress from 0 to 1 while fusing', () => {
    const f = new FuseTimer(2.5);
    expect(f.fuseProgress).toBe(0);
    f.light();
    f.tick(1);
    expect(f.fuseProgress).toBeCloseTo(0.4, 6);
    f.tick(10);
    expect(f.fuseProgress).toBe(1);
  });

  it('moves active to done when finished', () => {
    const f = new FuseTimer(0);
    f.light();
    f.finish();
    expect(f.phase).toBe('done');
  });
});
