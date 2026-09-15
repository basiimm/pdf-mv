import { describe, it, expect, vi } from 'vitest';
import { pdfToZip, ZIP_ARCHIVE_NAME } from './pdf-to-zip';

function ctx() {
  return { signal: new AbortController().signal, progress: vi.fn() };
}

describe('pdf-to-zip engine', () => {
  it('rejects an empty selection', async () => {
    await expect(pdfToZip([], {}, ctx())).rejects.toThrow(
      'Choose at least one PDF'
    );
  });

  it('bundles the given PDFs into one archive named pdfs_archive.zip', async () => {
    const files = [
      new File(['a'], 'a.pdf', { type: 'application/pdf' }),
      new File(['b'], 'b.pdf', { type: 'application/pdf' }),
    ];
    const result = await pdfToZip(files, {}, ctx());
    expect(result.name).toBe(ZIP_ARCHIVE_NAME);
    expect(result.type).toBe('application/zip');
  });

  it('stops when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const files = [new File(['a'], 'a.pdf', { type: 'application/pdf' })];
    await expect(
      pdfToZip(files, {}, { signal: controller.signal, progress: vi.fn() })
    ).rejects.toThrow('Cancelled');
  });
});
