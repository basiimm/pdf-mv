import { describe, it, expect } from 'vitest';
import { jsonNameFor } from './pdf-to-json';

describe('pdf-to-json engine (pure parts)', () => {
  it('replaces the .pdf extension with .json', () => {
    expect(jsonNameFor('Report.pdf')).toBe('Report.json');
    expect(jsonNameFor('Report.PDF')).toBe('Report.json');
  });
});
