import { describe, it, expect } from 'vitest';
import { parseNamesToRemove } from './edit-attachments.js';

describe('parseNamesToRemove', () => {
  it('splits comma-separated names and trims whitespace', () => {
    expect(parseNamesToRemove('a.txt, b.pdf ,c.png')).toEqual([
      'a.txt',
      'b.pdf',
      'c.png',
    ]);
  });

  it('drops empty entries', () => {
    expect(parseNamesToRemove('a.txt, , ,b.pdf')).toEqual(['a.txt', 'b.pdf']);
  });

  it('returns an empty array for blank input', () => {
    expect(parseNamesToRemove('')).toEqual([]);
    expect(parseNamesToRemove('   ')).toEqual([]);
  });
});
