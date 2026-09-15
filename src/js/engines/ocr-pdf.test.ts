import { describe, it, expect, vi } from 'vitest';

type OnProgress = (status: string, value: number) => void;

let performOcrImpl: (
  bytes: Uint8Array,
  options: { onProgress?: OnProgress }
) => Promise<{
  pdfBytes: Uint8Array;
  fullText: string;
  warnings: unknown[];
}>;

vi.mock('../utils/ocr.js', () => ({
  performOcr: (...args: Parameters<typeof performOcrImpl>) =>
    performOcrImpl(...args),
}));

const { ocrPdf, defaultOcrPdfOptions } = await import('./ocr-pdf.js');
const { UnsupportedOcrLanguageError } =
  await import('../utils/tesseract-language-availability.js');

function makeFile(): File {
  return new File([new Uint8Array([1, 2, 3])], 'scan.pdf', {
    type: 'application/pdf',
  });
}

const baseCtx = () => ({
  signal: new AbortController().signal,
  progress: vi.fn(),
});

describe('ocrPdf engine', () => {
  it('throws a clear error when no language is chosen', async () => {
    const ctx = baseCtx();
    await expect(ocrPdf(makeFile(), { languages: [] }, ctx)).rejects.toThrow(
      'language'
    );
  });

  it('rejects immediately when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      ocrPdf(
        makeFile(),
        { languages: ['eng'] },
        { signal: controller.signal, progress: vi.fn() }
      )
    ).rejects.toThrow('Cancelled');
  });

  it('reports a loading phase then per-page recognition progress', async () => {
    performOcrImpl = async (_bytes, options) => {
      options.onProgress?.('loading language traineddata', 0.4);
      options.onProgress?.('Processing page 1 of 2', 0);
      options.onProgress?.('recognizing text', 0.5);
      options.onProgress?.('Processing page 2 of 2', 0);
      options.onProgress?.('recognizing text', 1);
      return {
        pdfBytes: new Uint8Array([9, 9, 9]),
        fullText: 'hello',
        warnings: [],
      };
    };

    const ctx = baseCtx();
    const result = await ocrPdf(makeFile(), { languages: ['eng'] }, ctx);

    expect(result.name).toBe('scan-ocr.pdf');
    expect(result.type).toBe('application/pdf');

    const labels = ctx.progress.mock.calls.map(([update]) => update.label);
    expect(labels).toContain('Loading language data…');
    expect(labels).toContain('Recognizing page 1 of 2');
    expect(labels).toContain('Recognizing page 2 of 2');
  });

  it('joins multiple languages with + for the underlying OCR call', async () => {
    const seen: string[] = [];
    performOcrImpl = async (_bytes, options) => {
      seen.push((options as unknown as { language: string }).language);
      return { pdfBytes: new Uint8Array([1]), fullText: '', warnings: [] };
    };
    await ocrPdf(makeFile(), { languages: ['eng', 'fra'] }, baseCtx());
    expect(seen).toEqual(['eng+fra']);
  });

  it('falls back to documented defaults when options are omitted', async () => {
    const seen: Record<string, unknown>[] = [];
    performOcrImpl = async (_bytes, options) => {
      seen.push(options as unknown as Record<string, unknown>);
      return { pdfBytes: new Uint8Array([1]), fullText: '', warnings: [] };
    };
    await ocrPdf(makeFile(), { languages: ['eng'] }, baseCtx());
    expect(seen[0].resolution).toBe(defaultOcrPdfOptions.resolution);
    expect(seen[0].binarize).toBe(defaultOcrPdfOptions.binarize);
    expect(seen[0].embedFullFonts).toBe(defaultOcrPdfOptions.embedFullFonts);
  });

  it('surfaces unsupported-language errors verbatim', async () => {
    performOcrImpl = async () => {
      throw new UnsupportedOcrLanguageError(['xyz'], ['eng']);
    };
    await expect(
      ocrPdf(makeFile(), { languages: ['xyz'] }, baseCtx())
    ).rejects.toThrow(/OCR data for/);
  });

  it('wraps unexpected engine failures in a plain-language message', async () => {
    performOcrImpl = async () => {
      throw new Error('boom');
    };
    await expect(
      ocrPdf(makeFile(), { languages: ['eng'] }, baseCtx())
    ).rejects.toThrow('Text recognition failed: boom');
  });
});
