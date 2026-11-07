// Tests for the thaali's cracker inventory: capacity, wrapping selection and taking the selected cracker.
// Pure logic only, so it runs under Node without a DOM or WebGL.
import { describe, it, expect } from 'vitest';
import { ThaaliInventory } from '../src/items/ThaaliInventory';

describe('ThaaliInventory', () => {
  it('accepts ten crackers and rejects the eleventh', () => {
    const inv = new ThaaliInventory();
    for (let i = 0; i < 10; i++) expect(inv.add('anar')).toBe(true);
    expect(inv.add('anar')).toBe(false);
    expect(inv.full).toBe(true);
    expect(inv.items.length).toBe(10);
  });

  it('wraps forward from the last slot to the first', () => {
    const inv = new ThaaliInventory();
    inv.add('anar');
    inv.add('rocket');
    inv.add('ladi');
    inv.selected = 2;
    inv.cycle(1);
    expect(inv.selected).toBe(0);
  });

  it('wraps backward from the first slot to the last', () => {
    const inv = new ThaaliInventory();
    inv.add('anar');
    inv.add('rocket');
    inv.add('ladi');
    inv.selected = 0;
    inv.cycle(-1);
    expect(inv.selected).toBe(2);
  });

  it('takes the selected cracker and keeps the selection in range', () => {
    const inv = new ThaaliInventory();
    inv.add('anar');
    inv.add('rocket');
    inv.selected = 1;
    expect(inv.takeSelected()).toBe('rocket');
    expect(inv.selected).toBe(0);
    expect(inv.items).toEqual(['anar']);
  });

  it('returns null when taking from an empty thaali', () => {
    const inv = new ThaaliInventory();
    expect(inv.takeSelected()).toBeNull();
  });
});
