// Tests for the Web Audio engine. Under Node there is no AudioContext, so every call must be a silent no-op;
// the remaining tests install a recording fake context to check init, muting, the voice cap and node teardown.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { AudioEngine } from '../src/audio/AudioEngine';

/** AudioParam names that the fake node hands out as parameter objects rather than methods. */
const PARAM_KEYS = new Set([
  'gain', 'frequency', 'Q', 'detune', 'playbackRate', 'delayTime', 'threshold', 'knee', 'ratio',
  'attack', 'release', 'positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ',
  'upX', 'upY', 'upZ',
]);

/** One recorded call or property write on a fake node or parameter. */
interface LogEntry {
  id: number;
  kind: string;
  name: string;
  args: unknown[];
}

let log: LogEntry[] = [];
let created: Array<{ id: number; node: any }> = [];
let nextId = 1;
let lastCtx: any = null;
let contextCount = 0;
let nextState = 'running';

/** Builds a recording AudioParam: any method call is logged and `value` is kept as a plain field. */
function param(id: number, kind: string): any {
  return new Proxy({ value: 0 } as Record<string, unknown>, {
    get(t, k) {
      if (k in t) return t[k as string];
      if (typeof k !== 'string') return undefined;
      return (...args: unknown[]) => {
        log.push({ id, kind, name: k, args });
      };
    },
    set(t, k, v) {
      t[k as string] = v;
      log.push({ id, kind, name: `set:${String(k)}`, args: [v] });
      return true;
    },
  });
}

/** Builds a recording AudioNode: parameter names return AudioParam fakes, other names record calls. */
function mk(kind: string): any {
  const id = nextId++;
  const target: Record<string, unknown> = {};
  const node = new Proxy(target, {
    get(t, k) {
      if (typeof k !== 'string') return undefined;
      if (k in t) return t[k];
      if (PARAM_KEYS.has(k)) {
        t[k] = param(id, k);
        return t[k];
      }
      return (...args: unknown[]) => {
        log.push({ id, kind, name: k, args });
        // connect() returns its destination in the real API, and the recipes chain on that return value.
        return k === 'connect' ? args[0] : undefined;
      };
    },
    set(t, k, v) {
      t[k as string] = v;
      log.push({ id, kind, name: `set:${String(k)}`, args: [v] });
      return true;
    },
  });
  if (kind === 'BufferSource') created.push({ id, node });
  return node;
}

/** Builds a recording AudioContext whose create* methods return fresh fake nodes. */
function makeCtx(state: string): any {
  const base: Record<string, unknown> = {
    state,
    currentTime: 0,
    sampleRate: 48000,
    destination: mk('Destination'),
    listener: mk('Listener'),
    resume: vi.fn(() => Promise.resolve()),
  };
  return new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k as string];
      if (typeof k === 'string' && k.startsWith('create')) {
        return (...args: unknown[]) => {
          if (k === 'createBuffer') {
            const len = args[1] as number;
            return { getChannelData: () => new Float32Array(len) };
          }
          return mk(k.slice('create'.length));
        };
      }
      return undefined;
    },
  });
}

/** Stands in for the browser AudioContext constructor and counts how many contexts were created. */
class FakeAudioContext {
  constructor() {
    contextCount++;
    lastCtx = makeCtx(nextState);
    return lastCtx;
  }
}

/** Ids of every node that was told to stop, used to count which voices are still sounding. */
function stoppedIds(): Set<number> {
  return new Set(log.filter((e) => e.name === 'stop').map((e) => e.id));
}

describe('AudioEngine without a Web Audio context', () => {
  it('play before init returns a handle whose stop does not throw', () => {
    const h = new AudioEngine().play('boomBig');
    expect(() => h.stop()).not.toThrow();
    expect(() => h.setPosition(new THREE.Vector3(1, 2, 3))).not.toThrow();
  });

  it('is not ready before init and starts unmuted', () => {
    const engine = new AudioEngine();
    expect(engine.ready).toBe(false);
    expect(engine.muted).toBe(false);
  });

  it('setMuted records the flag', () => {
    const engine = new AudioEngine();
    engine.setMuted(true);
    expect(engine.muted).toBe(true);
  });

  it('init is a silent no-op when AudioContext is missing', () => {
    const engine = new AudioEngine();
    expect(() => engine.init()).not.toThrow();
    expect(engine.ready).toBe(false);
    expect(() => engine.play('fizz').stop()).not.toThrow();
  });

  it('listener and ambience calls before init do not throw', () => {
    const engine = new AudioEngine();
    expect(() => engine.updateListener(new THREE.PerspectiveCamera())).not.toThrow();
    expect(() => engine.startAmbience()).not.toThrow();
  });
});

