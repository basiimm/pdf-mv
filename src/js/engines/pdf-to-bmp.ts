// Pure engine for the pdf-to-bmp tool. See docs/TOOL-MIGRATION-GUIDE.md.
import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';
import { getPDFDocument, getCleanPdfFilename } from '../utils/helpers.js';
import '../utils/setup-pdf-worker.js';

export interface PdfToBmpOptions {
  /** Render scale; higher is sharper but slower. Matches legacy default. */
  scale?: number;
}

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

/** Rethrow pdf.js password errors as a message the panel recognizes. */
function rethrowIfPassword(error: unknown): never {
  if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name: string }).name === 'PasswordException'
  ) {
    throw new Error(
      'This PDF is password protected. Remove the password and try again.'
    );
  }
  throw error instanceof Error ? error : new Error(String(error));
}

async function renderPageToBlob(
  page: PDFPageProxy,
  scale: number,
  mimeType: string,
  quality?: number
): Promise<Blob> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Failed to acquire a 2D canvas context.');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: context, viewport, canvas }).promise;

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mimeType, quality)
  );
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error('Failed to encode the page as an image.');
  return blob;
}

/** Name used when bundling multiple page images into one archive. */
export function bmpZipName(baseName: string): string {
  return `${getCleanPdfFilename(baseName)}-images.zip`;
}

export async function pdfToBmp(
  file: File,
  options: PdfToBmpOptions,
  ctx: EngineContext
): Promise<File | File[]> {
  const scale = options.scale ?? 2.0;
  const buffer = await file.arrayBuffer();
  let pdf;
  try {
    pdf = await getPDFDocument(buffer.slice(0)).promise;
  } catch (error) {
    rethrowIfPassword(error);
  }

  const baseName = getCleanPdfFilename(file.name);

  if (pdf.numPages === 1) {
    ctx.progress({ label: 'Rendering page', value: 0.5 });
    const page = await pdf.getPage(1);
    const blob = await renderPageToBlob(page, scale, 'image/bmp');
    return new File([blob], `${baseName}.bmp`, { type: 'image/bmp' });
  }

  const zip = new JSZip();
  for (let i = 1; i <= pdf.numPages; i++) {
    if (ctx.signal.aborted) throw new Error('Cancelled');
    ctx.progress({
      label: `Page ${i} of ${pdf.numPages}`,
      value: (i - 1) / pdf.numPages,
    });
    const page = await pdf.getPage(i);
    const blob = await renderPageToBlob(page, scale, 'image/bmp');
    zip.file(`page_${i}.bmp`, blob);
  }

  ctx.progress({ label: 'Creating ZIP file', value: 0.95 });
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return new File([zipBlob], bmpZipName(file.name), {
    type: 'application/zip',
  });
}
