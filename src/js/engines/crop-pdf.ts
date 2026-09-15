// Pure engine for the Crop pages tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Crops inside the PDF view (live preview) by moving the CropBox in from
// each edge, instead of the legacy separate drag-crop canvas
// (src/js/logic/crop-pdf-page.ts / cropper.ts). Drag handles in the viewer
// are a later improvement; this engine only takes numeric margins.
import { loadPdfDocument } from '../utils/load-pdf-document.js';
import { parsePageRanges } from '../utils/helpers.js';

export type CropUnit = 'percent' | 'mm';

export interface CropPdfOptions {
  unit?: CropUnit;
  /** Margin removed from each edge, in the chosen unit. */
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  /** Page range to crop; blank = all pages. */
  pages?: string;
  /** Also shrink the MediaBox to match, not just the CropBox. */
  trimMediaBox?: string;
}

export const defaultCropPdfOptions: CropPdfOptions = {
  unit: 'percent',
  top: '0',
  right: '0',
  bottom: '0',
  left: '0',
  pages: '',
  trimMediaBox: 'false',
};

const MM_PER_POINT = 25.4 / 72;

function marginsToPoints(
  options: CropPdfOptions,
  pageWidth: number,
  pageHeight: number
): { top: number; right: number; bottom: number; left: number } {
  const top = Number(options.top) || 0;
  const right = Number(options.right) || 0;
  const bottom = Number(options.bottom) || 0;
  const left = Number(options.left) || 0;

  if (options.unit === 'mm') {
    const toPt = (mm: number) => mm / MM_PER_POINT;
    return {
      top: toPt(top),
      right: toPt(right),
      bottom: toPt(bottom),
      left: toPt(left),
    };
  }

  return {
    top: (top / 100) * pageHeight,
    right: (right / 100) * pageWidth,
    bottom: (bottom / 100) * pageHeight,
    left: (left / 100) * pageWidth,
  };
}

export async function cropPdf(
  file: File,
  options: CropPdfOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  ctx.progress({ label: 'Cropping pages…' });
  const bytes = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(bytes);
  const totalPages = pdfDoc.getPageCount();
  const targets = new Set(parsePageRanges(options.pages || '', totalPages));
  const trimMediaBox = options.trimMediaBox === 'true';

  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    if (!targets.has(i)) continue;
    if (ctx.signal.aborted) throw new Error('Cancelled');
    ctx.progress({ label: 'Cropping pages…', value: (i + 1) / pages.length });

    const page = pages[i];
    const box = page.getCropBox();
    const { top, right, bottom, left } = marginsToPoints(
      options,
      box.width,
      box.height
    );

    const newWidth = box.width - left - right;
    const newHeight = box.height - top - bottom;
    if (newWidth <= 0 || newHeight <= 0) {
      throw new Error(
        'Margins are larger than the page. Reduce them and try again.'
      );
    }

    const x = box.x + left;
    const y = box.y + bottom;
    page.setCropBox(x, y, newWidth, newHeight);
    if (trimMediaBox) {
      page.setMediaBox(x, y, newWidth, newHeight);
    }
  }

  const outBytes = await pdfDoc.save();
  return new File([new Uint8Array(outBytes)], file.name, {
    type: 'application/pdf',
  });
}

export interface CropPdfDetails {
  pageCount: number;
  /** First page size in millimeters, rounded to one decimal place. */
  widthMm: number;
  heightMm: number;
}

/** For the panel's `inspect` details: page count and page 1 size in mm. */
export async function cropPdfDetails(file: File): Promise<CropPdfDetails> {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(bytes);
  const pages = pdfDoc.getPages();
  const first = pages[0]?.getCropBox() ?? { width: 0, height: 0 };
  return {
    pageCount: pages.length,
    widthMm: Math.round(first.width * MM_PER_POINT * 10) / 10,
    heightMm: Math.round(first.height * MM_PER_POINT * 10) / 10,
  };
}
