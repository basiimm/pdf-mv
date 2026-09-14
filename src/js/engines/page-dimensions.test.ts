import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  analyzePageDimensions,
  standardSizeName,
  convertUnit,
  groupPageSizes,
  pageDimensionsCsv,
  exportPageDimensionsCsv,
} from './page-dimensions.js';

async function makeFile(): Promise<File> {
  const pdf = await PDFDocument.create();
  pdf.addPage([595.28, 841.89]); // A4 portrait
  pdf.addPage([595.28, 841.89]); // A4 portrait
  pdf.addPage([300, 300]); // custom, square
  const bytes = await pdf.save();
  return new File([new Uint8Array(bytes)], 'doc.pdf', {
    type: 'application/pdf',
  });
}

describe('standardSizeName', () => {
  it('recognizes A4 in either orientation', () => {
    expect(standardSizeName(595.28, 841.89)).toBe('A4');
    expect(standardSizeName(841.89, 595.28)).toBe('A4');
  });
  it('falls back to Custom', () => {
    expect(standardSizeName(300, 300)).toBe('Custom');
  });
});

describe('convertUnit', () => {
  it('converts points to mm and inches', () => {
    expect(convertUnit(72, 'in')).toBeCloseTo(1, 5);
    expect(convertUnit(72, 'mm')).toBeCloseTo(25.4, 1);
    expect(convertUnit(72, 'pt')).toBe(72);
  });
});

describe('analyzePageDimensions + groupPageSizes', () => {
  it('groups consecutive identical pages and separates the differing one', async () => {
    const file = await makeFile();
    const pages = await analyzePageDimensions(file);
    expect(pages).toHaveLength(3);
    const groups = groupPageSizes(pages);
    expect(groups).toHaveLength(2);
    expect(groups[0].range).toBe('Pages 1–2');
    expect(groups[1].range).toBe('Page 3');
  });
});

describe('pageDimensionsCsv', () => {
  it('emits a header row and one row per page', async () => {
    const file = await makeFile();
    const pages = await analyzePageDimensions(file);
    const csv = pageDimensionsCsv(pages, 'pt');
    const lines = csv.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('Width (pt)');
  });
});

describe('exportPageDimensionsCsv', () => {
  it('produces a downloadable CSV file', async () => {
    const file = await makeFile();
    const result = await exportPageDimensionsCsv(
      file,
      { unit: 'mm' },
      { signal: new AbortController().signal, progress: () => {} }
    );
    expect(result.name).toBe('doc-page-sizes.csv');
    expect(result.type).toContain('text/csv');
  });

  it('rejects when cancelled', async () => {
    const file = await makeFile();
    const controller = new AbortController();
    controller.abort();
    await expect(
      exportPageDimensionsCsv(
        file,
        {},
        { signal: controller.signal, progress: () => {} }
      )
    ).rejects.toThrow('Cancelled');
  });
});
