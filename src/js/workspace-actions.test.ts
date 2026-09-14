import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import { modifyPages } from './workspace-actions';
async function source() {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Private title');
  for (const width of [200, 300, 400]) pdf.addPage([width, 500]);
  return (await pdf.save()).buffer as ArrayBuffer;
}
describe('native document actions', () => {
  it('rotates only selected pages, preserving page sizes and document metadata', async () => {
    const pdf = await PDFDocument.load(
      await modifyPages(await source(), 'rotate-pdf', {
        pages: '2',
        angle: '90',
      })
    );
    expect(pdf.getPages().map((p) => p.getRotation().angle)).toEqual([
      0, 90, 0,
    ]);
    expect(pdf.getPages().map((p) => p.getWidth())).toEqual([200, 300, 400]);
    expect(pdf.getTitle()).toBe('Private title');
  });
  it('extracts specified pages in requested order and rejects deleting every page', async () => {
    const pdf = await PDFDocument.load(
      await modifyPages(await source(), 'extract-pages', { pages: '3, 1' })
    );
    expect(pdf.getPages().map((p) => p.getWidth())).toEqual([400, 200]);
    await expect(
      modifyPages(await source(), 'delete-pages', { pages: '' })
    ).rejects.toThrow('Keep at least one');
  });
  it('reverses, removes and inserts pages at correct positions', async () => {
    const reversed = await PDFDocument.load(
      await modifyPages(await source(), 'reverse-pages', {})
    );
    expect(reversed.getPages().map((p) => p.getWidth())).toEqual([
      400, 300, 200,
    ]);
    const deleted = await PDFDocument.load(
      await modifyPages(await source(), 'delete-pages', { pages: '2' })
    );
    expect(deleted.getPages().map((p) => p.getWidth())).toEqual([200, 400]);
    const added = await PDFDocument.load(
      await modifyPages(await source(), 'add-blank-page', { after: '2' })
    );
    expect(added.getPages().map((p) => p.getWidth())).toEqual([
      200, 300, 300, 400,
    ]);
  });
  it('removes document metadata and annotations without deleting form widgets', async () => {
    const pdf = await PDFDocument.load(await source());
    pdf.getPage(0).node.set(
      PDFName.of('Annots'),
      pdf.context.obj([
        { Type: 'Annot', Subtype: 'Text' },
        { Type: 'Annot', Subtype: 'Widget' },
      ])
    );
    const cleaned = await PDFDocument.load(
      await modifyPages(
        (await pdf.save()).buffer as ArrayBuffer,
        'remove-annotations',
        { pages: '1' }
      )
    );
    const annotations = cleaned.getPage(0).node.Annots()!;
    expect(annotations.size()).toBe(1);
    expect(
      String(
        (cleaned.context.lookup(annotations.get(0)) as PDFDict).get(
          PDFName.of('Subtype')
        )
      )
    ).toBe('/Widget');
    const metadata = await PDFDocument.load(
      await modifyPages(await source(), 'remove-metadata', {}),
      { updateMetadata: false }
    );
    expect(metadata.context.trailerInfo.Info).toBeUndefined();
    expect(metadata.getTitle()).toBeUndefined();
  });
});
