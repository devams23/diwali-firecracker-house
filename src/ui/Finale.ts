// The finale: after enough crackers have fired, the neighbours' sky-show starts and a greeting fades in at the top
// centre. FinaleCounter holds the pure count-and-trigger rule; Finale is the on-screen greeting.

/** Burst power at or above which a burst counts toward the finale; smaller starts (the sparkler's) do not. */
export const FINALE_MIN_POWER = 0.4;
/** Number of counted bursts that starts the finale. */
export const FINALE_BURSTS = 10;

/** True when a burst with this power should count toward the finale. */
export function countsTowardFinale(power: number): boolean {
  return power >= FINALE_MIN_POWER;
}

/** Counts fired crackers and reports the one call on which the finale should start. */
export class FinaleCounter {
  /** Number of counted bursts so far. */
  count = 0;
  /** Bursts needed before the finale fires. */
  readonly target: number;
  private fired = false;

  /** Creates a counter that fires at `target` bursts (default FINALE_BURSTS). */
  constructor(target = FINALE_BURSTS) {
    this.target = target;
  }

  /**
   * Counts one burst. Returns true only on the call that first reaches the target; later calls return false,
   * so the finale runs once per session.
   */
  record(): boolean {
    this.count++;
    if (this.fired || this.count < this.target) return false;
    this.fired = true;
    return true;
  }

  /** True once the finale has been triggered. */
  get done(): boolean {
    return this.fired;
  }
}

/** The finale greeting: Devanagari and English lines that fade in, stay for seven seconds, then fade out. */
export class Finale {
  private readonly el: HTMLDivElement;
  private timer = 0;

  /** Builds the hidden greeting inside `parent`. */
  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'finale';
    this.el.innerHTML = '<div class="finale-hi">शुभ दीपावली</div><div class="finale-en">Shubh Deepavali</div>';
    parent.appendChild(this.el);
  }

  /** Fades the greeting in, then out again after seven seconds. */
  show(): void {
    this.el.classList.remove('is-on');
    // Reading offsetWidth forces a style flush so the class change restarts the fade-in.
    void this.el.offsetWidth;
    this.el.classList.add('is-on');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.el.classList.remove('is-on'), 7000);
  }
}
