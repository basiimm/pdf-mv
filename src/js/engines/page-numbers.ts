// Pure engine for the Page numbers tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/page-numbers-page.ts and the addPageNumbers
// helper in src/js/utils/pdf-operations.ts. No DOM, no showAlert/showLoader.
import { StandardFonts, rgb } from 'pdf-lib';
import { loadPdfDocument } from '../utils/load-pdf-document.js';
import { hexToRgb } from '../utils/helpers.js';

export type PageNumberPosition =
  | 'bottom-center'
  | 'bottom-left'
  | 'bottom-right'
  | 'top-center'
  | 'top-left'
  | 'top-right';

export type PageNumberFormat = 'simple' | 'page_x_of_y';

export interface PageNumbersOptions {
  position?: PageNumberPosition;
  fontSize?: number;
  format?: PageNumberFormat;
  /** Hex color, e.g. #000000 */
  color?: string;
}

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

export const defaultPageNumbersOptions: Required<PageNumbersOptions> = {
  position: 'bottom-center',
  fontSize: 12,
  format: 'simple',
  color: '#000000',
};

function resolveOptions(
  options: PageNumbersOptions
): Required<PageNumbersOptions> {
  return { ...defaultPageNumbersOptions, ...options };
}

function computePosition(
  width: number,
  height: number,
  xOffset: number,
  yOffset: number,
  textWidth: number,
  textHeight: number,
  position: PageNumberPosition
): { x: number; y: number } {
  const minMargin = 8;
  const maxMargin = 40;
  const marginPercentage = 0.04;

  const horizontalMargin = Math.max(
    minMargin,
    Math.min(maxMargin, width * marginPercentage)
  );
  const verticalMargin = Math.max(
    minMargin,
    Math.min(maxMargin, height * marginPercentage)
  );

  const safeHorizontalMargin = Math.max(horizontalMargin, textWidth / 2 + 3);
  const safeVerticalMargin = Math.max(verticalMargin, textHeight + 3);

  let x = 0;
  let y = 0;

  switch (position) {
    case 'bottom-center':
      x =
        Math.max(
          safeHorizontalMargin,
          Math.min(
            width - safeHorizontalMargin - textWidth,
            (width - textWidth) / 2
          )
        ) + xOffset;
      y = safeVerticalMargin + yOffset;
      break;
    case 'bottom-left':
      x = safeHorizontalMargin + xOffset;
      y = safeVerticalMargin + yOffset;
      break;
    case 'bottom-right':
      x =
        Math.max(
          safeHorizontalMargin,
          width - safeHorizontalMargin - textWidth
        ) + xOffset;
      y = safeVerticalMargin + yOffset;
      break;
    case 'top-center':
      x =
        Math.max(
          safeHorizontalMargin,
          Math.min(
            width - safeHorizontalMargin - textWidth,
            (width - textWidth) / 2
          )
        ) + xOffset;
      y = height - safeVerticalMargin - textHeight + yOffset;
      break;
    case 'top-left':
      x = safeHorizontalMargin + xOffset;
      y = height - safeVerticalMargin - textHeight + yOffset;
      break;
    case 'top-right':
      x =
        Math.max(
          safeHorizontalMargin,
          width - safeHorizontalMargin - textWidth
        ) + xOffset;
      y = height - safeVerticalMargin - textHeight + yOffset;
      break;
  }

  x = Math.max(xOffset + 3, Math.min(xOffset + width - textWidth - 3, x));
  y = Math.max(yOffset + 3, Math.min(yOffset + height - textHeight - 3, y));

  return { x, y };
}

export async function pageNumbers(
  file: File,
  options: PageNumbersOptions,
  ctx: EngineContext
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  const opts = resolveOptions(options);
  ctx.progress({ label: 'Loading document', value: 0 });

  const arrayBuffer = await file.arrayBuffer();
  let pdfDoc;
  try {
    pdfDoc = await loadPdfDocument(arrayBuffer);
  } catch (error) {
    throw new Error('Could not read this PDF file.', { cause: error });
  }

  if (pdfDoc.isEncrypted) {
    throw new Error(
      'This PDF is password protected. Remove the password and try again.'
    );
  }

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;
  const color = hexToRgb(opts.color);

  for (let i = 0; i < totalPages; i++) {
    if (ctx.signal.aborted) throw new Error('Cancelled');
    ctx.progress({
      label: `Page ${i + 1} of ${totalPages}`,
      value: i / totalPages,
    });

    const page = pages[i];
    const mediaBox = page.getMediaBox();
    const cropBox = page.getCropBox();
    const bounds = cropBox || mediaBox;
    const width = bounds.width;
    const height = bounds.height;
    const xOffset = bounds.x || 0;
    const yOffset = bounds.y || 0;

    const pageNumText =
      opts.format === 'page_x_of_y' ? `${i + 1} / ${totalPages}` : `${i + 1}`;

    const textWidth = font.widthOfTextAtSize(pageNumText, opts.fontSize);
    const textHeight = opts.fontSize;

    const { x, y } = computePosition(
      width,
      height,
      xOffset,
      yOffset,
      textWidth,
      textHeight,
      opts.position
    );

    page.drawText(pageNumText, {
      x,
      y,
      font,
      size: opts.fontSize,
      color: rgb(color.r, color.g, color.b),
    });
  }

  ctx.progress({ label: 'Saving document', value: 0.98 });
  const resultBytes = await pdfDoc.save();
  return new File([new Uint8Array(resultBytes)], file.name || 'document.pdf', {
    type: 'application/pdf',
  });
}
