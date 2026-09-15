import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  pdfBooklet,
  defaultPdfBookletOptions,
  getGridDimensions,
  bookletPageNumber,
} from './pdf-booklet.js';

async function makeFile(pageCount: number): Promise<File> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = pdf.addPage([200, 100]);
    // embedPdf requires a content stream; draw something trivial.
    page.drawRectangle({ x: 0, y: 0, width: 10, height: 10 });
  }
  const bytes = await pdf.save();
  return new File([new Uint8Array(bytes)], 'doc.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

/** Rebuilds the [left, right] page-number pair drawn on each sheet side. */
function signatureSequence(totalPages: number): number[][] {
  const totalRounded = Math.ceil(totalPages / 4) * 4;
  const numSheets = (totalRounded / 4) * 2;
  const sequence: number[][] = [];
  for (let sheetIndex = 0; sheetIndex < numSheets; sheetIndex++) {
    sequence.push([
      bookletPageNumber(sheetIndex, 0, totalRounded),
      bookletPageNumber(sheetIndex, 1, totalRounded),
    ]);
  }
  return sequence;
}

describe('pdf-booklet engine (imposition math)', () => {
  it('has the same defaults as the legacy booklet page', () => {
    expect(defaultPdfBookletOptions).toEqual({
      gridMode: '1x2',
      orientation: 'auto',
      paperSize: 'Letter',
      rotation: 'none',
    });
  });

  it('maps grid modes to the legacy row/col dimensions', () => {
    expect(getGridDimensions('1x2')).toEqual({ rows: 1, cols: 2 });
    expect(getGridDimensions('2x2')).toEqual({ rows: 2, cols: 2 });
    expect(getGridDimensions('2x4')).toEqual({ rows: 2, cols: 4 });
    expect(getGridDimensions('4x4')).toEqual({ rows: 4, cols: 4 });
  });

  it('produces the classic saddle-stitch signature order for 8 pages', () => {
    // Front/back pairs, physical sheet by physical sheet: [N,1],[2,N-1],[N-2,3],[4,N-3]...
    expect(signatureSequence(8)).toEqual([
      [8, 1],
      [2, 7],
      [6, 3],
      [4, 5],
    ]);
  });

  it('produces the signature order for 4 pages (single physical sheet)', () => {
    expect(signatureSequence(4)).toEqual([
      [4, 1],
      [2, 3],
    ]);
  });

  it('pads a non-multiple-of-4 page count with blanks in the right slots', () => {
    // 6 pages round up to 8: page numbers 7 and 8 don't exist and are blank.
    const sequence = signatureSequence(6);
    expect(sequence).toEqual([
      [8, 1],
      [2, 7],
      [6, 3],
      [4, 5],
    ]);
    const valid = sequence.flat().filter((n) => n >= 1 && n <= 6);
    // Every real page (1-6) appears exactly once across the imposed sheets.
    expect(valid.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('lays out non-booklet grids (2x2) in simple row-major order', async () => {
    const file = await makeFile(5);
    const result = await pdfBooklet(file, { gridMode: '2x2' }, ctx);
    const doc = await PDFDocument.load(await result.arrayBuffer());
    // ceil(5/4) = 2 sheets, no blank padding for non-booklet grids
    expect(doc.getPageCount()).toBe(2);
  });

  it('booklet mode (1x2) emits 2 output pages per physical sheet', async () => {
    const file = await makeFile(9); // rounds up to 12 -> 3 physical sheets -> 6 output pages
    const result = await pdfBooklet(file, { gridMode: '1x2' }, ctx);
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getPageCount()).toBe(6);
  });

  it('reports progress per output sheet', async () => {
    const file = await makeFile(4);
    const labels: string[] = [];
    await pdfBooklet(
      file,
      { gridMode: '1x2' },
      {
        signal: new AbortController().signal,
        progress: (p) => labels.push(p.label),
      }
    );
    expect(labels).toEqual(['Sheet 1 of 2', 'Sheet 2 of 2', 'Saving document']);
  });

  it('rejects when cancelled', async () => {
    const file = await makeFile(4);
    const controller = new AbortController();
    controller.abort();
    await expect(
      pdfBooklet(file, defaultPdfBookletOptions, {
        signal: controller.signal,
        progress: () => {},
      })
    ).rejects.toThrow('Cancelled');
  });
});
