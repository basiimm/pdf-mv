import { describe, expect, it } from 'vitest';
import { detectConversion } from './workspace-conversion';
const file = (name: string) => new File(['fixture'], name);
describe('file-first conversion routing', () => {
  it('routes office aliases and uppercase extensions', () => {
    expect(detectConversion([file('REPORT.DOCX')])).toBe('word-to-pdf');
    expect(detectConversion([file('sheet.xls')])).toBe('excel-to-pdf');
    expect(detectConversion([file('slides.pptx')])).toBe('powerpoint-to-pdf');
  });
  it('supports mixed images without silently dropping files', () => {
    expect(detectConversion([file('a.jpeg'), file('b.png')])).toBe(
      'image-to-pdf'
    );
  });
  it('exports one PDF and rejects unsupported or incompatible batches', () => {
    expect(detectConversion([file('a.pdf')])).toBe('pdf-to-png');
    expect(() => detectConversion([file('a.pdf'), file('b.pdf')])).toThrow(
      'one PDF'
    );
    expect(() => detectConversion([file('a.docx'), file('b.png')])).toThrow(
      'one document'
    );
    expect(() => detectConversion([file('a.exe')])).toThrow('not supported');
  });
});
