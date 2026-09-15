// Pure engine for the Bates numbering tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/bates-numbering-page.ts. Legacy supported a
// multi-file batch workflow (Sortable/JSZip reordering); this engine stamps
// a single open PDF, matching the legacy per-page numbering/formatting math.
// No DOM, no showAlert/showLoader.
import { StandardFonts, rgb } from 'pdf-lib';
import { loadPdfDocument } from '../utils/load-pdf-document.js';
import { hexToRgb } from '../utils/helpers.js';
import type { Position, StylePreset } from '../types/bates-numbering-type.js';

export type { Position } from '../types/bates-numbering-type.js';

export type BatesFontFamily = 'Helvetica' | 'TimesRoman' | 'Courier';

export interface BatesNumberingOptions {
  /** Template using [BATES], [PAGE], [FILE], [FILENAME] placeholders. */
  template?: string;
  /** Digits to zero-pad the Bates counter to; 0 = no padding. */
  padding?: number;
  /** First Bates number stamped on page 1. */
  startNumber?: number;
  /** File sequence number substituted for [FILE] (single file, so constant). */
  fileNumber?: number;
  position?: Position;
  fontFamily?: BatesFontFamily;
  fontSize?: number;
  /** Hex color, e.g. #000000 */
  color?: string;
}

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

export const defaultBatesNumberingOptions: Required<BatesNumberingOptions> = {
  template: '[BATES]',
  padding: 6,
  startNumber: 1,
  fileNumber: 1,
  position: 'bottom-center',
  fontFamily: 'Helvetica',
  fontSize: 10,
  color: '#000000',
};

/** Style presets from the legacy page (id -> template/padding). Exposed so
 * the field definition can offer the same quick presets. */
export const BATES_STYLE_PRESETS: Record<string, StylePreset> = {
  'full-6': {
    template: 'Exhibit [FILE] Case XYZ [BATES] Page [PAGE]',
    padding: 6,
  },
  'full-5': {
    template: 'Exhibit [FILE] Case XYZ [BATES] Page [PAGE]',
    padding: 5,
  },
  'full-4': {
    template: 'Exhibit [FILE] Case XYZ [BATES] Page [PAGE]',
    padding: 4,
  },
  'full-3': {
    template: 'Exhibit [FILE] Case XYZ [BATES] Page [PAGE]',
    padding: 3,
  },
  'full-0': {
    template: 'Exhibit [FILE] Case XYZ [BATES] Page [PAGE]',
    padding: 0,
  },
  'no-page-6': { template: 'Exhibit [FILE] Case XYZ [BATES]', padding: 6 },
  'no-page-5': { template: 'Exhibit [FILE] Case XYZ [BATES]', padding: 5 },
  'no-page-4': { template: 'Exhibit [FILE] Case XYZ [BATES]', padding: 4 },
  'no-page-3': { template: 'Exhibit [FILE] Case XYZ [BATES]', padding: 3 },
  'no-page-0': { template: 'Exhibit [FILE] Case XYZ [BATES]', padding: 0 },
  'case-6': { template: 'Case XYZ [BATES]', padding: 6 },
  'case-5': { template: 'Case XYZ [BATES]', padding: 5 },
  'case-4': { template: 'Case XYZ [BATES]', padding: 4 },
  'case-3': { template: 'Case XYZ [BATES]', padding: 3 },
  'case-0': { template: 'Case XYZ [BATES]', padding: 0 },
  'bates-6': { template: '[BATES]', padding: 6 },
  'bates-5': { template: '[BATES]', padding: 5 },
  'bates-4': { template: '[BATES]', padding: 4 },
  'bates-3': { template: '[BATES]', padding: 3 },
  'bates-0': { template: '[BATES]', padding: 0 },
};

const FONT_MAP: Record<BatesFontFamily, keyof typeof StandardFonts> = {
  Helvetica: 'Helvetica',
  TimesRoman: 'TimesRoman',
  Courier: 'Courier',
};

function resolveOptions(
  options: BatesNumberingOptions
): Required<BatesNumberingOptions> {
  return { ...defaultBatesNumberingOptions, ...options };
}

