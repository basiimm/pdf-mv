import { describe, it, expect } from 'vitest';
import { safeAttachmentName, attachmentsZipName } from './extract-attachments';

describe('extract-attachments engine (pure parts)', () => {
  it('strips directory components and control characters', () => {
    const used = new Set<string>();
    expect(safeAttachmentName('sub/dir\\evil.txt', used)).toBe('evil.txt');
  });
  it('falls back to a generic name when empty', () => {
    const used = new Set<string>();
    expect(safeAttachmentName('', used)).toBe('attachment');
  });
  it('de-duplicates repeated names by suffixing a counter before the extension', () => {
    const used = new Set<string>();
    expect(safeAttachmentName('file.txt', used)).toBe('file.txt');
    expect(safeAttachmentName('file.txt', used)).toBe('file_1.txt');
    expect(safeAttachmentName('file.txt', used)).toBe('file_2.txt');
  });
  it('names the output archive from the cleaned source filename', () => {
    expect(attachmentsZipName('Report.pdf')).toBe('Report-attachments.zip');
  });
});