describe('AudioEngine with a fake AudioContext', () => {
  beforeEach(() => {
    log = [];
    created = [];
    nextId = 1;
    lastCtx = null;
    contextCount = 0;
    nextState = 'running';
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', FakeAudioContext);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('init creates one context and is idempotent', () => {
    const engine = new AudioEngine();
    engine.init();
    engine.init();
    expect(engine.ready).toBe(true);
    expect(contextCount).toBe(1);
  });

  it('resumes a suspended context on init', () => {
    nextState = 'suspended';
    new AudioEngine().init();
    expect(lastCtx.resume).toHaveBeenCalled();
  });

  it('falls back to webkitAudioContext', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', FakeAudioContext);
    const engine = new AudioEngine();
    engine.init();
    expect(engine.ready).toBe(true);
  });

  it('muting ramps the master gain to zero instead of cutting it', () => {
    const engine = new AudioEngine();
    engine.init();
    log = [];
    engine.setMuted(true);
    expect(engine.muted).toBe(true);
    const ramp = log.find((e) => e.name === 'setTargetAtTime' && e.kind === 'gain');
    expect(ramp?.args[0]).toBe(0);
  });

  it('muted engine plays nothing new', () => {
    const engine = new AudioEngine();
    engine.init();
    engine.setMuted(true);
    const before = created.length;
    engine.play('crack');
    expect(created.length).toBe(before);
  });

  it('stop() stops the sound source', () => {
    const engine = new AudioEngine();
    engine.init();
    const h = engine.play('crack');
    h.stop();
    expect(stoppedIds().has(created[0].id)).toBe(true);
  });

  it('one-shot nodes are disconnected when their source ends', () => {
    const engine = new AudioEngine();
    engine.init();
    engine.play('crack');
    created[0].node.onended();
    expect(log.some((e) => e.name === 'disconnect')).toBe(true);
  });

  it('never runs more than 48 voices at once', () => {
    const engine = new AudioEngine();
    engine.init();
    for (let i = 0; i < 60; i++) engine.play('fizz');
    const stopped = stoppedIds();
    const sounding = created.filter((c) => !stopped.has(c.id)).length;
    expect(sounding).toBe(48);
  });

  it('skips a new sound that is quieter than everything already playing', () => {
    const engine = new AudioEngine();
    engine.init();
    for (let i = 0; i < 48; i++) engine.play('fizz', undefined, { volume: 1 });
    const before = created.length;
    engine.play('fizz', undefined, { volume: 0.1 });
    expect(created.length).toBe(before);
  });

  it('positional sounds use an HRTF panner', () => {
    const engine = new AudioEngine();
    engine.init();
    engine.play('boomBig', new THREE.Vector3(1, 0, -2));
    expect(log.some((e) => e.name === 'set:panningModel' && e.args[0] === 'HRTF')).toBe(true);
  });

  it('updateListener writes the camera pose to the listener', () => {
    const engine = new AudioEngine();
    engine.init();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 2, 3);
    engine.updateListener(camera);
    expect(lastCtx.listener.positionX.value).toBeCloseTo(1);
    expect(lastCtx.listener.positionY.value).toBeCloseTo(2);
    expect(lastCtx.listener.positionZ.value).toBeCloseTo(3);
    expect(lastCtx.listener.forwardZ.value).toBeCloseTo(-1);
    expect(lastCtx.listener.upY.value).toBeCloseTo(1);
  });

  it('startAmbience is idempotent', () => {
    const engine = new AudioEngine();
    engine.init();
    engine.startAmbience();
    const pending = vi.getTimerCount();
    expect(pending).toBeGreaterThan(0);
    engine.startAmbience();
    expect(vi.getTimerCount()).toBe(pending);
  });
});
