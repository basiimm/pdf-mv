import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { nUpPdf, defaultNUpOptions } from './n-up-pdf.js';

async function makeFile(pageCount: number): Promise<File> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = pdf.addPage([200, 100]);
    // embedPage requires a content stream; draw something trivial.
    page.drawRectangle({ x: 0, y: 0, width: 10, height: 10 });
  }
  const bytes = await pdf.save();
  return new File([new Uint8Array(bytes)], 'doc.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('nUpPdf engine', () => {
  it('has the same defaults as the legacy n-up page', () => {
    expect(defaultNUpOptions).toEqual({
      pagesPerSheet: 4,
      pageSize: 'Letter',
      orientation: 'auto',
      margins: false,
      border: false,
      borderColor: '#000000',
    });
  });

  it('lays out 9 source pages at 4-up into 3 output sheets', async () => {
    const file = await makeFile(9);
    const result = await nUpPdf(file, { pagesPerSheet: 4 }, ctx);
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getPageCount()).toBe(3);
  });

  it('lays out 5 source pages at 2-up into 3 output sheets (last sheet partial)', async () => {
    const file = await makeFile(5);
    const result = await nUpPdf(file, { pagesPerSheet: 2 }, ctx);
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getPageCount()).toBe(3);
  });

  it('lays out 9-up and 16-up grids with the expected sheet counts', async () => {
    const file9 = await makeFile(18);
    const result9 = await nUpPdf(file9, { pagesPerSheet: 9 }, ctx);
    const doc9 = await PDFDocument.load(await result9.arrayBuffer());
    expect(doc9.getPageCount()).toBe(2);

    const file16 = await makeFile(17);
    const result16 = await nUpPdf(file16, { pagesPerSheet: 16 }, ctx);
    const doc16 = await PDFDocument.load(await result16.arrayBuffer());
    expect(doc16.getPageCount()).toBe(2);
  });

  it('reports progress per output sheet', async () => {
    const file = await makeFile(9);
    const labels: string[] = [];
    await nUpPdf(
      file,
      { pagesPerSheet: 4 },
      {
        signal: new AbortController().signal,
        progress: (p) => labels.push(p.label),
      }
    );
    expect(labels).toEqual([
      'Sheet 1 of 3',
      'Sheet 2 of 3',
      'Sheet 3 of 3',
      'Saving document',
    ]);
  });

  it('rejects an unsupported pages-per-sheet value with a plain-language error', async () => {
    const file = await makeFile(4);
    await expect(
      nUpPdf(file, { pagesPerSheet: 3 as 2 | 4 | 9 | 16 }, ctx)
    ).rejects.toThrow('Choose 2, 4, 9, or 16 pages per sheet.');
  });

  it('rejects when cancelled', async () => {
    const file = await makeFile(4);
    const controller = new AbortController();
    controller.abort();
    await expect(
      nUpPdf(file, defaultNUpOptions, {
        signal: controller.signal,
        progress: () => {},
      })
    ).rejects.toThrow('Cancelled');
  });
});
