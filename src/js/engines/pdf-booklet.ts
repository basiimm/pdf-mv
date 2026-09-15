// Pure engine for the PDF Booklet tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/pdf-booklet-page.ts. No DOM queries, no
// showAlert/showLoader, no Tailwind strings.
import { PDFDocument, degrees, PageSizes } from 'pdf-lib';
import { loadPdfDocument } from '../utils/load-pdf-document.js';

export type BookletGridMode = '1x2' | '2x2' | '2x4' | '4x4';
export type BookletOrientation = 'auto' | 'portrait' | 'landscape';
export type BookletRotationMode = 'none' | '90cw' | '90ccw' | 'alternate';

export interface PdfBookletOptions {
  /** '1x2' is the classic saddle-stitch booklet imposition (2 pages per side). */
  gridMode?: BookletGridMode;
  orientation?: BookletOrientation;
  /** Output paper size key (falls back to Letter when unrecognized). */
  paperSize?: string;
  rotation?: BookletRotationMode;
}

export const defaultPdfBookletOptions: PdfBookletOptions = {
  gridMode: '1x2',
  orientation: 'auto',
  paperSize: 'Letter',
  rotation: 'none',
};

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

export function getGridDimensions(gridMode: BookletGridMode): {
  rows: number;
  cols: number;
} {
  switch (gridMode) {
    case '1x2':
      return { rows: 1, cols: 2 };
    case '2x2':
      return { rows: 2, cols: 2 };
    case '2x4':
      return { rows: 2, cols: 4 };
    case '4x4':
      return { rows: 4, cols: 4 };
    default:
      return { rows: 1, cols: 2 };
  }
}

function resolveOrientation(
  orientation: BookletOrientation,
  isBookletMode: boolean
): 'portrait' | 'landscape' {
  if (orientation === 'portrait') return 'portrait';
  if (orientation === 'landscape') return 'landscape';
  return isBookletMode ? 'landscape' : 'portrait';
}

function getSheetDimensions(
  paperSize: string,
  orientation: BookletOrientation,
  isBookletMode: boolean
): { width: number; height: number } {
  const paperSizeKey = paperSize as keyof typeof PageSizes;
  const pageDims = PageSizes[paperSizeKey] || PageSizes.Letter;
  const resolved = resolveOrientation(orientation, isBookletMode);
  if (resolved === 'landscape') {
    return { width: pageDims[1], height: pageDims[0] };
  }
  return { width: pageDims[0], height: pageDims[1] };
}

/**
 * Standard saddle-stitch signature order for the 1x2 (booklet) grid: for
 * physical sheet `physicalSheet` (0-indexed) out of `totalRounded / 4`
 * sheets, the front holds [totalRounded - 2*physicalSheet, 2*physicalSheet + 1]
 * left-to-right and the back holds [2*physicalSheet + 2, totalRounded - 1 - 2*physicalSheet].
 * `sheetIndex` here is a "side" index: even = front, odd = back of the same
 * physical sheet (sheetIndex >> 1).
 */
export function bookletPageNumber(
  sheetIndex: number,
  slotCol: number,
  totalRounded: number
): number {
  const physicalSheet = Math.floor(sheetIndex / 2);
  const isFrontSide = sheetIndex % 2 === 0;
  if (isFrontSide) {
    return slotCol === 0
      ? totalRounded - 2 * physicalSheet
      : 2 * physicalSheet + 1;
  }
  return slotCol === 0
    ? 2 * physicalSheet + 2
    : totalRounded - 2 * physicalSheet - 1;
}

function applyRotation(doc: PDFDocument, mode: BookletRotationMode): void {
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    let rotation: number;
    switch (mode) {
      case '90cw':
        rotation = 90;
        break;
      case '90ccw':
        rotation = -90;
        break;
      case 'alternate':
        rotation = index % 2 === 0 ? 90 : -90;
        break;
      default:
        rotation = 0;
    }
    if (rotation !== 0) {
      page.setRotation(degrees(page.getRotation().angle + rotation));
    }
  });
}

export async function pdfBooklet(
  file: File,
  options: PdfBookletOptions,
  ctx: EngineContext
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  const buffer = await file.arrayBuffer();
  let sourceDoc: PDFDocument;
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

  const rotationMode = options.rotation ?? 'none';
  applyRotation(sourceDoc, rotationMode);

  const totalPages = sourceDoc.getPageCount();
  if (totalPages === 0) {
    throw new Error('This PDF has no pages to arrange into a booklet.');
  }

  const gridMode = options.gridMode ?? '1x2';
  const { rows, cols } = getGridDimensions(gridMode);
  const pagesPerSheet = rows * cols;
  const isBookletMode = rows === 1 && cols === 2;

  const paperSize = options.paperSize ?? 'Letter';
  const orientation = options.orientation ?? 'auto';
  const { width: sheetWidth, height: sheetHeight } = getSheetDimensions(
    paperSize,
    orientation,
    isBookletMode
  );

  const outputDoc = await PDFDocument.create();

  let numSheets: number;
  let totalRounded: number;
  if (isBookletMode) {
    totalRounded = Math.ceil(totalPages / 4) * 4;
    numSheets = Math.ceil(totalPages / 4) * 2;
  } else {
    totalRounded = totalPages;
    numSheets = Math.ceil(totalPages / pagesPerSheet);
  }

  const cellWidth = sheetWidth / cols;
  const cellHeight = sheetHeight / rows;
  const padding = 10;

  for (let sheetIndex = 0; sheetIndex < numSheets; sheetIndex++) {
    if (ctx.signal.aborted) throw new Error('Cancelled');
    ctx.progress({
      label: `Sheet ${sheetIndex + 1} of ${numSheets}`,
      value: sheetIndex / numSheets,
    });

    const outputPage = outputDoc.addPage([sheetWidth, sheetHeight]);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const slotIndex = r * cols + c;
        const pageNumber = isBookletMode
          ? bookletPageNumber(sheetIndex, c, totalRounded)
          : sheetIndex * pagesPerSheet + slotIndex + 1;

        if (pageNumber < 1 || pageNumber > totalPages) continue;

        const [embeddedPage] = await outputDoc.embedPdf(sourceDoc, [
          pageNumber - 1,
        ]);
        const { width: srcW, height: srcH } = embeddedPage;

        const availableWidth = cellWidth - padding * 2;
        const availableHeight = cellHeight - padding * 2;
        const scale = Math.min(availableWidth / srcW, availableHeight / srcH);

        const scaledWidth = srcW * scale;
        const scaledHeight = srcH * scale;

        const x = c * cellWidth + padding + (availableWidth - scaledWidth) / 2;
        const y =
          sheetHeight -
          (r + 1) * cellHeight +
          padding +
          (availableHeight - scaledHeight) / 2;

        outputPage.drawPage(embeddedPage, {
          x,
          y,
          width: scaledWidth,
          height: scaledHeight,
        });
      }
    }
  }

  ctx.progress({ label: 'Saving document', value: 0.98 });
  const pdfBytes = await outputDoc.save();
  return new File([new Uint8Array(pdfBytes)], file.name || 'document.pdf', {
    type: 'application/pdf',
  });
}
