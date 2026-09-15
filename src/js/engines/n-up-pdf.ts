// Pure engine for the N-Up PDF tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/n-up-pdf-page.ts. No DOM queries, no
// showAlert/showLoader, no Tailwind strings.
import { PDFDocument, rgb, PageSizes } from 'pdf-lib';
import { hexToRgb } from '../utils/helpers.js';
import { loadPdfDocument } from '../utils/load-pdf-document.js';

export type NUpPagesPerSheet = 2 | 4 | 9 | 16;
export type NUpOrientation = 'auto' | 'portrait' | 'landscape';

export interface NUpPdfOptions {
  pagesPerSheet?: NUpPagesPerSheet;
  /** Output page size key (falls back to Letter when unrecognized). */
  pageSize?: string;
  orientation?: NUpOrientation;
  margins?: boolean;
  border?: boolean;
  borderColor?: string;
}

export const defaultNUpOptions: NUpPdfOptions = {
  pagesPerSheet: 4,
  pageSize: 'Letter',
  orientation: 'auto',
  margins: false,
  border: false,
  borderColor: '#000000',
};

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

const GRID_DIMS: Record<NUpPagesPerSheet, [number, number]> = {
  2: [2, 1],
  4: [2, 2],
  9: [3, 3],
  16: [4, 4],
};

export async function nUpPdf(
  file: File,
  options: NUpPdfOptions,
  ctx: EngineContext
): Promise<File> {
  const n = options.pagesPerSheet ?? 4;
  const dims = GRID_DIMS[n];
  if (!dims) {
    throw new Error('Choose 2, 4, 9, or 16 pages per sheet.');
  }

  if (ctx.signal.aborted) throw new Error('Cancelled');

  const buffer = await file.arrayBuffer();
  let sourceDoc;
  try {
    sourceDoc = await loadPdfDocument(buffer);
  } catch (error) {
    throw error instanceof Error
      ? new Error(error.message, { cause: error })
      : new Error(String(error));
  }
  if (sourceDoc.isEncrypted) {
    throw new Error(
      'This PDF is password protected. Remove the password and try again.'
    );
  }

  const newDoc = await PDFDocument.create();
  const sourcePages = sourceDoc.getPages();
  if (sourcePages.length === 0) {
    throw new Error('This PDF has no pages to lay out.');
  }

  const pageSizeKey = (options.pageSize ?? 'Letter') as keyof typeof PageSizes;
  let [pageWidth, pageHeight] = PageSizes[pageSizeKey] || PageSizes.Letter;
  let orientation = options.orientation ?? 'auto';

  if (orientation === 'auto') {
    const firstPage = sourcePages[0];
    const isSourceLandscape = firstPage.getWidth() > firstPage.getHeight();
    orientation =
      isSourceLandscape && dims[0] > dims[1] ? 'landscape' : 'portrait';
  }

  if (orientation === 'landscape' && pageWidth < pageHeight) {
    [pageWidth, pageHeight] = [pageHeight, pageWidth];
  }

  const margin = options.margins ? 36 : 0;
  const gutter = options.margins ? 10 : 0;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;
  const borderColor = hexToRgb(options.borderColor ?? '#000000');

  const totalSheets = Math.ceil(sourcePages.length / n);

  for (let i = 0, sheet = 0; i < sourcePages.length; i += n, sheet++) {
    if (ctx.signal.aborted) throw new Error('Cancelled');
    ctx.progress({
      label: `Sheet ${sheet + 1} of ${totalSheets}`,
      value: sheet / totalSheets,
    });

    const chunk = sourcePages.slice(i, i + n);
    const outputPage = newDoc.addPage([pageWidth, pageHeight]);

    const cellWidth = (usableWidth - gutter * (dims[0] - 1)) / dims[0];
    const cellHeight = (usableHeight - gutter * (dims[1] - 1)) / dims[1];

    for (let j = 0; j < chunk.length; j++) {
      const sourcePage = chunk[j];
      const embeddedPage = await newDoc.embedPage(sourcePage);

      const scale = Math.min(
        cellWidth / embeddedPage.width,
        cellHeight / embeddedPage.height
      );
      const scaledWidth = embeddedPage.width * scale;
      const scaledHeight = embeddedPage.height * scale;

      const row = Math.floor(j / dims[0]);
      const col = j % dims[0];
      const cellX = margin + col * (cellWidth + gutter);
      const cellY = pageHeight - margin - (row + 1) * cellHeight - row * gutter;

      const x = cellX + (cellWidth - scaledWidth) / 2;
      const y = cellY + (cellHeight - scaledHeight) / 2;

      outputPage.drawPage(embeddedPage, {
        x,
        y,
        width: scaledWidth,
        height: scaledHeight,
      });

      if (options.border) {
        outputPage.drawRectangle({
          x,
          y,
          width: scaledWidth,
          height: scaledHeight,
          borderColor: rgb(borderColor.r, borderColor.g, borderColor.b),
          borderWidth: 1,
        });
      }
    }
  }

  ctx.progress({ label: 'Saving document', value: 0.98 });
  const resultBytes = await newDoc.save();
  return new File([new Uint8Array(resultBytes)], file.name || 'document.pdf', {
    type: 'application/pdf',
  });
}
