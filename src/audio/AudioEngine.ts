// Placeholder audio engine so effect code can already call play() and receive a handle. Task 6 replaces
// this with the Web Audio implementation; until then every call is a silent no-op with the same signature.

/** Handle returned by play(); stop and setPosition are safe to call at any time. */
export interface SoundHandle {
  /** Stops the sound if it is still playing. */
  stop(): void;
  /** Moves the sound source; ignored by the stub. */
  setPosition(...args: unknown[]): void;
}

const NOOP_HANDLE: SoundHandle = {
  stop() {},
  setPosition() {},
};

/** Stub audio engine: accepts the calls later code makes and produces no sound. */
export class AudioEngine {
  /** Prepares the audio context; the stub has nothing to set up. */
  init(): void {}

  /** Returns a no-op handle; the real engine starts the named sound. */
  play(_name?: string, _opts?: unknown): SoundHandle {
    return NOOP_HANDLE;
  }
}
