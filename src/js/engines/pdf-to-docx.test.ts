import { describe, it, expect } from 'vitest';
import { docxNameFor } from './pdf-to-docx';

describe('pdf-to-docx engine (pure parts)', () => {
  it('replaces the .pdf extension with .docx', () => {
    expect(docxNameFor('Report.pdf')).toBe('Report.docx');
    expect(docxNameFor('Report.PDF')).toBe('Report.docx');
    expect(docxNameFor('no-extension')).toBe('no-extension.docx');
  });
});
