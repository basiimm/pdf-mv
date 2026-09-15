import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { fixPageSize, defaultFixPageSizeOptions } from './fix-page-size.js';

async function makeFile(): Promise<File> {
  const pdf = await PDFDocument.create();
  const p1 = pdf.addPage([300, 400]);
  p1.drawRectangle({ x: 0, y: 0, width: 10, height: 10 });
  const p2 = pdf.addPage([600, 300]);
  p2.drawRectangle({ x: 0, y: 0, width: 10, height: 10 });
  const bytes = await pdf.save();
  return new File([new Uint8Array(bytes)], 'source.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('fixPageSize engine', () => {
  it('resizes every page to the target A4 size', async () => {
    const file = await makeFile();
    const result = await fixPageSize(file, defaultFixPageSizeOptions, ctx);
    const doc = await PDFDocument.load(await result.arrayBuffer());
    const sizes = doc.getPages().map((p) => [p.getWidth(), p.getHeight()]);
    expect(sizes.length).toBe(2);
    // A4 in points, auto orientation keeps portrait for portrait pages and
    // rotates the target for the landscape source page.
    expect(sizes[0][0]).toBeCloseTo(595.28, 0);
    expect(sizes[0][1]).toBeCloseTo(841.89, 0);
    expect(sizes[1][0]).toBeGreaterThan(sizes[1][1]);
  });

  it('names the output with a -resized suffix', async () => {
    const file = await makeFile();
    const result = await fixPageSize(file, defaultFixPageSizeOptions, ctx);
    expect(result.name).toBe('source-resized.pdf');
  });

  it('honors custom width/height in mm', async () => {
    const file = await makeFile();
    const result = await fixPageSize(
      file,
      {
        ...defaultFixPageSizeOptions,
        targetSize: 'Custom',
        customWidth: 100,
        customHeight: 100,
        customUnits: 'mm',
      },
      ctx
    );
    const doc = await PDFDocument.load(await result.arrayBuffer());
    const [page] = doc.getPages();
    expect(page.getWidth()).toBeCloseTo(100 * (72 / 25.4), 0);
  });

  it('rejects when cancelled', async () => {
    const file = await makeFile();
    const controller = new AbortController();
    controller.abort();
    await expect(
      fixPageSize(file, defaultFixPageSizeOptions, {
        signal: controller.signal,
        progress: () => {},
      })
    ).rejects.toThrow('Cancelled');
  });
});
