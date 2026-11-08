// Small status line at the top centre of the screen, used for brief confirmations such as "+5 Anar · अनार" when a stall box is bought from.
// Each show() replaces the text and restarts the hide timer.

/** A short message that fades in at the top centre and fades out after a few seconds. */
export class Toast {
  private readonly el: HTMLDivElement;
  private timer = 0;

  /** Builds the hidden toast inside `parent`. */
  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'toast';
    parent.appendChild(this.el);
  }

  /** Shows `text` for `seconds` (default 2.2 s), replacing any message already on screen. */
  show(text: string, seconds = 2.2): void {
    this.el.textContent = text;
    this.el.classList.add('is-on');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.el.classList.remove('is-on'), seconds * 1000);
  }
}
