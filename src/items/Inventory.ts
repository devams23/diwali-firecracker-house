// The player's cracker inventory: how many of each kind they carry, which kind is selected for the hotbar, and a
// change callback so the hotbar redraws only when something moved. Pure logic with no DOM or three.js, so it runs
// under Node and is unit tested.
import { CRACKER_ORDER, CRACKERS, type CrackerKind } from '../crackers/catalog';

/** Number of hotbar slots, one per cracker kind in CRACKER_ORDER. */
export const SLOT_COUNT = CRACKER_ORDER.length;

/**
 * Maps a physical key code to a hotbar slot index: Digit1 to Digit9 give slots 0 to 8 and Digit0 gives slot 9.
 * Returns null for any other code.
 */
export function slotIndexForKey(code: string): number | null {
  if (code === 'Digit0') return 9;
  const m = /^Digit([1-9])$/.exec(code);
  return m ? Number(m[1]) - 1 : null;
}

/**
 * Counts of each cracker kind plus the selected slot. Counts never go below zero; take() refuses when a kind is
 * empty, and the selection always points at a kind in CRACKER_ORDER.
 */
export class Inventory {
  private readonly counts = new Map<CrackerKind, number>();
  private index = 0;
  private readonly onChange: () => void;

  /** Creates an empty inventory; `onChange` runs after every change that actually moves a count or the selection. */
  constructor(onChange: () => void = () => {}) {
    this.onChange = onChange;
  }

  /** The kind currently selected on the hotbar. */
  get selected(): CrackerKind {
    return CRACKER_ORDER[this.index];
  }

  /** Index of the selected kind in CRACKER_ORDER, 0 to 9. */
  get selectedIndex(): number {
    return this.index;
  }

  /** Total crackers of every kind still carried. */
  get total(): number {
    let n = 0;
    for (const kind of CRACKER_ORDER) n += this.count(kind);
    return n;
  }

  /** Number of crackers of this kind still carried. */
  count(kind: CrackerKind): number {
    return this.counts.get(kind) ?? 0;
  }

  /** Adds `n` crackers of a kind (default 1); non-positive or fractional amounts are ignored. */
  add(kind: CrackerKind, n = 1): void {
    if (!Number.isInteger(n) || n <= 0) return;
    this.counts.set(kind, this.count(kind) + n);
    this.onChange();
  }

  /** Removes one cracker of a kind; returns false, and changes nothing, when none are left. */
  take(kind: CrackerKind): boolean {
    const have = this.count(kind);
    if (have <= 0) return false;
    this.counts.set(kind, have - 1);
    this.onChange();
    return true;
  }

  /** Selects a hotbar slot by index; out-of-range indices are ignored. */
  select(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= SLOT_COUNT) return;
    if (index === this.index) return;
    this.index = index;
    this.onChange();
  }

  /** Moves the selection forward (dir 1) or back (dir -1) by one slot, wrapping at either end. */
  cycle(dir: 1 | -1): void {
    const next = (((this.index + dir) % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT;
    if (next === this.index) return;
    this.index = next;
    this.onChange();
  }

  /** English name of the selected kind, as printed on its box (for prompts and toasts). */
  selectedLabel(): string {
    return CRACKERS[this.selected].label;
  }
}
