import { describe, it, expect, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';

// getPDFDocument wraps pdfjs-dist, which needs a real worker/wasm runtime that
// jsdom cannot provide. The password pre-check is exercised indirectly through
// the "cancelled" test path (it short-circuits before reaching it); here we
// stub it so the rest of the engine's pure logic can run in jsdom.
vi.mock('../utils/helpers.js', async () => {
  const actual = await vi.importActual<typeof import('../utils/helpers.js')>(
    '../utils/helpers.js'
  );
  return {
    ...actual,
    getPDFDocument: vi.fn(() => ({
      promise: Promise.resolve({ destroy: () => {} }),
    })),
  };
});

const { sanitizePdf, defaultSanitizePdfOptions } =
  await import('./sanitize-pdf.js');

async function makeFile(): Promise<File> {
  const pdf = await PDFDocument.create();
  pdf.addPage([100, 100]);
  pdf.setTitle('Secret title');
  pdf.setAuthor('Someone');
  const bytes = await pdf.save();
  return new File([new Uint8Array(bytes)], 'doc.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('sanitizePdf engine', () => {
  it('removes metadata when requested', async () => {
    const file = await makeFile();
    const result = await sanitizePdf(
      file,
      {
        ...defaultSanitizePdfOptions,
        removeMetadata: true,
        flattenForms: false,
        removeAnnotations: false,
        removeJavascript: false,
        removeEmbeddedFiles: false,
        removeLayers: false,
        removeLinks: false,
        removeStructureTree: false,
        removeMarkInfo: false,
      },
      ctx
    );
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getTitle()).toBe('');
  });

  it('names the output with a -sanitized suffix', async () => {
    const file = await makeFile();
    const result = await sanitizePdf(file, defaultSanitizePdfOptions, ctx);
    expect(result.name).toBe('doc-sanitized.pdf');
  });

  it('throws when no option is selected', async () => {
    const file = await makeFile();
    const allOff = Object.fromEntries(
      Object.keys(defaultSanitizePdfOptions).map((k) => [k, false])
    ) as unknown as typeof defaultSanitizePdfOptions;
    await expect(sanitizePdf(file, allOff, ctx)).rejects.toThrow(
      'Select at least one item'
    );
  });

  it('rejects when cancelled', async () => {
    const file = await makeFile();
    const controller = new AbortController();
    controller.abort();
    await expect(
      sanitizePdf(file, defaultSanitizePdfOptions, {
        signal: controller.signal,
        progress: () => {},
      })
    ).rejects.toThrow('Cancelled');
  });
});
