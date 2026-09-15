// Pure engine for the Remove Blank Pages tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/remove-blank-pages-page.ts. No DOM queries,
// showAlert/showLoader; rendering pages to a canvas (via pdf.js) is the only
// way to detect blank pages, matching the legacy implementation.
import { PDFDocument } from 'pdf-lib';
import { loadPdfDocument } from '../utils/load-pdf-document.js';
import '../utils/setup-pdf-worker.js';

export interface RemoveBlankPagesOptions {
  /** 0-100; higher removes more pages ("nearly blank" too). */
  sensitivity?: number;
  treatNearlyBlank?: boolean;
}

export const defaultRemoveBlankPagesOptions: RemoveBlankPagesOptions = {
  sensitivity: 80,
  treatNearlyBlank: false,
};

export function sensitivityToThreshold(
  sensitivity: number,
  treatNearlyBlank: boolean
): number {
  const base = 5 - (sensitivity / 100) * 4.9;
  return treatNearlyBlank ? base * 2 : base;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isPageBlank(
  page: any,
  maxNonWhitePercent: number
): Promise<boolean> {
  const viewport = page.getViewport({ scale: 0.5 });
  const canvas = document.createElement('canvas');
  const canvasContext = canvas.getContext('2d');
  if (!canvasContext) return false;
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvas, canvasContext, viewport }).promise;

  const { data } = canvasContext.getImageData(
    0,
    0,
    canvas.width,
    canvas.height
  );
  const totalPixels = data.length / 4;
  let nonWhitePixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (brightness < 240) nonWhitePixels++;
  }
  return (nonWhitePixels / totalPixels) * 100 <= maxNonWhitePercent;
}

/** Returns 0-based indices of pages detected as blank. */
export async function detectBlankPages(
  file: File,
  options: RemoveBlankPagesOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<number[]> {
  const pdfjsLib = await import('pdfjs-dist');
  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const threshold = sensitivityToThreshold(
    options.sensitivity ?? 80,
    options.treatNearlyBlank === true
  );
  const blanks: number[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      if (ctx.signal.aborted) throw new Error('Cancelled');
      ctx.progress({
        label: 'Scanning pages…',
        value: i / doc.numPages,
        detail: `Page ${i} of ${doc.numPages}`,
      });
      const page = await doc.getPage(i);
      if (await isPageBlank(page, threshold)) blanks.push(i - 1);
    }
  } finally {
    await doc.destroy();
  }
  return blanks;
}

export async function removeBlankPages(
  file: File,
  options: RemoveBlankPagesOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');
  ctx.progress({ label: 'Detecting blank pages…' });
  const blanks = await detectBlankPages(file, options, ctx);
  if (blanks.length === 0) {
    throw new Error('No blank pages were detected in this document.');
  }

  ctx.progress({ label: 'Removing blank pages…', value: 0.9 });
  const bytes = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(bytes);
  const newDoc = await PDFDocument.create();
  const keep = pdfDoc
    .getPages()
    .map((_, i) => i)
    .filter((i) => !blanks.includes(i));
  const copied = await newDoc.copyPages(pdfDoc, keep);
  copied.forEach((page) => newDoc.addPage(page));

  const outBytes = await newDoc.save();
  return new File([new Uint8Array(outBytes)], file.name, {
    type: 'application/pdf',
  });
}
