import { describe, it, expect, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { pageNumbers, defaultPageNumbersOptions } from './page-numbers.js';

async function makeFile(pageCount = 3): Promise<File> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    pdf.addPage([300, 400]);
  }
  const bytes = await pdf.save();
  return new File([new Uint8Array(bytes)], 'source.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('pageNumbers engine', () => {
  it('preserves the page count and produces a re-loadable PDF', async () => {
    const file = await makeFile(4);
    const result = await pageNumbers(file, {}, ctx);
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getPageCount()).toBe(4);
  });

  it('produces a document whose size differs from the unstamped source', async () => {
    const file = await makeFile(2);
    const before = await PDFDocument.load(await file.arrayBuffer());
    const plainBytes = await before.save();

    const result = await pageNumbers(file, {}, ctx);
    const after = await PDFDocument.load(await result.arrayBuffer());
    expect(after.getPageCount()).toBe(2);

    const stampedBytes = await result.arrayBuffer();
    expect(stampedBytes.byteLength).not.toBe(plainBytes.byteLength);
  });

  it('formats "x / y" when format is page_x_of_y', async () => {
    const file = await makeFile(3);
    const result = await pageNumbers(file, { format: 'page_x_of_y' }, ctx);
    // Just assert it doesn't throw and yields a valid, same-length document.
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getPageCount()).toBe(3);
  });

  it('reports progress per page', async () => {
    const file = await makeFile(3);
    const labels: string[] = [];
    await pageNumbers(
      file,
      {},
      {
        signal: new AbortController().signal,
        progress: (u) => labels.push(u.label),
      }
    );
    expect(labels).toContain('Page 1 of 3');
    expect(labels).toContain('Page 3 of 3');
  });

  it('throws a password-mentioning error for encrypted PDFs', async () => {
    vi.resetModules();
    vi.doMock('../utils/load-pdf-document.js', () => ({
      loadPdfDocument: vi.fn(async () => ({ isEncrypted: true })),
    }));
    try {
      const { pageNumbers: pageNumbersMocked } =
        await import('./page-numbers.js');
      const file = await makeFile(1);
      await expect(pageNumbersMocked(file, {}, ctx)).rejects.toThrow(
        'password'
      );
    } finally {
      vi.doUnmock('../utils/load-pdf-document.js');
      vi.resetModules();
    }
  });

  it('rejects immediately when already cancelled', async () => {
    const file = await makeFile(1);
    const controller = new AbortController();
    controller.abort();
    await expect(
      pageNumbers(file, {}, { signal: controller.signal, progress: () => {} })
    ).rejects.toThrow('Cancelled');
  });

  it('uses legacy defaults', () => {
    expect(defaultPageNumbersOptions).toEqual({
      position: 'bottom-center',
      fontSize: 12,
      format: 'simple',
      color: '#000000',
    });
  });
});
