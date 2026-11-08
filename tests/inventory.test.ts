// Tests for the cracker inventory: adding and taking counts, the selection and its wrap-around, the hotbar key map and
// the pack sizes from the catalogue. Pure logic, so it runs under Node.
import { describe, it, expect } from 'vitest';
import { Inventory, slotIndexForKey, SLOT_COUNT } from '../src/items/Inventory';
import { CRACKER_ORDER, CRACKERS } from '../src/crackers/catalog';

describe('Inventory counts', () => {
  it('starts empty and adds the amount given, defaulting to one', () => {
    const inv = new Inventory();
    expect(inv.count('anar')).toBe(0);
    inv.add('anar', 5);
    inv.add('anar');
    expect(inv.count('anar')).toBe(6);
    expect(inv.total).toBe(6);
  });

  it('takes one at a time and refuses when the kind is empty', () => {
    const inv = new Inventory();
    inv.add('rocket', 2);
    expect(inv.take('rocket')).toBe(true);
    expect(inv.take('rocket')).toBe(true);
    expect(inv.take('rocket')).toBe(false);
    expect(inv.count('rocket')).toBe(0);
  });

  it('ignores non-positive and fractional adds', () => {
    const inv = new Inventory();
    inv.add('chakri', 0);
    inv.add('chakri', -3);
    inv.add('chakri', 1.5);
    expect(inv.count('chakri')).toBe(0);
  });

  it('keeps each kind separate', () => {
    const inv = new Inventory();
    inv.add('anar', 3);
    inv.take('anar');
    expect(inv.count('anar')).toBe(2);
    expect(inv.count('ladi')).toBe(0);
  });

  it('emits a change only when a count or the selection actually moves', () => {
    let changes = 0;
    const inv = new Inventory(() => changes++);
    inv.add('anar', 2);
    inv.take('anar');
    expect(changes).toBe(2);
    inv.take('ladi');
    inv.add('anar', 0);
    expect(changes).toBe(2);
    inv.select(0);
    expect(changes).toBe(2);
    inv.select(3);
    expect(changes).toBe(3);
  });
});

describe('Inventory selection', () => {
  it('starts on the first kind in CRACKER_ORDER', () => {
    const inv = new Inventory();
    expect(inv.selected).toBe(CRACKER_ORDER[0]);
    expect(inv.selectedIndex).toBe(0);
  });

  it('selects by slot index and ignores out-of-range indices', () => {
    const inv = new Inventory();
    inv.select(2);
    expect(inv.selected).toBe('anar');
    inv.select(SLOT_COUNT);
    inv.select(-1);
    inv.select(1.5);
    expect(inv.selected).toBe('anar');
  });

  it('cycles forward and wraps from the last slot to the first', () => {
    const inv = new Inventory();
    inv.select(SLOT_COUNT - 1);
    inv.cycle(1);
    expect(inv.selectedIndex).toBe(0);
  });

  it('cycles backward and wraps from the first slot to the last', () => {
    const inv = new Inventory();
    inv.cycle(-1);
    expect(inv.selectedIndex).toBe(SLOT_COUNT - 1);
    expect(inv.selected).toBe('skyshot');
  });

  it('keeps the selection when a count goes to zero, so the hotbar still shows it', () => {
    const inv = new Inventory();
    inv.select(2);
    expect(inv.take('anar')).toBe(false);
    expect(inv.selected).toBe('anar');
    expect(inv.selectedLabel()).toBe('Anar');
  });
});

describe('slotIndexForKey', () => {
  it('maps Digit1 to Digit9 to slots 0 to 8 and Digit0 to slot 9', () => {
    expect(slotIndexForKey('Digit1')).toBe(0);
    expect(slotIndexForKey('Digit9')).toBe(8);
    expect(slotIndexForKey('Digit0')).toBe(9);
  });

  it('returns null for every other key', () => {
    expect(slotIndexForKey('KeyE')).toBeNull();
    expect(slotIndexForKey('Numpad1')).toBeNull();
    expect(slotIndexForKey('Digit')).toBeNull();
  });
});

describe('pack sizes', () => {
  it('match the stall pack sizes in the catalogue', () => {
    const expected: Record<string, number> = {
      phuljhadi: 10,
      pencil: 10,
      anar: 5,
      chakri: 5,
      rocket: 5,
      laxmi: 10,
      sutli: 3,
      ladi: 1,
      saanp: 10,
      skyshot: 1,
    };
    for (const kind of CRACKER_ORDER) expect(CRACKERS[kind].pack).toBe(expected[kind]);
  });

  it('has one slot per cracker kind', () => {
    expect(SLOT_COUNT).toBe(10);
  });
});
