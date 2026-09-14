// Pure engine for the pdf-to-svg tool. See docs/TOOL-MIGRATION-GUIDE.md.
import JSZip from 'jszip';
import { loadPyMuPDF, isPyMuPDFAvailable } from '../utils/pymupdf-loader.js';
import { getCleanPdfFilename } from '../utils/helpers.js';

export interface PdfToSvgOptions {
  [key: string]: never;
}

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

export function svgZipName(baseName: string): string {
  return `${getCleanPdfFilename(baseName)}-images.zip`;
}

export async function pdfToSvg(
  file: File,
  _options: PdfToSvgOptions,
  ctx: EngineContext
): Promise<File | File[]> {
  if (!isPyMuPDFAvailable()) {
    throw new Error(
      'The PyMuPDF WASM engine is not configured. Configure it in WASM Settings.'
    );
  }

  ctx.progress({ label: 'Loading engine…' });
  const pymupdf = await loadPyMuPDF();

  ctx.progress({ label: 'Converting to SVG…' });
  const doc = await pymupdf.open(file);
  const pageCount = doc.pageCount;
  const baseName = getCleanPdfFilename(file.name);

  if (pageCount === 1) {
    const page = doc.getPage(0);
    const svgContent = page.toSvg ? page.toSvg() : '';
    return new File([svgContent], `${baseName}.svg`, { type: 'image/svg+xml' });
  }

  const zip = new JSZip();
  for (let i = 0; i < pageCount; i++) {
    if (ctx.signal.aborted) throw new Error('Cancelled');
    ctx.progress({
      label: `Page ${i + 1} of ${pageCount}`,
      value: i / pageCount,
    });
    const page = doc.getPage(i);
    const svgContent = page.toSvg ? page.toSvg() : '';
    zip.file(`page_${i + 1}.svg`, svgContent);
  }

  ctx.progress({ label: 'Creating ZIP file', value: 0.95 });
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return new File([zipBlob], svgZipName(file.name), {
    type: 'application/zip',
  });
}
