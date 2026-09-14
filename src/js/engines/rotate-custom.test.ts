import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { rotateCustom } from './rotate-custom.js';

async function makeFile(pageCount: number): Promise<File> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = pdf.addPage([200, 100]);
    // A page with no content stream can't be embedded (needed for non-90°
    // rotations), so give it one.
    page.drawText(' ');
  }
  const bytes = await pdf.save();
  return new File([new Uint8Array(bytes)], 'doc.pdf', {
    type: 'application/pdf',
  });
}

describe('rotateCustom engine', () => {
  it('rotates all pages by a multiple of 90 using setRotation, keeping page count', async () => {
    const file = await makeFile(3);
    const result = await rotateCustom(
      file,
      { angle: '90', pages: '' },
      { signal: new AbortController().signal, progress: () => {} }
    );
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPage(0).getRotation().angle).toBe(90);
  });

  it('leaves pages outside the range untouched', async () => {
    const file = await makeFile(3);
    const result = await rotateCustom(
      file,
      { angle: '90', pages: '1' },
      { signal: new AbortController().signal, progress: () => {} }
    );
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getPage(0).getRotation().angle).toBe(90);
    expect(doc.getPage(1).getRotation().angle).toBe(0);
  });

  it('rejects an angle of 0', async () => {
    const file = await makeFile(1);
    await expect(
      rotateCustom(
        file,
        { angle: '0' },
        { signal: new AbortController().signal, progress: () => {} }
      )
    ).rejects.toThrow('rotation angle');
  });

  it('handles non-90-multiple angles by growing the page bounds', async () => {
    const file = await makeFile(1);
    const result = await rotateCustom(
      file,
      { angle: '45', pages: '' },
      { signal: new AbortController().signal, progress: () => {} }
    );
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeGreaterThan(200);
    expect(height).toBeGreaterThan(100);
  });

  it('rejects when cancelled', async () => {
    const file = await makeFile(1);
    const controller = new AbortController();
    controller.abort();
    await expect(
      rotateCustom(
        file,
        { angle: '90' },
        { signal: controller.signal, progress: () => {} }
      )
    ).rejects.toThrow('Cancelled');
  });
});
