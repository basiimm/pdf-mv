import { describe, it, expect } from 'vitest';
import {
  PDFDocument,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
} from 'pdf-lib';
import {
  backgroundColor,
  defaultBackgroundColorOptions,
} from './background-color.js';

/** Decode a page's content stream(s) to a plain string of PDF operators. */
function pageContentOperators(page: import('pdf-lib').PDFPage): string {
  const contentsRef = page.node.Contents();
  if (!contentsRef) return '';
  const refs =
    contentsRef instanceof PDFArray ? contentsRef.asArray() : [contentsRef];
  return refs
    .map((ref) => {
      const stream = page.doc.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) return '';
      return new TextDecoder().decode(decodePDFRawStream(stream).decode());
    })
    .join('\n');
}

async function makeFile(pageCount = 2): Promise<File> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = pdf.addPage([200, 300]);
    // embedPage requires a non-empty Contents stream, so draw something trivial.
    page.drawRectangle({ x: 10, y: 10, width: 20, height: 20 });
  }
  const bytes = await pdf.save();
  return new File([new Uint8Array(bytes)], 'doc.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('backgroundColor engine', () => {
  it('defaults to white', () => {
    expect(defaultBackgroundColorOptions).toEqual({ color: '#ffffff' });
  });

  it('produces a valid PDF with the same page count and size', async () => {
    const file = await makeFile(3);
    const result = await backgroundColor(file, {}, ctx);
    expect(result).toBeInstanceOf(File);
    expect(result.name).toBe('doc.pdf');
    const outDoc = await PDFDocument.load(await result.arrayBuffer());
    expect(outDoc.getPageCount()).toBe(3);
    const page = outDoc.getPage(0);
    expect(page.getSize()).toEqual({ width: 200, height: 300 });
  });

  it('draws a filled rectangle behind the page content (fill color operator present)', async () => {
    const file = await makeFile(1);
    const result = await backgroundColor(file, { color: '#ff0000' }, ctx);
    const outDoc = await PDFDocument.load(await result.arrayBuffer());
    const operators = pageContentOperators(outDoc.getPage(0));
    // pdf-lib emits "1 0 0 rg" (set fill color to red) before the
    // rectangle's path-and-fill operators for drawRectangle({ color }).
    expect(operators).toMatch(/1 0 0 rg/);
    expect(operators).toMatch(/\bf\b/);
    // The embedded original page content is drawn after (on top of) the
    // background fill, via an XObject "Do" operator.
    expect(operators).toMatch(/Do/);
  });

  it('reports progress per page and checks for cancellation', async () => {
    const file = await makeFile(2);
    const labels: string[] = [];
    await backgroundColor(
      file,
      {},
      {
        signal: new AbortController().signal,
        progress: (p) => labels.push(p.label),
      }
    );
    expect(labels).toEqual(
      expect.arrayContaining(['Page 1 of 2', 'Page 2 of 2'])
    );
  });

  it('throws a Cancelled error when aborted before starting', async () => {
    const file = await makeFile(1);
    const controller = new AbortController();
    controller.abort();
    await expect(
      backgroundColor(
        file,
        {},
        { signal: controller.signal, progress: () => {} }
      )
    ).rejects.toThrow('Cancelled');
  });

  it('throws a password-specific error for encrypted PDFs', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([100, 100]);
    const bytes = await pdf.save({ useObjectStreams: false });
    // Simulate pdf-lib's encrypted-document error without a real encrypted
    // file (pdf-lib has no built-in encryption support to produce one).
    const file = new File([new Uint8Array(bytes)], 'doc.pdf', {
      type: 'application/pdf',
    });
    const originalLoad = PDFDocument.load;
    PDFDocument.load = (async () => {
      throw new Error('Input document to `PDFDocument.load` is encrypted');
    }) as typeof PDFDocument.load;
    try {
      await expect(backgroundColor(file, {}, ctx)).rejects.toThrow(/password/i);
    } finally {
      PDFDocument.load = originalLoad;
    }
  });
});
