// Tests for the onboarding hint priority: each branch of nextHint must return its exact string
// for the state that triggers it. Pure logic, runs under Node.
import { describe, it, expect } from 'vitest';
import { nextHint, contextPrompt, type PlayerState } from '../src/player/PlayerState';

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
    selectedHindi: 'अनार',
    selectedHandheld: false,
    selectedLantern: false,
    heldName: '',
    heldUnlit: false,
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

describe('contextPrompt', () => {
  it('shows F to place the selected ground cracker with both names', () => {
    expect(contextPrompt(state(), false)).toEqual({ key: 'F', text: 'Place Anar · अनार' });
  });

  it('offers to hold a hand-held kind, then to light it once held', () => {
    const hand = { selectedName: 'Phuljhadi', selectedHandheld: true };
    expect(contextPrompt(state(hand), false)).toEqual({ key: 'F', text: 'Hold Phuljhadi' });
    expect(contextPrompt(state({ ...hand, heldName: 'Phuljhadi', heldUnlit: true }), false)).toEqual({
      key: 'Click',
      text: 'Light the phuljhadi',
    });
  });

  it('shows F to release a sky lantern', () => {
    expect(contextPrompt(state({ selectedLantern: true }), false)).toEqual({ key: 'F', text: 'Release a sky lantern' });
  });

  it('says step back with no key, and restock with no key when out of stock', () => {
    expect(contextPrompt(state(), true)).toEqual({ key: null, text: 'Step back!' });
    expect(contextPrompt(state({ selectedCount: 0 }), false)).toEqual({ key: null, text: 'Restock at the stall' });
  });

  it('asks to light a placed fuse, and keeps the diya-first hint for newcomers', () => {
    expect(contextPrompt(state({ placedUnlit: 1 }), false)).toEqual({ key: 'Click', text: 'Light the fuse' });
    expect(contextPrompt(state({ diyasLit: 0 }), false).text).toContain('diyas on the verandah');
  });
});
