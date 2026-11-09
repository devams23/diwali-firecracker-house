// Controls legend: a small bottom-left card listing the keys. It shows for the first minute of play or until the first
// cracker bursts, then fades to a "H — controls" chip; H toggles the full card back on or off.

/** Seconds of play the legend stays open by itself. */
const LEGEND_SECONDS = 60;

/** One row of the legend: the key caps and what they do. */
const ROWS: Array<[string, string]> = [
  ['WASD', 'move'],
  ['Mouse', 'look'],
  ['F', 'place'],
  ['Click', 'light'],
  ['E', 'take'],
  ['1–0', 'select'],
  ['M', 'sound'],
  ['Esc', 'pause'],
];

/** The corner controls legend and its H chip. */
export class ControlsLegend {
  private readonly root: HTMLDivElement;
  private open = true;
  /** Set once the player toggles with H, so the automatic fade no longer overrides their choice. */
  private manual = false;
  private startedAt = -1;

  /** Builds the legend inside `parent`, hidden until show(true). */
  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'legend';
    this.root.hidden = true;
    const rows = ROWS.map(([k, v]) => `<li><kbd class="keycap">${k}</kbd><span>${v}</span></li>`).join('');
    this.root.innerHTML =
      `<ul class="legend-list">${rows}</ul>` +
      '<div class="legend-chip"><kbd class="keycap">H</kbd><span>controls</span></div>';
    parent.appendChild(this.root);
    this.render();
  }

  /** Shows the legend while play is live. */
  show(on: boolean): void {
    this.root.hidden = !on;
  }

  /** Flips the full card on or off (the H key). */
  toggle(): void {
    this.manual = true;
    this.open = !this.open;
    this.render();
  }

  /** Called each frame with engine time and the burst count; closes the card after a minute or the first burst. */
  update(t: number, bursts: number): void {
    if (this.startedAt < 0) this.startedAt = t;
    if (this.manual || !this.open) return;
    if (bursts > 0 || t - this.startedAt > LEGEND_SECONDS) {
      this.open = false;
      this.render();
    }
  }

  /** Applies the open or collapsed look. */
  private render(): void {
    this.root.classList.toggle('is-open', this.open);
  }
}
