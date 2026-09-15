import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import {
  editMetadata,
  defaultEditMetadataOptions,
  readEditableMetadata,
  parseCustomFields,
} from './edit-metadata.js';

async function makeFile(): Promise<File> {
  const pdf = await PDFDocument.create();
  pdf.addPage([100, 100]);
  pdf.setTitle('Original title');
  pdf.setAuthor('Original author');
  // @ts-expect-error private API
  const infoDict = pdf.getInfoDict();
  infoDict.set(PDFName.of('Department'), PDFString.of('Marketing'));
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

  it('clears a field left blank, since fields are prefilled from the document', async () => {
    const file = await makeFile();
    const result = await editMetadata(file, defaultEditMetadataOptions, ctx);
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getTitle()).toBe('');
    expect(doc.getAuthor()).toBe('');
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

  it('replaces custom fields with the parsed key/value lines', async () => {
    const file = await makeFile();
    const result = await editMetadata(
      file,
      {
        ...defaultEditMetadataOptions,
        customFields: 'Department: Sales; Cost center: 42',
      },
      ctx
    );
    const doc = await PDFDocument.load(await result.arrayBuffer());
    // @ts-expect-error private API
    const infoDict = doc.getInfoDict();
    expect(infoDict.lookup(PDFName.of('Department')).decodeText()).toBe(
      'Sales'
    );
    expect(infoDict.lookup(PDFName.of('Cost center')).decodeText()).toBe('42');
  });
});

describe('readEditableMetadata', () => {
  it('prefills standard and custom fields from the document', async () => {
    const file = await makeFile();
    const { values } = await readEditableMetadata(file);
    expect(values.title).toBe('Original title');
    expect(values.author).toBe('Original author');
    expect(values.customFields).toBe('Department: Marketing');
  });
});

describe('parseCustomFields', () => {
  it('parses newline and semicolon separated "Key: value" entries', () => {
    expect(parseCustomFields('A: 1\nB: 2; C: 3')).toEqual([
      ['A', '1'],
      ['B', '2'],
      ['C', '3'],
    ]);
  });

  it('ignores blank lines and entries without a key', () => {
    expect(parseCustomFields('  ; A: 1 ;; : nokey')).toEqual([['A', '1']]);
  });
});
