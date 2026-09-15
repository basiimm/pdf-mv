import { describe, it, expect } from 'vitest';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRef,
  PDFString,
} from 'pdf-lib';
import { inspectPdfLayers, updatePdfLayers } from './pdf-layers.js';

async function makeLayeredFile(): Promise<File> {
  const pdf = await PDFDocument.create();
  pdf.addPage([100, 100]);

  const layer1 = pdf.context.obj({
    Type: 'OCG',
    Name: PDFString.of('Layer One'),
  });
  const ref1 = pdf.context.register(layer1);
  const layer2 = pdf.context.obj({
    Type: 'OCG',
    Name: PDFString.of('Layer Two'),
  });
  const ref2 = pdf.context.register(layer2);

  const ocgs = pdf.context.obj([ref1, ref2]);
  const defaultConfig = pdf.context.obj({
    ON: pdf.context.obj([ref1]),
    OFF: pdf.context.obj([ref2]),
  });
  const ocProperties = pdf.context.obj({ OCGs: ocgs, D: defaultConfig });
  pdf.catalog.set(PDFName.of('OCProperties'), ocProperties);

  const bytes = await pdf.save();
  return new File([new Uint8Array(bytes)], 'layers.pdf', {
    type: 'application/pdf',
  });
}

async function makePlainFile(): Promise<File> {
  const pdf = await PDFDocument.create();
  pdf.addPage([100, 100]);
  const bytes = await pdf.save();
  return new File([new Uint8Array(bytes)], 'plain.pdf', {
    type: 'application/pdf',
  });
}

/** Reads back {name -> visible} from a saved PDF's OCProperties. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readLayerVisibility(pdfDoc: any): Map<string, boolean> {
  const ocp = pdfDoc.catalog.lookup(PDFName.of('OCProperties')) as PDFDict;
  const ocgs = ocp.lookup(PDFName.of('OCGs')) as PDFArray;
  const defaultConfig = ocp.lookup(PDFName.of('D')) as PDFDict;
  const off = defaultConfig.lookup(PDFName.of('OFF'));
  const offRefs = new Set(
    off instanceof PDFArray
      ? off
          .asArray()
          .filter((o): o is PDFRef => o instanceof PDFRef)
          .map((r) => r.toString())
      : []
  );
  const result = new Map<string, boolean>();
  for (const entry of ocgs.asArray()) {
    if (!(entry instanceof PDFRef)) continue;
    const dict = pdfDoc.context.lookup(entry) as PDFDict;
    const name = (dict.get(PDFName.of('Name')) as PDFString).decodeText();
    result.set(name, !offRefs.has(entry.toString()));
  }
  return result;
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('inspectPdfLayers', () => {
  it('lists layers with their default visibility', async () => {
    const file = await makeLayeredFile();
    const { fields, values, details } = await inspectPdfLayers(file);
    expect(fields).toHaveLength(2);
    const byLabel = new Map(fields.map((f) => [f.label, f]));
    expect(byLabel.get('Layer One')!.type).toBe('checkbox');
    expect(values[byLabel.get('Layer One')!.key]).toBe('true');
    expect(values[byLabel.get('Layer Two')!.key]).toBe('false');
    expect(details).toEqual([['Layers', '2 layers']]);
  });

  it('reports when there are no layers', async () => {
    const file = await makePlainFile();
    const result = await inspectPdfLayers(file);
    expect(result.fields).toEqual([]);
    expect(result.details).toEqual([['Layers', 'None found']]);
  });
});

describe('updatePdfLayers', () => {
  it('flips ON/OFF membership for the requested layers', async () => {
    const file = await makeLayeredFile();
    const { fields } = await inspectPdfLayers(file);
    const key = (label: string) => fields.find((f) => f.label === label)!.key;

    const result = await updatePdfLayers(
      file,
      { [key('Layer One')]: 'false', [key('Layer Two')]: 'true' },
      ctx
    );

    const doc = await PDFDocument.load(await result.arrayBuffer());
    const visibility = readLayerVisibility(doc);
    expect(visibility.get('Layer One')).toBe(false);
    expect(visibility.get('Layer Two')).toBe(true);
  });

  it('keeps a layer at its current visibility when not mentioned', async () => {
    const file = await makeLayeredFile();
    const result = await updatePdfLayers(file, {}, ctx);
    const doc = await PDFDocument.load(await result.arrayBuffer());
    const visibility = readLayerVisibility(doc);
    expect(visibility.get('Layer One')).toBe(true);
    expect(visibility.get('Layer Two')).toBe(false);
  });

  it('throws a plain error when the document has no layers', async () => {
    const file = await makePlainFile();
    await expect(updatePdfLayers(file, {}, ctx)).rejects.toThrow('no layers');
  });

  it('rejects when cancelled', async () => {
    const file = await makeLayeredFile();
    const controller = new AbortController();
    controller.abort();
    await expect(
      updatePdfLayers(
        file,
        {},
        {
          signal: controller.signal,
          progress: () => {},
        }
      )
    ).rejects.toThrow('Cancelled');
  });
});
