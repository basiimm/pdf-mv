import { describe, it, expect } from 'vitest';
import { tableToCsv } from './pdf-to-csv';

describe('pdf-to-csv engine (pure parts)', () => {
  it('joins simple rows with commas and newlines', () => {
    expect(
      tableToCsv([
        ['a', 'b'],
        ['c', 'd'],
      ])
    ).toBe('a,b\nc,d');
  });
  it('quotes cells containing commas, quotes or newlines', () => {
    expect(tableToCsv([['a,b', 'say "hi"', 'multi\nline']])).toBe(
      '"a,b","say ""hi""","multi\nline"'
    );
  });
  it('treats null cells as empty strings', () => {
    expect(tableToCsv([[null, 'x']])).toBe(',x');
  });
});
