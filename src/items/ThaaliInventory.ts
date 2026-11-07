// Crackers carried on the brass thaali: a capped list the player fills at the takht, cycles through with
// Q or the scroll wheel, and takes one from at a time to place or light. Pure logic, no DOM or three.js.
import type { CrackerKind } from '../crackers/catalog';

/** The thaali's cracker list plus the index of the cracker currently selected. */
export class ThaaliInventory {
  /** Maximum number of crackers the plate holds. */
  static readonly CAPACITY = 10;

  /** Crackers on the plate in the order they were added. */
  readonly items: CrackerKind[] = [];
  /** Index into items of the selected cracker; kept in range whenever items changes. */
  selected = 0;

  /** Adds a cracker to the plate; returns false when the plate is already full. */
  add(kind: CrackerKind): boolean {
    if (this.full) return false;
    this.items.push(kind);
    return true;
  }

  /** True when the plate holds CAPACITY crackers. */
  get full(): boolean {
    return this.items.length >= ThaaliInventory.CAPACITY;
  }

  /** The selected cracker's kind, or null when the plate is empty. */
  get selectedKind(): CrackerKind | null {
    return this.items[this.selected] ?? null;
  }

  /** Moves the selection forward or back by one, wrapping at either end. */
  cycle(dir: 1 | -1): void {
    const n = this.items.length;
    if (n === 0) {
      this.selected = 0;
      return;
    }
    this.selected = (((this.selected + dir) % n) + n) % n;
  }

  /** Removes and returns the selected cracker, or null when empty; the selection stays in range. */
  takeSelected(): CrackerKind | null {
    if (this.items.length === 0) return null;
    const [kind] = this.items.splice(this.selected, 1);
    if (this.selected >= this.items.length) this.selected = Math.max(0, this.items.length - 1);
    return kind ?? null;
  }
}
