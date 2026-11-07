// Tests for the typed event bus that decouples game systems (fireworks, lighting, finale).
import { describe, it, expect, vi } from 'vitest';
import { Emitter } from '../src/core/events';

type Ev = { burst: { x: number; y: number; z: number; power: number }; finale: {} };

describe('Emitter', () => {
  it('delivers emitted payloads to on() handlers', () => {
    const e = new Emitter<Ev>();
    const fn = vi.fn();
    e.on('burst', fn);
    e.emit('burst', { x: 1, y: 2, z: 3, power: 0.5 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ x: 1, y: 2, z: 3, power: 0.5 });
  });

  it('stops delivering after the unsubscribe function is called', () => {
    const e = new Emitter<Ev>();
    const fn = vi.fn();
    const off = e.on('finale', fn);
    e.emit('finale', {});
    off();
    e.emit('finale', {});
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not throw when emitting with no listeners', () => {
    const e = new Emitter<Ev>();
    expect(() => e.emit('burst', { x: 0, y: 0, z: 0, power: 1 })).not.toThrow();
  });
});
