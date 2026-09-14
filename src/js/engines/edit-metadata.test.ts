import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { editMetadata, defaultEditMetadataOptions } from './edit-metadata.js';

async function makeFile(): Promise<File> {
  const pdf = await PDFDocument.create();
  pdf.addPage([100, 100]);
  pdf.setTitle('Original title');
  pdf.setAuthor('Original author');
  const bytes = await pdf.save();
  return new File([new Uint8Array(bytes)], 'doc.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('editMetadata engine', () => {
  it('sets fields that are provided', async () => {
    const file = await makeFile();
    const result = await editMetadata(
      file,
      { ...defaultEditMetadataOptions, title: 'New title' },
      ctx
    );
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getTitle()).toBe('New title');
  });

  it('keeps the current value when a field is left blank', async () => {
    const file = await makeFile();
    const result = await editMetadata(file, defaultEditMetadataOptions, ctx);
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getTitle()).toBe('Original title');
    expect(doc.getAuthor()).toBe('Original author');
  });

  it('splits comma-separated keywords', async () => {
    const file = await makeFile();
    const result = await editMetadata(
      file,
      { ...defaultEditMetadataOptions, keywords: 'a, b ,c' },
      ctx
    );
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getKeywords()).toBe('a b c');
  });

  it('rejects when cancelled', async () => {
    const file = await makeFile();
    const controller = new AbortController();
    controller.abort();
    await expect(
      editMetadata(file, defaultEditMetadataOptions, {
        signal: controller.signal,
        progress: () => {},
      })
    ).rejects.toThrow('Cancelled');
  });
});
