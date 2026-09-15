// Pure engine for the Divide Pages tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/divide-pages-page.ts. No DOM, no showAlert/showLoader.
import { PDFDocument } from 'pdf-lib';
import { loadPdfDocument } from '../utils/load-pdf-document.js';
import { parsePageRanges } from '../utils/helpers.js';

export type DivideDirection = 'vertical' | 'horizontal';

export interface DividePagesOptions {
  direction?: DivideDirection;
  /** Page range to split; blank = all pages. */
  pages?: string;
}

export const defaultDividePagesOptions: DividePagesOptions = {
  direction: 'vertical',
  pages: '',
};

export async function dividePages(
  file: File,
  options: DividePagesOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  ctx.progress({ label: 'Splitting pages…' });
  const bytes = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(bytes);
  const totalPages = pdfDoc.getPageCount();
  const targets = new Set(parsePageRanges(options.pages || '', totalPages));
  const direction =
    options.direction === 'horizontal' ? 'horizontal' : 'vertical';

  const newDoc = await PDFDocument.create();
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    if (ctx.signal.aborted) throw new Error('Cancelled');
    ctx.progress({ label: 'Splitting pages…', value: (i + 1) / pages.length });
    const { width, height } = pages[i].getSize();

    if (targets.has(i)) {
      const [a] = await newDoc.copyPages(pdfDoc, [i]);
      const [b] = await newDoc.copyPages(pdfDoc, [i]);
      if (direction === 'vertical') {
        a.setCropBox(0, 0, width / 2, height);
        b.setCropBox(width / 2, 0, width / 2, height);
      } else {
        a.setCropBox(0, height / 2, width, height / 2);
        b.setCropBox(0, 0, width, height / 2);
      }
      newDoc.addPage(a);
      newDoc.addPage(b);
    } else {
      const [copied] = await newDoc.copyPages(pdfDoc, [i]);
      newDoc.addPage(copied);
    }
  }

  const outBytes = await newDoc.save();
  return new File([new Uint8Array(outBytes)], file.name, {
    type: 'application/pdf',
  });
}
