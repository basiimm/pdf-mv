import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { dividePages } from './divide-pages.js';

async function makeFile(pageCount: number): Promise<File> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) pdf.addPage([200, 100]);
  const bytes = await pdf.save();
  return new File([new Uint8Array(bytes)], 'doc.pdf', {
    type: 'application/pdf',
  });
}

describe('dividePages engine', () => {
  it('doubles the page count when splitting all pages vertically', async () => {
    const file = await makeFile(3);
    const result = await dividePages(
      file,
      { direction: 'vertical', pages: '' },
      { signal: new AbortController().signal, progress: () => {} }
    );
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getPageCount()).toBe(6);
  });

  it('only splits pages within the given range', async () => {
    const file = await makeFile(3);
    const result = await dividePages(
      file,
      { direction: 'vertical', pages: '2' },
      { signal: new AbortController().signal, progress: () => {} }
    );
    const doc = await PDFDocument.load(await result.arrayBuffer());
    // page 1 untouched, page 2 split into 2, page 3 untouched = 4 pages
    expect(doc.getPageCount()).toBe(4);
  });

  it('rejects when cancelled', async () => {
    const file = await makeFile(2);
    const controller = new AbortController();
    controller.abort();
    await expect(
      dividePages(file, {}, { signal: controller.signal, progress: () => {} })
    ).rejects.toThrow('Cancelled');
  });
});
