// Centre crosshair: a 4 px warm-white dot at 80 per cent opacity marks the aim point. When the aim rests on something
// the player can act on, a thin gold 18 px ring appears around the dot with a short label beside it. The overlay is
// pass-through, and setTarget() touches the DOM only when the label changes.

/** The crosshair overlay: a dot always, and a ring with a label while aimed at an interactable. */
export class Crosshair {
  private readonly root: HTMLDivElement;
  private readonly label: HTMLSpanElement;
  /** Label last written; undefined before the first write so the first call always applies. */
  private current: string | null | undefined = undefined;

  /** Builds the crosshair inside `parent`, hidden until show(true) is called. */
  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'crosshair';
    this.root.hidden = true;
    const dot = document.createElement('div');
    dot.className = 'crosshair-dot';
    const ring = document.createElement('div');
    ring.className = 'crosshair-ring';
    this.label = document.createElement('span');
    this.label.className = 'crosshair-label';
    this.root.append(ring, dot, this.label);
    parent.appendChild(this.root);
  }

  /** Shows the crosshair while play is live, and hides it on the intro card and in the pause panel. */
  show(on: boolean): void {
    this.root.hidden = !on;
  }

  /**
   * Sets the label beside the ring and turns the ring on, or turns it off when `text` is null. Repeated calls with the
   * same text do nothing.
   */
  setTarget(text: string | null): void {
    if (text === this.current) return;
    this.current = text;
    this.root.classList.toggle('has-target', text !== null);
    this.label.textContent = text ?? '';
  }
}
