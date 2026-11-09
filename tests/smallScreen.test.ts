// Tests for the small-screen check: which windows and pointers get the game and which get the greeting card.
import { describe, it, expect } from 'vitest';
import { MIN_GAME_WIDTH, needsBigScreen } from '../src/ui/SmallScreen';

describe('needsBigScreen', () => {
  it('lets a laptop with a mouse play', () => {
    expect(needsBigScreen(1440, true)).toBe(false);
  });

  it('shows the card on a phone (narrow and touch-only)', () => {
    expect(needsBigScreen(390, false)).toBe(true);
  });

  it('shows the card on a touch-only tablet even when it is wide', () => {
    expect(needsBigScreen(1180, false)).toBe(true);
  });

  it('shows the card in a desktop window narrower than the minimum', () => {
    expect(needsBigScreen(MIN_GAME_WIDTH - 1, true)).toBe(true);
    expect(needsBigScreen(MIN_GAME_WIDTH, true)).toBe(false);
  });
});
