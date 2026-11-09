// Prompt pill just above the hotbar: a dark translucent pill with a gold hairline, a white keycap for the key to
// press (E, F, Q or Click) and the action text after it. Text changes cross-fade. parsePrompt is pure so the keycap
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

/** The on-screen prompt pill; set() changes its key and words with a short cross-fade and ignores repeats. */
export class Prompt {
  private readonly el: HTMLDivElement;
  private readonly keyEl: HTMLSpanElement;
  private readonly textEl: HTMLSpanElement;
  /** Signature (key + text) of what is shown, to skip repeats. */
  private current = '';
  private swapTimer = 0;

  /** Builds the pill inside `parent`, hidden until the first prompt is set. */
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
   * Shows the prompt (a keycap when it has a key, then the words); does nothing when it is already shown. A null or
   * empty prompt hides the pill entirely, so no empty pill is left on screen (for example while paused).
   */
  set(p: ParsedPrompt | null): void {
    const sig = p && p.text !== '' ? `${p.key ?? ''}|${p.text}` : '';
    if (sig === this.current) return;
    this.current = sig;
    window.clearTimeout(this.swapTimer);
    if (!p || sig === '') {
      this.el.hidden = true;
      this.el.classList.add('is-changing');
      return;
    }
    this.el.hidden = false;
    this.el.classList.add('is-changing');
    // Swap the words while the pill is faded out, then fade it back in.
    this.swapTimer = window.setTimeout(() => {
      this.keyEl.textContent = p.key ?? '';
      this.keyEl.hidden = p.key === null;
      this.textEl.textContent = p.text;
      this.el.classList.remove('is-changing');
    }, 120);
  }
}
