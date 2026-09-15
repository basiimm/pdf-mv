// Pure engine for the pdf-to-markdown tool. See docs/TOOL-MIGRATION-GUIDE.md.
import { loadPyMuPDF, isPyMuPDFAvailable } from '../utils/pymupdf-loader.js';

export interface PdfToMarkdownOptions {
  includeImages?: boolean;
}

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

export function markdownNameFor(sourceName: string): string {
  return sourceName.replace(/\.pdf$/i, '') + '.md';
}

export async function pdfToMarkdown(
  file: File,
  options: PdfToMarkdownOptions,
  ctx: EngineContext
): Promise<File> {
  if (!isPyMuPDFAvailable()) {
    throw new Error(
      'The PyMuPDF WASM engine is not configured. Configure it in WASM Settings.'
    );
  }
  ctx.progress({ label: 'Loading engine…' });
  const pymupdf = await loadPyMuPDF();

  ctx.progress({ label: 'Converting to Markdown…', value: 0.5 });
  const markdown = await pymupdf.pdfToMarkdown(file, {
    includeImages: options.includeImages ?? false,
  });
  return new File([markdown], markdownNameFor(file.name), {
    type: 'text/markdown',
  });
}
