// Bottom-centre prompt chip: a warm translucent brown pill with a gold hairline, a keycap for a leading key
// token (E, F, Q or Click) and the text after it. Text changes cross-fade. parsePrompt is pure so the keycap
// split can be tested under Node without the DOM.

/** A prompt split into its leading key token (if any) and the rest of the text. */
export interface ParsedPrompt {
  /** The key shown as a keycap, or null when the text has no leading key token. */
  key: string | null;
  /** The text shown after the keycap, or the whole text when there is no key. */
  text: string;
}

/**
 * Matches a leading key token: "E — ...", "F ...", "Q ...", "Click ...". A "/" or "·" right after the key (as in
 * "Q / scroll ...") is not a key token, so those hints render as plain text.
 */
const KEY_TOKEN = /^(E|F|Q|Click)\s+(?:—\s+)?([^/·\s].*)$/;

/** Splits a prompt into its leading keycap and remaining text. */
export function parsePrompt(text: string): ParsedPrompt {
  const m = KEY_TOKEN.exec(text);
  return m ? { key: m[1], text: m[2] } : { key: null, text };
}

/** The on-screen prompt chip; set() changes its text with a short cross-fade and ignores repeats. */
export class Prompt {
  private readonly el: HTMLDivElement;
  private readonly keyEl: HTMLSpanElement;
  private readonly textEl: HTMLSpanElement;
  private current = '';
  private swapTimer = 0;

  /** Builds the chip inside `parent`, hidden until the first prompt is set. */
  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'prompt is-changing';
    this.el.hidden = true;
    this.keyEl = document.createElement('span');
    this.keyEl.className = 'keycap';
    this.textEl = document.createElement('span');
    this.textEl.className = 'prompt-text';
    this.el.append(this.keyEl, this.textEl);
    parent.appendChild(this.el);
  }

  /**
   * Shows `text` as the prompt; does nothing when it is already shown. Empty text hides the chip entirely, so no
   * empty pill is left on screen (for example while paused).
   */
  set(text: string): void {
    if (text === this.current) return;
    this.current = text;
    window.clearTimeout(this.swapTimer);
    if (text === '') {
      this.el.hidden = true;
      this.el.classList.add('is-changing');
      return;
    }
    this.el.hidden = false;
    this.el.classList.add('is-changing');
    // Swap the words while the chip is faded out, then fade it back in.
    this.swapTimer = window.setTimeout(() => {
      const parsed = parsePrompt(text);
      this.keyEl.textContent = parsed.key ?? '';
      this.keyEl.hidden = parsed.key === null;
      this.textEl.textContent = parsed.text;
      this.el.classList.remove('is-changing');
    }, 120);
  }
}
