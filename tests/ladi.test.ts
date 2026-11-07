import { describe, it, expect } from 'vitest';
import { popsDueBy, LADI_POPS } from '../src/crackers/Ladi';

describe('popsDueBy', () => {
  it('has no pops before ignition', () => {
    expect(popsDueBy(-0.1)).toBe(0);
  });

  it('fires pop 0 at the ignition instant', () => {
    expect(popsDueBy(0)).toBe(1);
  });

  it('fires one pop per 1/18 s', () => {
    expect(popsDueBy(1 / 18 - 1e-9)).toBe(1);
    expect(popsDueBy(1 / 18)).toBe(2);
    expect(popsDueBy(1)).toBe(19);
  });

  it('caps at the total number of pops', () => {
    expect(LADI_POPS).toBe(60);
    expect(popsDueBy(100)).toBe(LADI_POPS);
  });
});
