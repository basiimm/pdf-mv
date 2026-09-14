import { describe, it, expect } from 'vitest';
import { markdownNameFor } from './pdf-to-markdown';

describe('pdf-to-markdown engine (pure parts)', () => {
  it('replaces the .pdf extension with .md', () => {
    expect(markdownNameFor('Report.pdf')).toBe('Report.md');
    expect(markdownNameFor('Report.PDF')).toBe('Report.md');
  });
});
