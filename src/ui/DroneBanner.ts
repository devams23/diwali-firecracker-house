// Drone-show pill at the top centre. One dark rounded pill that first counts the diyas ("Light all 12 diyas to start the
// drone show · 3/12"), then counts down ("Drone show starting in 5…"), then shows a red dot and "Drone show · LIVE", and
// hides itself when the show is over. droneBannerText is pure so the wording can be tested under Node.
import type { DroneState } from '../features/DroneShow';

/** Wording for each state; `lit`/`total` are the diyas, `count` the countdown number. Null means the pill is hidden. */
export function droneBannerText(state: DroneState, lit: number, total: number, count: number): string | null {
  switch (state) {
    case 'waiting':
      return `🪔 Light all ${total} diyas to start the drone show · ${lit}/${total}`;
    case 'countdown':
      return `🪔 Drone show starting in ${count}…`;
    case 'live':
      return 'Drone show · LIVE';
    default:
      return null;
  }
}

/** The on-screen pill; update() rewrites it only when something changed. */
export class DroneBanner {
  private readonly root: HTMLDivElement;
  private readonly dot: HTMLSpanElement;
  private readonly text: HTMLSpanElement;
  /** Last text written, to skip repeats every frame. */
  private shown = '';

  /** Builds the pill inside `parent`, hidden until update() is called with play live. */
  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'drone-pill';
    this.root.hidden = true;
    this.dot = document.createElement('span');
    this.dot.className = 'drone-pill-dot';
    this.dot.hidden = true;
    this.text = document.createElement('span');
    this.root.append(this.dot, this.text);
    parent.appendChild(this.root);
  }

  /** Shows the pill for the current show state, or hides it when `visible` is false (intro, pause) or the show is over. */
  update(visible: boolean, state: DroneState, lit: number, total: number, count: number): void {
    const text = droneBannerText(state, lit, total, count);
    this.root.hidden = !visible || text === null;
    if (text === null || text === this.shown) return;
    this.shown = text;
    this.text.textContent = text;
    this.dot.hidden = state !== 'live';
    this.root.classList.toggle('is-countdown', state === 'countdown');
  }
}
