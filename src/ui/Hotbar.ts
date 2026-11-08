// Bottom-centre cracker hotbar: eleven slots numbered 1 to 9, 0 and -, each with its procedural icon, the count of that
// kind (top-right area, dimmed at zero) and a gold border with a small lift when selected. The selected kind's name
// sits above the bar in English and Devanagari. update() writes only the parts that changed, so it is cheap to call
// every frame. The bar ignores the pointer: selection is by keys and the wheel.
import { CRACKER_ORDER, CRACKERS, type CrackerKind } from '../crackers/catalog';
import type { Inventory } from '../items/Inventory';
import { drawCrackerIcon } from './crackerIcons';

/** The number printed on each slot, in slot order: 1 to 9, then 0, then the minus key for the sky lantern. */
const SLOT_NUMBERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'];
/** Pixel size the icon canvas is drawn at: twice the on-screen size, so the icons stay crisp on dense screens. */
const ICON_PX = 112;

/** One slot's element and the last values written to it, so update() only touches what changed. */
interface Slot {
  /** The slot's root element, which carries the selected and empty classes. */
  el: HTMLDivElement;
  /** The count text in the bottom-right corner. */
  count: HTMLSpanElement;
  /** The count last written, or -1 before the first write. */
  shown: number;
  /** Whether the slot was last marked selected. */
  selected: boolean;
}

/** Creates a span with a class and optional text. */
function span(cls: string, text = ''): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = cls;
  el.textContent = text;
  return el;
}

/** The hotbar overlay: a name line above a row of eleven slots. */
export class Hotbar {
  private readonly root: HTMLDivElement;
  private readonly nameEn: HTMLSpanElement;
  private readonly nameHi: HTMLSpanElement;
  private readonly slots: Slot[] = [];
  /** The kind whose name is currently shown, so the name is written only when the selection moves. */
  private shownKind: CrackerKind | null = null;

  /** Builds the bar inside `parent`, with one slot per kind in CRACKER_ORDER and its icon drawn once. */
  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hotbar';
    this.root.setAttribute('aria-label', 'Cracker hotbar');

    const name = document.createElement('div');
    name.className = 'hotbar-name';
    this.nameEn = span('hotbar-name-en');
    this.nameHi = span('hotbar-name-hi');
    name.append(this.nameEn, this.nameHi);

    const row = document.createElement('div');
    row.className = 'hotbar-row';
    CRACKER_ORDER.forEach((kind, i) => {
      const el = document.createElement('div');
      el.className = 'hb-slot';
      const icon = document.createElement('canvas');
      icon.className = 'hb-icon';
      icon.width = ICON_PX;
      icon.height = ICON_PX;
      drawCrackerIcon(icon, kind);
      const count = span('hb-count', '0');
      el.append(span('hb-num', SLOT_NUMBERS[i]), icon, count);
      row.appendChild(el);
      this.slots.push({ el, count, shown: -1, selected: false });
    });

    this.root.append(name, row);
    parent.appendChild(this.root);
  }

  /**
   * Copies the inventory onto the bar: the selected name, and for each slot its count (dimmed at zero) and whether it
   * is the selected slot. Only changed values are written.
   */
  update(inv: Inventory): void {
    const kind = inv.selected;
    if (kind !== this.shownKind) {
      this.shownKind = kind;
      this.nameEn.textContent = CRACKERS[kind].label;
      this.nameHi.textContent = CRACKERS[kind].hindi;
    }
    CRACKER_ORDER.forEach((k, i) => {
      const slot = this.slots[i];
      const n = inv.count(k);
      if (n !== slot.shown) {
        slot.shown = n;
        slot.count.textContent = String(n);
        slot.el.classList.toggle('is-empty', n === 0);
      }
      const sel = i === inv.selectedIndex;
      if (sel !== slot.selected) {
        slot.selected = sel;
        slot.el.classList.toggle('is-selected', sel);
      }
    });
  }
}
