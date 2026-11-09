// The welcome card: a warm festive card over the dimmed scene with the Devanagari greeting, an English welcome line,
// two lines of story, a keycap grid of the controls and an "Enter the home" button. A click anywhere on the card or
// Enter starts the game (through onBegin); fadeOut() then removes the card slowly. Styling and the staggered fade-in
// live in ui.css, so the card needs no per-frame work.

/** Controls shown in the welcome grid: the keycap text and what it does. */
const CONTROLS: Array<[string, string]> = [
  ['WASD', 'Walk'],
  ['Mouse', 'Look around'],
  ['F', 'Place a cracker'],
  ['Click', 'Light the fuse'],
  ['E', 'Take from the stall'],
  ['1–0', 'Choose a cracker'],
  ['Esc', 'Pause'],
];

/** A small rangoli-style diya and lotus motif drawn in SVG, shown above the greeting. */
const MOTIF =
  '<svg class="intro-motif" viewBox="0 0 120 60" aria-hidden="true">' +
  // Petals fanning out behind the lamp.
  '<g fill="none" stroke="#e8b04a" stroke-width="1.2" opacity="0.8">' +
  '<path d="M60 52 C40 44 34 28 44 14 C52 26 58 36 60 52Z"/>' +
  '<path d="M60 52 C80 44 86 28 76 14 C68 26 62 36 60 52Z"/>' +
  '<path d="M60 52 C48 40 50 22 60 8 C70 22 72 40 60 52Z"/>' +
  '<path d="M60 52 C30 50 14 40 8 30 C26 30 46 36 60 52Z"/>' +
  '<path d="M60 52 C90 50 106 40 112 30 C94 30 74 36 60 52Z"/></g>' +
  // The lamp bowl and its flame.
  '<path d="M44 46 Q60 62 76 46 Z" fill="#c2561f" stroke="#f2c45c" stroke-width="1"/>' +
  '<path d="M60 44 C54 36 58 30 60 24 C62 30 66 36 60 44Z" fill="#ffd36b"/></svg>';

/** The full-screen welcome card that waits for the first click or Enter. */
export class Intro {
  private readonly layer: HTMLDivElement;
  private begun = false;
  private readonly onKey: (e: KeyboardEvent) => void;

  /** Builds the card inside `parent`; `onBegin` runs once, on a click anywhere on the card or on Enter. */
  constructor(parent: HTMLElement, onBegin: () => void) {
    this.layer = document.createElement('div');
    this.layer.className = 'intro';
    const grid = CONTROLS.map(([k, v]) => `<li><kbd class="keycap">${k}</kbd><span>${v}</span></li>`).join('');
    this.layer.innerHTML =
      '<div class="intro-card">' +
      MOTIF +
      '<h1 class="intro-hi">शुभ दीपावली</h1>' +
      '<p class="intro-en">Welcome home for Diwali</p>' +
      '<p class="intro-story">Light the lamps, pick crackers at the stall, and fill the night sky.</p>' +
      `<ul class="intro-controls">${grid}</ul>` +
      '<button type="button" class="intro-btn">Enter the home <span class="intro-btn-hi">· घर में प्रवेश</span></button>' +
      '</div>';
    const start = (): void => {
      if (this.begun) return;
      this.begun = true;
      window.removeEventListener('keydown', this.onKey);
      onBegin();
    };
    this.layer.addEventListener('click', start);
    this.onKey = (e) => {
      if (e.code === 'Enter') start();
    };
    window.addEventListener('keydown', this.onKey);
    parent.appendChild(this.layer);
  }

  /** Fades the card out over `seconds`, then removes it from the page. */
  fadeOut(seconds: number): void {
    this.layer.style.transitionDuration = `${seconds}s`;
    this.layer.classList.add('is-leaving');
    window.setTimeout(() => this.layer.remove(), seconds * 1000 + 100);
  }
}