export function formatBatesText(
  template: string,
  batesNum: number,
  pageNum: number,
  fileNum: number,
  fileName: string,
  padding: number
): string {
  const batesStr =
    padding > 0 ? String(batesNum).padStart(padding, '0') : String(batesNum);
  return template
    .replace(/\[BATES\]/g, batesStr)
    .replace(/\[PAGE\]/g, String(pageNum))
    .replace(/\[FILE\]/g, String(fileNum))
    .replace(/\[FILENAME\]/g, fileName);
}

function calculatePosition(
  pageWidth: number,
  pageHeight: number,
  xOffset: number,
  yOffset: number,
  textWidth: number,
  fontSize: number,
  position: Position
): { x: number; y: number } {
  const minMargin = 8;
  const maxMargin = 40;
  const marginPct = 0.04;

  const hMargin = Math.max(
    minMargin,
    Math.min(maxMargin, pageWidth * marginPct)
  );
  const vMargin = Math.max(
    minMargin,
    Math.min(maxMargin, pageHeight * marginPct)
  );
  const safeH = Math.max(hMargin, textWidth / 2 + 3);
  const safeV = Math.max(vMargin, fontSize + 3);

  let x = 0;
  let y = 0;

  switch (position) {
    case 'bottom-center':
      x =
        Math.max(
          safeH,
          Math.min(pageWidth - safeH - textWidth, (pageWidth - textWidth) / 2)
        ) + xOffset;
      y = safeV + yOffset;
      break;
    case 'bottom-left':
      x = safeH + xOffset;
      y = safeV + yOffset;
      break;
    case 'bottom-right':
      x = Math.max(safeH, pageWidth - safeH - textWidth) + xOffset;
      y = safeV + yOffset;
      break;
    case 'top-center':
      x =
        Math.max(
          safeH,
          Math.min(pageWidth - safeH - textWidth, (pageWidth - textWidth) / 2)
        ) + xOffset;
      y = pageHeight - safeV - fontSize + yOffset;
      break;
    case 'top-left':
      x = safeH + xOffset;
      y = pageHeight - safeV - fontSize + yOffset;
      break;
    case 'top-right':
      x = Math.max(safeH, pageWidth - safeH - textWidth) + xOffset;
      y = pageHeight - safeV - fontSize + yOffset;
      break;
  }

  x = Math.max(xOffset + 3, Math.min(xOffset + pageWidth - textWidth - 3, x));
  y = Math.max(yOffset + 3, Math.min(yOffset + pageHeight - fontSize - 3, y));

  return { x, y };
}

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

export async function batesNumbering(
  file: File,
  options: BatesNumberingOptions,
  ctx: EngineContext
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  const opts = resolveOptions(options);

  if (!Number.isFinite(opts.startNumber) || opts.startNumber < 1) {
    throw new Error('Enter a starting number of 1 or more.');
  }
  if (!Number.isFinite(opts.padding) || opts.padding < 0) {
    throw new Error('Enter a digit padding of 0 or more.');
  }

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

  const fontName = FONT_MAP[opts.fontFamily] || 'Helvetica';
  const font = await pdfDoc.embedFont(StandardFonts[fontName]);
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;
  const fileName = baseName(file.name || 'document.pdf');
  const color = hexToRgb(opts.color);

  let batesCounter = opts.startNumber;

  for (let i = 0; i < totalPages; i++) {
    if (ctx.signal.aborted) throw new Error('Cancelled');
    ctx.progress({
      label: `Page ${i + 1} of ${totalPages}`,
      value: i / totalPages,
    });

    const page = pages[i];
    const bounds = page.getCropBox() || page.getMediaBox();
    const text = formatBatesText(
      opts.template,
      batesCounter,
      i + 1,
      opts.fileNumber,
      fileName,
      opts.padding
    );
    const textWidth = font.widthOfTextAtSize(text, opts.fontSize);

    const { x, y } = calculatePosition(
      bounds.width,
      bounds.height,
      bounds.x || 0,
      bounds.y || 0,
      textWidth,
      opts.fontSize,
      opts.position
    );

    page.drawText(text, {
      x,
      y,
      font,
      size: opts.fontSize,
      color: rgb(color.r, color.g, color.b),
    });

    batesCounter++;
  }

  ctx.progress({ label: 'Saving document', value: 0.98 });
  const resultBytes = await pdfDoc.save();
  return new File([new Uint8Array(resultBytes)], file.name || 'document.pdf', {
    type: 'application/pdf',
  });
}
