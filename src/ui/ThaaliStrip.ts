// Bottom-right strip of the crackers on the thaali: one small labelled slot per cracker (Devanagari name above
// the English), with the selected slot outlined in gold. Hidden whenever the plate is not in the player's hand.
import type { CrackerKind } from '../crackers/catalog';
import { CRACKERS } from '../crackers/catalog';

/** The list of crackers on the plate, rebuilt only when its contents, selection or visibility change. */
export class ThaaliStrip {
  private readonly el: HTMLDivElement;
  private key = '';

  /** Builds the empty strip inside `parent`, hidden until the plate is in hand. */
  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'thaali-strip';
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  /**
   * Shows `items` as slots with `selected` outlined. `visible` is false when the plate is not in hand, which hides
   * the strip. Calls with the same arguments as the last call do nothing.
   */
  set(items: readonly CrackerKind[], selected: number, visible: boolean): void {
    const key = `${visible}|${selected}|${items.join(',')}`;
    if (key === this.key) return;
    this.key = key;
    this.el.hidden = !visible;
    this.el.replaceChildren();
    items.forEach((kind, i) => {
      const info = CRACKERS[kind];
      const slot = document.createElement('div');
      slot.className = i === selected ? 'thaali-slot is-selected' : 'thaali-slot';
      const hi = document.createElement('div');
      hi.className = 'slot-hi';
      hi.textContent = info.hindi;
      const en = document.createElement('div');
      en.className = 'slot-en';
      en.textContent = info.label;
      slot.append(hi, en);
      this.el.appendChild(slot);
    });
  }
}
