import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { flattenPdf, defaultFlattenPdfOptions } from './flatten-pdf.js';

async function makeFileWithForm(): Promise<File> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 400]);
  const form = pdf.getForm();
  const field = form.createTextField('name');
  field.addToPage(page, { x: 50, y: 50, width: 100, height: 20 });
  const bytes = await pdf.save();
  return new File([new Uint8Array(bytes)], 'form.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('flattenPdf engine', () => {
  it('flattens form fields so the form has none left', async () => {
    const file = await makeFileWithForm();
    const result = await flattenPdf(file, defaultFlattenPdfOptions, ctx);
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getForm().getFields().length).toBe(0);
  });

  it('names the output with a -flattened suffix', async () => {
    const file = await makeFileWithForm();
    const result = await flattenPdf(file, defaultFlattenPdfOptions, ctx);
    expect(result.name).toBe('form-flattened.pdf');
  });

  it('does not throw when the document has no form', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([100, 100]);
    const bytes = await pdf.save();
    const file = new File([new Uint8Array(bytes)], 'plain.pdf', {
      type: 'application/pdf',
    });
    await expect(
      flattenPdf(file, defaultFlattenPdfOptions, ctx)
    ).resolves.toBeInstanceOf(File);
  });

  it('rejects when cancelled', async () => {
    const file = await makeFileWithForm();
    const controller = new AbortController();
    controller.abort();
    await expect(
      flattenPdf(file, defaultFlattenPdfOptions, {
        signal: controller.signal,
        progress: () => {},
      })
    ).rejects.toThrow('Cancelled');
  });
});
