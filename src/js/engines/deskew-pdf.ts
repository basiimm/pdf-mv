// Pure engine for the Straighten pages (deskew) tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/deskew-pdf-page.ts. No DOM, no showAlert/showLoader.
import { loadPyMuPDF } from '../utils/pymupdf-loader.js';
import type { PyMuPDFInstance } from '@/types';

export interface DeskewPdfOptions {
  threshold: number;
  dpi: number;
}

export const defaultDeskewPdfOptions: DeskewPdfOptions = {
  threshold: 0.5,
  dpi: 150,
};

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

export async function deskewPdf(
  file: File,
  options: DeskewPdfOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  ctx.progress({ label: 'Loading engine…' });
  const pymupdf = (await loadPyMuPDF()) as PyMuPDFInstance;
  await pymupdf.load();

  ctx.progress({ label: 'Straightening pages…' });
  const { pdf: resultPdf } = await pymupdf.deskewPdf(file, {
    threshold: options.threshold,
    dpi: options.dpi,
  });

  const bytes = new Uint8Array(await resultPdf.arrayBuffer());
  return new File([bytes], `${baseName(file.name)}-deskewed.pdf`, {
    type: 'application/pdf',
  });
}
