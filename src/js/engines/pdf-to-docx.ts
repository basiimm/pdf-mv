// Pure engine for the pdf-to-docx tool. See docs/TOOL-MIGRATION-GUIDE.md.
import { loadPyMuPDF, isPyMuPDFAvailable } from '../utils/pymupdf-loader.js';

export interface PdfToDocxOptions {
  [key: string]: never;
}

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

export function docxNameFor(sourceName: string): string {
  return sourceName.replace(/\.pdf$/i, '') + '.docx';
}

export async function pdfToDocx(
  file: File,
  _options: PdfToDocxOptions,
  ctx: EngineContext
): Promise<File> {
  if (!isPyMuPDFAvailable()) {
    throw new Error(
      'The PyMuPDF WASM engine is not configured. Configure it in WASM Settings.'
    );
  }
  ctx.progress({ label: 'Loading engine…' });
  const pymupdf = await loadPyMuPDF();

  ctx.progress({ label: 'Converting to Word…', value: 0.5 });
  const docxBlob = await pymupdf.pdfToDocx(file);
  return new File([docxBlob], docxNameFor(file.name), {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
