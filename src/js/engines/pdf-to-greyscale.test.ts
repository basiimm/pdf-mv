import { describe, it, expect } from 'vitest';
import { resolveScale } from './pdf-to-greyscale';

describe('pdf-to-greyscale engine (pure parts)', () => {
  it('defaults to the legacy 2x render scale', () => {
    expect(resolveScale({})).toBe(2.0);
  });
  it('honors a positive custom scale', () => {
    expect(resolveScale({ scale: 3 })).toBe(3);
  });
  it('falls back to the default for zero or negative values', () => {
    expect(resolveScale({ scale: 0 })).toBe(2.0);
    expect(resolveScale({ scale: -1 })).toBe(2.0);
  });
});
