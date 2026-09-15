// Pure engine for the Rasterize pages tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/rasterize-pdf-page.ts. No DOM, no showAlert/showLoader.
import { loadPyMuPDF } from '../utils/pymupdf-loader.js';
import type { PyMuPDFInstance } from '@/types';

export interface RasterizePdfOptions {
  dpi: number;
  format: 'png' | 'jpeg';
  grayscale: boolean;
}

export const defaultRasterizePdfOptions: RasterizePdfOptions = {
  dpi: 150,
  format: 'png',
  grayscale: false,
};

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

export async function rasterizePdf(
  file: File,
  options: RasterizePdfOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  ctx.progress({ label: 'Loading engine…' });
  const pymupdf = (await loadPyMuPDF()) as PyMuPDFInstance;

  ctx.progress({ label: 'Rasterizing…' });
  const rasterizedBlob = await pymupdf.rasterizePdf(file, {
    dpi: options.dpi,
    format: options.format,
    grayscale: options.grayscale,
    quality: 95,
  });

  const bytes = new Uint8Array(await rasterizedBlob.arrayBuffer());
  return new File([bytes], `${baseName(file.name)}-rasterized.pdf`, {
    type: 'application/pdf',
  });
}
