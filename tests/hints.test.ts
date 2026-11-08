// Tests for the onboarding hint priority: each branch of nextHint must return its exact string
// for the state that triggers it. Pure logic, runs under Node.
import { describe, it, expect } from 'vitest';
import { nextHint, type PlayerState } from '../src/player/PlayerState';

/** Base state: the stall has been visited and the selected kind has crackers left. */
function state(over: Partial<PlayerState> = {}): PlayerState {
  return {
    visitedStall: true,
    selectedName: 'Anar',
    selectedCount: 3,
    totalCount: 9,
    placedUnlit: 0,
    burstCount: 0,
    diyasLit: 3,
    ...over,
  };
}

describe('nextHint', () => {
  it('points a new player at the stall', () => {
    expect(nextHint(state({ visitedStall: false }))).toBe('Pick crackers at the stall · E');
  });

  it('asks the player to touch a fuse when a cracker is placed unlit', () => {
    expect(nextHint(state({ placedUnlit: 1 }))).toBe('Aim at the fuse and click to light it');
  });

  it('says the selected kind is out and to restock when its count is zero', () => {
    expect(nextHint(state({ selectedCount: 0 }))).toBe('Out of Anar — restock at the stall');
  });

  it('says there are no crackers at all when the whole inventory is empty', () => {
    expect(nextHint(state({ selectedCount: 0, totalCount: 0 }))).toBe('Out of crackers — restock at the stall');
  });

  it('explains choosing and placing when the selected kind has crackers', () => {
    expect(nextHint(state())).toBe('F — place · aim at the fuse and click');
  });

  it('invites a newcomer to light the verandah diyas before anything else but an unlit fuse', () => {
    const hint = 'Light the diyas on the verandah — aim and click · दीप जलाइए';
    expect(nextHint(state({ diyasLit: 0, visitedStall: false }))).toBe(hint);
    expect(nextHint(state({ diyasLit: 0, selectedCount: 0 }))).toBe(hint);
    expect(nextHint(state({ diyasLit: 0, placedUnlit: 1 }))).toBe('Aim at the fuse and click to light it');
  });
});
