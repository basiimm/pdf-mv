// Pure engine for the Fix page size tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/fix-page-size-page.ts. No DOM, no showAlert/showLoader.
import { fixPageSize as fixPageSizeCore } from '../utils/pdf-operations.js';

export interface FixPageSizeOptions {
  targetSize: string;
  orientation: 'portrait' | 'landscape' | 'auto';
  scalingMode: 'fit' | 'fill';
  /** Hex color, e.g. #ffffff */
  backgroundColor: string;
  customWidth?: number;
  customHeight?: number;
  customUnits?: 'mm' | 'in';
}

export const defaultFixPageSizeOptions: FixPageSizeOptions = {
  targetSize: 'A4',
  orientation: 'auto',
  scalingMode: 'fit',
  backgroundColor: '#ffffff',
  customWidth: 210,
  customHeight: 297,
  customUnits: 'mm',
};

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
      }
    : { r: 1, g: 1, b: 1 };
}

export async function fixPageSize(
  file: File,
  options: FixPageSizeOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  ctx.progress({ label: 'Standardizing pages…' });
  const arrayBuffer = await file.arrayBuffer();
  const pdfBytes = new Uint8Array(arrayBuffer);

  const newPdfBytes = await fixPageSizeCore(pdfBytes, {
    targetSize: options.targetSize,
    orientation: options.orientation,
    scalingMode: options.scalingMode,
    backgroundColor: hexToRgb(options.backgroundColor),
    customWidth: options.customWidth ?? 210,
    customHeight: options.customHeight ?? 297,
    customUnits: options.customUnits ?? 'mm',
  });

  return new File(
    [new Uint8Array(newPdfBytes)],
    `${baseName(file.name)}-resized.pdf`,
    {
      type: 'application/pdf',
    }
  );
}
