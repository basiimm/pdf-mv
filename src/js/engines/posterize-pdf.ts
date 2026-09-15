// Pure engine for the Posterize PDF tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/posterize-page.ts. No DOM queries, no
// showAlert/showLoader, no Tailwind strings.
import { PDFDocument, PageSizes } from 'pdf-lib';
import { getPDFDocument, parsePageRanges } from '../utils/helpers.js';
import '../utils/setup-pdf-worker.js';

export type PosterizeOrientation = 'auto' | 'portrait' | 'landscape';
export type PosterizeScalingMode = 'fit' | 'fill';
export type PosterizeOverlapUnit = 'pt' | 'in' | 'mm';

export interface PosterizePdfOptions {
  /** Number of tile rows per source page. */
  rows?: number;
  /** Number of tile columns per source page. */
  cols?: number;
  /** Output page size key (falls back to A4 when unrecognized). */
  pageSize?: string;
  orientation?: PosterizeOrientation;
  /** 'fit' preserves all content (may add margins); 'fill' crops to fill the tile. */
  scalingMode?: PosterizeScalingMode;
  overlap?: number;
  overlapUnit?: PosterizeOverlapUnit;
  /** Page range string ("1-3, 5"); blank/omitted means all pages. */
  pages?: string;
}

export const defaultPosterizeOptions: PosterizePdfOptions = {
  rows: 1,
  cols: 2,
  pageSize: 'A4',
  orientation: 'auto',
  scalingMode: 'fit',
  overlap: 0,
  overlapUnit: 'pt',
  pages: '',
};

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

function overlapInPoints(overlap: number, unit: PosterizeOverlapUnit): number {
  if (unit === 'in') return overlap * 72;
  if (unit === 'mm') return overlap * (72 / 25.4);
  return overlap;
}

function isPasswordError(error: unknown): boolean {
  const name =
    error && typeof error === 'object' && 'name' in error
      ? (error as { name: string }).name
      : '';
  const message = error instanceof Error ? error.message : String(error);
  return name === 'PasswordException' || /password/i.test(message);
}

export async function posterizePdf(
  file: File,
  options: PosterizePdfOptions,
  ctx: EngineContext
): Promise<File> {
  const rows = options.rows && options.rows > 0 ? Math.floor(options.rows) : 1;
  const cols = options.cols && options.cols > 0 ? Math.floor(options.cols) : 1;
  const pageSizeKey = (options.pageSize ?? 'A4') as keyof typeof PageSizes;
  const orientation = options.orientation ?? 'auto';
  const scalingMode = options.scalingMode ?? 'fit';
  const overlapPts = overlapInPoints(
    options.overlap ?? 0,
    options.overlapUnit ?? 'pt'
  );

  if (ctx.signal.aborted) throw new Error('Cancelled');

  const buffer = await file.arrayBuffer();
  let pdfjsDoc;
  try {
    pdfjsDoc = await getPDFDocument(buffer.slice(0)).promise;
  } catch (error) {
    if (isPasswordError(error)) {
      throw new Error(
        'This PDF is password protected. Remove the password and try again.',
        { cause: error }
      );
    }
    throw error instanceof Error ? error : new Error(String(error));
  }

  const totalPages = pdfjsDoc.numPages;
  const pageIndices = parsePageRanges(options.pages ?? '', totalPages);
  if (pageIndices.length === 0) {
    throw new Error('Choose a valid page range to posterize.');
  }

  const newDoc = await PDFDocument.create();
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) throw new Error('Failed to acquire a 2D canvas context.');

  for (let i = 0; i < pageIndices.length; i++) {
    if (ctx.signal.aborted) throw new Error('Cancelled');
    const pageIndex = pageIndices[i];
    ctx.progress({
      label: `Page ${i + 1} of ${pageIndices.length}`,
      value: i / pageIndices.length,
    });

    const page = await pdfjsDoc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 2.0 });
    tempCanvas.width = viewport.width;
    tempCanvas.height = viewport.height;
    await page.render({
      canvasContext: tempCtx,
      viewport,
      canvas: tempCanvas,
    }).promise;

    let [targetWidth, targetHeight] = PageSizes[pageSizeKey] || PageSizes.A4;
    let currentOrientation = orientation;
    if (currentOrientation === 'auto') {
      currentOrientation =
        viewport.width > viewport.height ? 'landscape' : 'portrait';
    }
    if (currentOrientation === 'landscape' && targetWidth < targetHeight) {
      [targetWidth, targetHeight] = [targetHeight, targetWidth];
    } else if (
      currentOrientation === 'portrait' &&
      targetWidth > targetHeight
    ) {
      [targetWidth, targetHeight] = [targetHeight, targetWidth];
    }

    const tileWidth = tempCanvas.width / cols;
    const tileHeight = tempCanvas.height / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sx = c * tileWidth - (c > 0 ? overlapPts : 0);
        const sy = r * tileHeight - (r > 0 ? overlapPts : 0);
        const sWidth =
          tileWidth +
          (c > 0 ? overlapPts : 0) +
          (c < cols - 1 ? overlapPts : 0);
        const sHeight =
          tileHeight +
          (r > 0 ? overlapPts : 0) +
          (r < rows - 1 ? overlapPts : 0);

        const tileCanvas = document.createElement('canvas');
        tileCanvas.width = sWidth;
        tileCanvas.height = sHeight;
        const tileCtx = tileCanvas.getContext('2d');
        if (!tileCtx) continue;
        tileCtx.drawImage(
          tempCanvas,
          sx,
          sy,
          sWidth,
          sHeight,
          0,
          0,
          sWidth,
          sHeight
        );

        const tileBlob = await new Promise<Blob | null>((resolve) =>
          tileCanvas.toBlob(resolve, 'image/png')
        );
        tileCanvas.width = 0;
        tileCanvas.height = 0;
        if (!tileBlob) {
          throw new Error('Failed to encode a poster tile as an image.');
        }
        const tileBytes = await tileBlob.arrayBuffer();
        const tileImage = await newDoc.embedPng(tileBytes);
        const newPage = newDoc.addPage([targetWidth, targetHeight]);

        const scaleX = newPage.getWidth() / sWidth;
        const scaleY = newPage.getHeight() / sHeight;
        const scale =
          scalingMode === 'fit'
            ? Math.min(scaleX, scaleY)
            : Math.max(scaleX, scaleY);

        const scaledWidth = sWidth * scale;
        const scaledHeight = sHeight * scale;

        newPage.drawImage(tileImage, {
          x: (newPage.getWidth() - scaledWidth) / 2,
          y: (newPage.getHeight() - scaledHeight) / 2,
          width: scaledWidth,
          height: scaledHeight,
        });
      }
    }
  }

  tempCanvas.width = 0;
  tempCanvas.height = 0;
  ctx.progress({ label: 'Saving document', value: 0.98 });
  const resultBytes = await newDoc.save();
  return new File([new Uint8Array(resultBytes)], file.name || 'document.pdf', {
    type: 'application/pdf',
  });
}
