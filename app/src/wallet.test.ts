import { describe, expect, it } from 'vitest';
import { errorCode, isTestnetChain, messageOf } from './wallet';

describe('chain checks', () => {
  it('accepts Mezo testnet as hex, decimal text, or a number', () => {
    expect(isTestnetChain('0x7b7b')).toBe(true);
    expect(isTestnetChain('31611')).toBe(true);
    expect(isTestnetChain(31611)).toBe(true);
  });

  it('rejects other chains and values that are not chain IDs', () => {
    expect(isTestnetChain('0x1')).toBe(false);
    expect(isTestnetChain('0x7b7c')).toBe(false);
    expect(isTestnetChain('not a chain')).toBe(false);
    expect(isTestnetChain(undefined)).toBe(false);
  });
});

describe('error helpers', () => {
  it('reads a numeric error code and ignores anything else', () => {
    expect(errorCode({ code: 4001 })).toBe(4001);
    expect(errorCode(new Error('plain'))).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
  });

  it('shows the short message, the first line, and at most 240 characters', () => {
    expect(messageOf({ shortMessage: 'Short' })).toBe('Short');
    expect(messageOf(new Error('Line one\nLine two'))).toBe('Line one');
    expect(messageOf('x'.repeat(300))).toHaveLength(240);
  });
});
