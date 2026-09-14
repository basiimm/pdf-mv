// Pure engine for the Convert to PDF/A tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/pdf-to-pdfa-page.ts. No DOM, no showAlert/showLoader.
import {
  convertFileToPdfA,
  type PdfALevel,
} from '../utils/ghostscript-loader.js';
import { loadPyMuPDF } from '../utils/pymupdf-loader.js';
import type { PyMuPDFInstance } from '@/types';

export interface PdfToPdfAOptions {
  level: PdfALevel;
  /** Rasterize pages before conversion; helps with unsupported patterns/transparency. */
  preFlatten: boolean;
}

export const defaultPdfToPdfAOptions: PdfToPdfAOptions = {
  level: 'PDF/A-2b',
  preFlatten: false,
};

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

export async function pdfToPdfA(
  file: File,
  options: PdfToPdfAOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  let fileToConvert = file;

  if (options.preFlatten) {
    ctx.progress({ label: 'Loading engine…' });
    const pymupdf = (await loadPyMuPDF()) as PyMuPDFInstance;
    ctx.progress({ label: 'Pre-flattening PDF…' });
    const flattenedBlob = await pymupdf.rasterizePdf(file, {
      dpi: 300,
      format: 'png',
    });
    fileToConvert = new File([flattenedBlob], file.name, {
      type: 'application/pdf',
    });
  }

  ctx.progress({ label: 'Loading engine…' });
  const convertedBlob = await convertFileToPdfA(
    fileToConvert,
    options.level,
    (msg) => ctx.progress({ label: msg })
  );

  const fileName = `${baseName(file.name)}-pdfa.pdf`;
  const bytes = new Uint8Array(await convertedBlob.arrayBuffer());
  return new File([bytes], fileName, { type: 'application/pdf' });
}
