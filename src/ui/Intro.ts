// The opening card: a dark full-screen layer with the Hindi greeting, the English line and a quiet hint that fade in
// one after another. The first click starts the game (through onBegin); fadeOut() then removes the card slowly.
// The timing of the fade-in lives in ui.css so the card needs no per-frame work.

/** The full-screen opening card that waits for the first click. */
export class Intro {
  private readonly layer: HTMLDivElement;
  private begun = false;

  /** Builds the card inside `parent`; `onBegin` runs once, on the first click anywhere on the card. */
  constructor(parent: HTMLElement, onBegin: () => void) {
    this.layer = document.createElement('div');
    this.layer.className = 'intro';
    this.layer.innerHTML =
      '<p class="intro-hi">दीपावली की रात। घर आ गए हो।</p>' +
      '<p class="intro-en">Diwali night. You\'re home.</p>' +
      '<p class="intro-hint">click to step inside</p>';
    this.layer.addEventListener('click', () => {
      if (this.begun) return;
      this.begun = true;
      onBegin();
    });
    parent.appendChild(this.layer);
  }

  /** Fades the card out over `seconds`, then removes it from the page. */
  fadeOut(seconds: number): void {
    this.layer.style.transitionDuration = `${seconds}s`;
    this.layer.classList.add('is-leaving');
    window.setTimeout(() => this.layer.remove(), seconds * 1000 + 100);
  }
}
