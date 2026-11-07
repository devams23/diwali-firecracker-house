// Pure fuse state machine for one cracker: idle until lit, fusing for its fuse time, active while its effect
// runs, then done. It has no three.js or audio dependency so the timing rules can be unit-tested directly.

/** Lifecycle of one cracker: waiting to be lit, burning its fuse, running its effect, or finished. */
export type CrackerPhase = 'idle' | 'fusing' | 'active' | 'done';

/** Tracks a cracker's phase and how far its fuse has burnt. */
export class FuseTimer {
  /** Current lifecycle phase; only the methods below change it. */
  phase: CrackerPhase = 'idle';

  /** Full fuse length in seconds, fixed at construction. */
  private readonly fuseSeconds: number;
  /** Seconds of fuse burnt so far; only meaningful while fusing. */
  private elapsed = 0;

  /** Creates an unlit timer for a fuse of the given length in seconds. */
  constructor(fuseSeconds: number) {
    this.fuseSeconds = fuseSeconds;
  }

  /** Lights the fuse. Returns false if the cracker is already lit; a zero fuse goes straight to active. */
  light(): boolean {
    if (this.phase !== 'idle') return false;
    this.elapsed = 0;
    if (this.fuseSeconds <= 0) {
      this.phase = 'active';
    } else {
      this.phase = 'fusing';
    }
    return true;
  }

  /** Advances a burning fuse by dt seconds and returns the phase after the step. */
  tick(dt: number): CrackerPhase {
    if (this.phase !== 'fusing') return this.phase;
    this.elapsed += dt;
    if (this.elapsed >= this.fuseSeconds) this.phase = 'active';
    return this.phase;
  }

  /** Marks the effect as over; only valid from active. */
  finish(): void {
    if (this.phase === 'active') this.phase = 'done';
  }

  /** Fraction of the fuse burnt, 0 before lighting and 1 once the fuse has run out. */
  get fuseProgress(): number {
    if (this.phase === 'idle') return 0;
    if (this.phase !== 'fusing') return 1;
    if (this.fuseSeconds <= 0) return 1;
    return Math.min(1, this.elapsed / this.fuseSeconds);
  }
}
