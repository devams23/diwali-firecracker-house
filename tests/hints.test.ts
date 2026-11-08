// Tests for the onboarding hint priority: each branch of nextHint must return its exact string
// for the state that triggers it. Pure logic, runs under Node.
import { describe, it, expect } from 'vitest';
import { nextHint, type PlayerState } from '../src/player/PlayerState';

/** Base state: the agarbatti is lit and the selected kind has crackers left. */
function state(over: Partial<PlayerState> = {}): PlayerState {
  return {
    hasAgarbatti: true,
    agarbattiLit: true,
    selectedName: 'Anar',
    selectedCount: 3,
    totalCount: 9,
    placedUnlit: 0,
    burstCount: 0,
    ...over,
  };
}

describe('nextHint', () => {
  it('asks the player to take the agarbatti when they do not have it', () => {
    expect(nextHint(state({ hasAgarbatti: false, agarbattiLit: false }))).toBe(
      'Take the agarbatti from the tulsi chaura',
    );
  });

  it('asks the player to light the agarbatti before anything else', () => {
    expect(nextHint(state({ agarbattiLit: false, placedUnlit: 1 }))).toBe('Light the agarbatti at the diya first');
  });

  it('asks the player to touch a fuse when a cracker is placed unlit', () => {
    expect(nextHint(state({ placedUnlit: 1 }))).toBe('Touch the agarbatti to the fuse — click');
  });

  it('says the selected kind is out and to restock when its count is zero', () => {
    expect(nextHint(state({ selectedCount: 0 }))).toBe('Out of Anar — restock at the stall');
  });

  it('says there are no crackers at all when the whole inventory is empty', () => {
    expect(nextHint(state({ selectedCount: 0, totalCount: 0 }))).toBe('Out of crackers — restock at the stall');
  });

  it('explains choosing and placing when the selected kind has crackers', () => {
    expect(nextHint(state())).toBe('1–0 or scroll to choose · F to place it');
  });
});
