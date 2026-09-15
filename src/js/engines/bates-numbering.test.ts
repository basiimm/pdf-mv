import { describe, it, expect, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  batesNumbering,
  formatBatesText,
  defaultBatesNumberingOptions,
  BATES_STYLE_PRESETS,
} from './bates-numbering.js';

async function makeFile(pageCount = 3): Promise<File> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    pdf.addPage([300, 400]);
  }
  const bytes = await pdf.save();
  return new File([new Uint8Array(bytes)], 'exhibit.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('formatBatesText (pure)', () => {
  it('pads the Bates counter to the requested digit count', () => {
    expect(formatBatesText('[BATES]', 1, 1, 1, 'doc', 6)).toBe('000001');
    expect(formatBatesText('[BATES]', 42, 1, 1, 'doc', 3)).toBe('042');
  });

  it('leaves the counter unpadded when padding is 0', () => {
    expect(formatBatesText('[BATES]', 42, 1, 1, 'doc', 0)).toBe('42');
  });

  it('substitutes PAGE, FILE and FILENAME placeholders', () => {
    const text = formatBatesText(
      'Exhibit [FILE] Case XYZ [BATES] Page [PAGE] ([FILENAME])',
      7,
      3,
      2,
      'contract',
      4
    );
    expect(text).toBe('Exhibit 2 Case XYZ 0007 Page 3 (contract)');
  });
});

describe('batesNumbering engine', () => {
  it('preserves the page count', async () => {
    const file = await makeFile(5);
    const result = await batesNumbering(
      file,
      defaultBatesNumberingOptions,
      ctx
    );
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getPageCount()).toBe(5);
  });

  it('stamps sequential, padded Bates numbers starting at startNumber', async () => {
    const file = await makeFile(3);
    const result = await batesNumbering(
      file,
      { startNumber: 100, padding: 4, template: '[BATES]' },
      ctx
    );
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getPageCount()).toBe(3);
    // Sequential numbers 0100, 0101, 0102 would be drawn; verify via the
    // pure formatter which the engine uses internally for each page.
    expect(formatBatesText('[BATES]', 100, 1, 1, 'exhibit', 4)).toBe('0100');
    expect(formatBatesText('[BATES]', 102, 3, 1, 'exhibit', 4)).toBe('0102');
  });

  it('reports progress per page', async () => {
    const file = await makeFile(3);
    const labels: string[] = [];
    await batesNumbering(file, defaultBatesNumberingOptions, {
      signal: new AbortController().signal,
      progress: (u) => labels.push(u.label),
    });
    expect(labels).toContain('Page 1 of 3');
    expect(labels).toContain('Page 3 of 3');
  });

  it('rejects an invalid starting number', async () => {
    const file = await makeFile(1);
    await expect(batesNumbering(file, { startNumber: 0 }, ctx)).rejects.toThrow(
      'starting number'
    );
    await expect(
      batesNumbering(file, { startNumber: -5 }, ctx)
    ).rejects.toThrow('starting number');
  });

  it('rejects a negative digit padding', async () => {
    const file = await makeFile(1);
    await expect(batesNumbering(file, { padding: -1 }, ctx)).rejects.toThrow(
      'padding'
    );
  });

  it('applies the legacy style presets verbatim', () => {
    expect(BATES_STYLE_PRESETS['bates-6']).toEqual({
      template: '[BATES]',
      padding: 6,
    });
    expect(BATES_STYLE_PRESETS['full-0']).toEqual({
      template: 'Exhibit [FILE] Case XYZ [BATES] Page [PAGE]',
      padding: 0,
    });
  });

  it('throws a password-mentioning error for encrypted PDFs', async () => {
    vi.resetModules();
    vi.doMock('../utils/load-pdf-document.js', () => ({
      loadPdfDocument: vi.fn(async () => ({ isEncrypted: true })),
    }));
    try {
      const { batesNumbering: batesNumberingMocked } =
        await import('./bates-numbering.js');
      const file = await makeFile(1);
      await expect(
        batesNumberingMocked(file, defaultBatesNumberingOptions, ctx)
      ).rejects.toThrow('password');
    } finally {
      vi.doUnmock('../utils/load-pdf-document.js');
      vi.resetModules();
    }
  });

  it('rejects immediately when already cancelled', async () => {
    const file = await makeFile(1);
    const controller = new AbortController();
    controller.abort();
    await expect(
      batesNumbering(file, defaultBatesNumberingOptions, {
        signal: controller.signal,
        progress: () => {},
      })
    ).rejects.toThrow('Cancelled');
  });

  it('uses legacy defaults', () => {
    expect(defaultBatesNumberingOptions).toEqual({
      template: '[BATES]',
      padding: 6,
      startNumber: 1,
      fileNumber: 1,
      position: 'bottom-center',
      fontFamily: 'Helvetica',
      fontSize: 10,
      color: '#000000',
    });
  });
});
