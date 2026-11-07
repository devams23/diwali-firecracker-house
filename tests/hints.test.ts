// Tests for the onboarding hint priority: each branch of nextHint must return its exact string
// for the state that triggers it. Pure logic, runs under Node.
import { describe, it, expect } from 'vitest';
import { nextHint, type PlayerState } from '../src/player/PlayerState';

/** Base state: the player holds the thaali with a full set and has everything they need. */
function state(over: Partial<PlayerState> = {}): PlayerState {
  return {
    thaali: 'hand',
    hasAgarbatti: true,
    agarbattiLit: true,
    leftHand: 'thaali',
    thaaliCount: 3,
    placedUnlit: 0,
    burstCount: 0,
    ...over,
  };
}

describe('nextHint', () => {
  it('asks the player to pick up the thaali from the charpai', () => {
    expect(nextHint(state({ thaali: 'charpai' }))).toBe('Your thaali is on the charpai — go pick it up');
  });

  it('asks the player to fill an empty thaali from the takht', () => {
    expect(nextHint(state({ thaaliCount: 0 }))).toBe('Fill your thaali at the takht by the verandah');
  });

  it('asks the player to take the agarbatti when they do not have it', () => {
    expect(nextHint(state({ hasAgarbatti: false, agarbattiLit: false }))).toBe(
      'Take the agarbatti from the tulsi chaura',
    );
  });

  it('asks the player to light the agarbatti before anything else', () => {
    expect(nextHint(state({ agarbattiLit: false, hasAgarbatti: true, thaali: 'hand', thaaliCount: 2 }))).toBe(
      'Light the agarbatti at the diya first',
    );
  });

  it('asks the player to touch a fuse when a cracker is placed unlit', () => {
    expect(nextHint(state({ placedUnlit: 1 }))).toBe('Touch the agarbatti to the fuse — click');
  });

  it('gives the charpai hint priority over an unlit placed cracker', () => {
    expect(nextHint(state({ thaali: 'charpai', placedUnlit: 1 }))).toBe(
      'Your thaali is on the charpai — go pick it up',
    );
  });

  it('explains choosing and placing when the thaali has crackers', () => {
    expect(nextHint(state({ thaaliCount: 4 }))).toBe('Q / scroll to choose · F to place it on the ground');
  });

  it('shows the closing line when there is nothing left to do', () => {
    expect(nextHint(state({ thaali: 'ground', thaaliCount: 0 }))).toBe('Shubh Deepavali — the takht has more');
  });
});
