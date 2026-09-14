import { describe, it, expect } from 'vitest';
import {
  PDFDocument,
  degrees,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
} from 'pdf-lib';
import {
  applyPageMarks,
  selectedPages,
  type PageMarks,
} from './workspace-page-marks';
const options: PageMarks = {
  kind: 'header-footer',
  text: 'DRAFT',
  header: 'Report',
  footer: 'Page {page} of {total}',
  size: 10,
  opacity: 25,
  angle: 45,
  color: '#555555',
  pages: '2',
  align: 'center',
};
function content(pdf: PDFDocument, index: number) {
  const value = pdf.getPage(index).node.Contents();
  const refs = value instanceof PDFArray ? value.asArray() : [value];
  return refs
    .map((ref) => {
      const stream = pdf.context.lookup(ref) as PDFRawStream;
      return new TextDecoder().decode(decodePDFRawStream(stream).decode());
    })
    .join('\n');
}
async function fixture() {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 500]).drawText('Original one');
  const second = pdf.addPage([400, 600]);
  second.setRotation(degrees(90));
  second.setCropBox(10, 20, 350, 550);
  second.drawText('Original two');
  return (await pdf.save()).buffer as ArrayBuffer;
}
describe('native page marks', () => {
  it('preserves original pages and marks only selected pages with actual page numbers', async () => {
    const source = await fixture();
    const original = await PDFDocument.load(source);
    const pdf = await PDFDocument.load(await applyPageMarks(source, options));
    expect(pdf.getPageCount()).toBe(2);
    expect(content(pdf, 0)).toBe(content(original, 0));
    expect(content(pdf, 1)).toContain('506167652032206F662032'); // Page 2 of 2
    expect(content(pdf, 1)).toContain('5265706F7274'); // Report
    expect(pdf.getPage(1).getRotation().angle).toBe(90);
    expect(pdf.getPage(1).getCropBox()).toEqual(
      original.getPage(1).getCropBox()
    );
    expect(content(pdf, 1)).toContain('0 1 -1 0 360 20 cm');
  });
  it('adds text watermark to every page without changing page count', async () => {
    const pdf = await PDFDocument.load(
      await applyPageMarks(await fixture(), {
        ...options,
        kind: 'add-watermark',
        pages: '',
      })
    );
    expect(pdf.getPageCount()).toBe(2);
    for (let i = 0; i < 2; i++) expect(content(pdf, i)).toContain('4452414654');
  });
  it('rejects invalid ranges and unsupported text rather than silently skipping it', async () => {
    expect(() => selectedPages('0, 3-1', 3)).toThrow();
    expect(() => selectedPages('1-4', 3)).toThrow();
    expect([...selectedPages('1, 2-3, 2', 3)]).toEqual([1, 2, 3]);
    await expect(
      applyPageMarks(await fixture(), { ...options, header: '你好' })
    ).rejects.toThrow('does not support');
  });
});
