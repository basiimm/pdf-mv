import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { cropPdf, cropPdfDetails, defaultCropPdfOptions } from './crop-pdf.js';

async function makeFile(pages = 2, width = 200, height = 400): Promise<File> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage([width, height]);
  const bytes = await pdf.save();
  return new File([new Uint8Array(bytes)], 'doc.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('cropPdf engine', () => {
  it('shrinks the crop box by the given percent margins', async () => {
    const file = await makeFile(1, 200, 400);
    const result = await cropPdf(
      file,
      {
        ...defaultCropPdfOptions,
        unit: 'percent',
        top: '10',
        bottom: '10',
        left: '25',
        right: '25',
      },
      ctx
    );
    const doc = await PDFDocument.load(await result.arrayBuffer());
    const box = doc.getPages()[0].getCropBox();
    expect(box.width).toBeCloseTo(100); // 200 - 25% - 25% of 200
    expect(box.height).toBeCloseTo(320); // 400 - 10% - 10% of 400
  });

  it('converts millimeter margins to points', async () => {
    const file = await makeFile(1, 200, 400);
    const result = await cropPdf(
      file,
      {
        ...defaultCropPdfOptions,
        unit: 'mm',
        top: '10',
        bottom: '0',
        left: '0',
        right: '0',
      },
      ctx
    );
    const doc = await PDFDocument.load(await result.arrayBuffer());
    const box = doc.getPages()[0].getCropBox();
    // 10mm ~= 28.35pt
    expect(box.height).toBeCloseTo(400 - 28.3465, 1);
  });

  it('only crops pages in the given page range', async () => {
    const file = await makeFile(3, 200, 400);
    const result = await cropPdf(
      file,
      { ...defaultCropPdfOptions, unit: 'percent', top: '50', pages: '1' },
      ctx
    );
    const doc = await PDFDocument.load(await result.arrayBuffer());
    const pages = doc.getPages();
    expect(pages[0].getCropBox().height).toBeCloseTo(200);
    expect(pages[1].getCropBox().height).toBeCloseTo(400);
  });

  it('also trims the MediaBox when requested', async () => {
    const file = await makeFile(1, 200, 400);
    const result = await cropPdf(
      file,
      {
        ...defaultCropPdfOptions,
        unit: 'percent',
        left: '10',
        trimMediaBox: 'true',
      },
      ctx
    );
    const doc = await PDFDocument.load(await result.arrayBuffer());
    const page = doc.getPages()[0];
    expect(page.getMediaBox().width).toBeCloseTo(180);
    expect(page.getCropBox().width).toBeCloseTo(180);
  });

  it('throws a plain error when margins leave no visible area', async () => {
    const file = await makeFile(1, 200, 400);
    await expect(
      cropPdf(
        file,
        { ...defaultCropPdfOptions, unit: 'percent', left: '60', right: '60' },
        ctx
      )
    ).rejects.toThrow('Margins are larger than the page');
  });

  it('rejects when cancelled', async () => {
    const file = await makeFile();
    const controller = new AbortController();
    controller.abort();
    await expect(
      cropPdf(file, defaultCropPdfOptions, {
        signal: controller.signal,
        progress: () => {},
      })
    ).rejects.toThrow('Cancelled');
  });
});

describe('cropPdfDetails', () => {
  it('reports page count and page 1 size in millimeters', async () => {
    // 595 x 842pt is A4 at 72dpi -> ~210 x 297mm
    const file = await makeFile(2, 595.28, 841.89);
    const details = await cropPdfDetails(file);
    expect(details.pageCount).toBe(2);
    expect(details.widthMm).toBeCloseTo(210, 0);
    expect(details.heightMm).toBeCloseTo(297, 0);
  });
});
