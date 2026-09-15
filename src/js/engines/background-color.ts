// Pure engine for the background-color tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/background-color-page.ts. No DOM queries, no showAlert/showLoader.
// Vector-only (pdf-lib): each page is copied, embedded, and drawn on top of a
// solid rectangle, so this does not rasterize and stays fast at any page count.
import { PDFDocument, rgb } from 'pdf-lib';
import { hexToRgb } from '../utils/helpers.js';

export interface BackgroundColorOptions {
  /** Hex color, e.g. "#ffffff". Legacy default: white. */
  color?: string;
}

export const defaultBackgroundColorOptions: BackgroundColorOptions = {
  color: '#ffffff',
};

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

function rethrowIfPassword(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/encrypted/i.test(message)) {
    throw new Error(
      'This PDF is password protected. Remove the password and try again.'
    );
  }
  throw error instanceof Error ? error : new Error(message);
}

export async function backgroundColor(
  file: File,
  options: BackgroundColorOptions,
  ctx: EngineContext
): Promise<File> {
  const color = hexToRgb(options.color || defaultBackgroundColorOptions.color!);
  if (ctx.signal.aborted) throw new Error('Cancelled');

  ctx.progress({ label: 'Loading document', value: 0 });
  const buffer = await file.arrayBuffer();
  let sourceDoc;
  try {
    sourceDoc = await PDFDocument.load(buffer);
  } catch (error) {
    rethrowIfPassword(error);
  }

  const newPdfDoc = await PDFDocument.create();
  const pageCount = sourceDoc.getPageCount();

  for (let i = 0; i < pageCount; i++) {
    if (ctx.signal.aborted) throw new Error('Cancelled');
    ctx.progress({
      label: `Page ${i + 1} of ${pageCount}`,
      value: pageCount ? i / pageCount : 0,
    });

    const [originalPage] = await newPdfDoc.copyPages(sourceDoc, [i]);
    const { width, height } = originalPage.getSize();
    const newPage = newPdfDoc.addPage([width, height]);
    newPage.drawRectangle({
      x: 0,
      y: 0,
      width,
      height,
      color: rgb(color.r, color.g, color.b),
    });
    const embeddedPage = await newPdfDoc.embedPage(originalPage);
    newPage.drawPage(embeddedPage, { x: 0, y: 0, width, height });
  }

  ctx.progress({ label: 'Saving document', value: 0.98 });
  const resultBytes = await newPdfDoc.save();
  return new File([new Uint8Array(resultBytes)], file.name || 'document.pdf', {
    type: 'application/pdf',
  });
}
