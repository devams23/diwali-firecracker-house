// Tests for the pure prompt parsing: the keycap token is split from the text, and text without a key keeps key null.
import { describe, expect, it } from 'vitest';
import { parsePrompt } from '../src/ui/Prompt';

describe('parsePrompt', () => {
  it('splits an E prompt with an em dash into key and text', () => {
    expect(parsePrompt('E — Pick up the thaali (plate)')).toEqual({
      key: 'E',
      text: 'Pick up the thaali (plate)',
    });
  });

  it('accepts the key without the em dash', () => {
    expect(parsePrompt('F Set the cracker down')).toEqual({ key: 'F', text: 'Set the cracker down' });
  });

  it('recognises Q and Click keycaps', () => {
    expect(parsePrompt('Q — Choose a cracker').key).toBe('Q');
    expect(parsePrompt('Click — Light the fuse').key).toBe('Click');
  });

  it('leaves text without a leading keycap whole and keyless', () => {
    expect(parsePrompt('Step back!')).toEqual({ key: null, text: 'Step back!' });
    expect(parsePrompt('')).toEqual({ key: null, text: '' });
  });
});
