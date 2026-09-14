import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildDuplexOrder, duplexCollate } from './duplex-collate.js';

describe('buildDuplexOrder', () => {
  it('interleaves front and reversed back blocks', () => {
    const { order, frontCount, backCount } = buildDuplexOrder(6, 3, 'reverse');
    // fronts: 0,1,2  backs (reversed): 5,4,3
    expect(order).toEqual([0, 5, 1, 4, 2, 3]);
    expect(frontCount).toBe(3);
    expect(backCount).toBe(3);
  });

  it('keeps back order when requested', () => {
    const { order } = buildDuplexOrder(6, 3, 'keep');
    expect(order).toEqual([0, 3, 1, 4, 2, 5]);
  });

  it('appends unpaired pages when blocks differ in length', () => {
    const { order } = buildDuplexOrder(5, 3, 'reverse');
    // fronts: 0,1,2  backs (reversed): 4,3
    expect(order).toEqual([0, 4, 1, 3, 2]);
  });
});

describe('duplexCollate engine', () => {
  async function makeFile(pageCount: number): Promise<File> {
    const pdf = await PDFDocument.create();
    for (let i = 0; i < pageCount; i++) pdf.addPage([100, 100]);
    const bytes = await pdf.save();
    return new File([new Uint8Array(bytes)], 'doc.pdf', {
      type: 'application/pdf',
    });
  }

  it('produces a document with the same page count, reordered', async () => {
    const file = await makeFile(6);
    const result = await duplexCollate(
      file,
      { splitPage: '3', backOrder: 'reverse' },
      { signal: new AbortController().signal, progress: () => {} }
    );
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getPageCount()).toBe(6);
  });

  it('rejects documents with fewer than 2 pages', async () => {
    const file = await makeFile(1);
    await expect(
      duplexCollate(
        file,
        {},
        { signal: new AbortController().signal, progress: () => {} }
      )
    ).rejects.toThrow('at least 2 pages');
  });

  it('rejects when cancelled', async () => {
    const file = await makeFile(4);
    const controller = new AbortController();
    controller.abort();
    await expect(
      duplexCollate(file, {}, { signal: controller.signal, progress: () => {} })
    ).rejects.toThrow('Cancelled');
  });
});
