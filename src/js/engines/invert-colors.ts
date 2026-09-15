// Pure engine for the invert-colors tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/invert-colors-page.ts. No DOM queries, no showAlert/showLoader.
import { PDFDocument } from 'pdf-lib';
import { getPDFDocument } from '../utils/helpers.js';
import { applyInvertColors } from '../utils/image-effects.js';
import '../utils/setup-pdf-worker.js';

export interface InvertColorsOptions {
  /** Render scale used when rasterizing each page. Legacy default: 1.5x. */
  scale?: number;
}

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

/** Render scale to use, defaulting to the legacy 1.5x. */
export function resolveScale(options: InvertColorsOptions): number {
  return options.scale && options.scale > 0 ? options.scale : 1.5;
}

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

export async function invertColors(
  file: File,
  options: InvertColorsOptions,
  ctx: EngineContext
): Promise<File> {
  const scale = resolveScale(options);
  const buffer = await file.arrayBuffer();
  let pdfjsDoc;
  try {
    pdfjsDoc = await getPDFDocument(buffer.slice(0)).promise;
  } catch (error) {
    rethrowIfPassword(error);
  }

  const newPdfDoc = await PDFDocument.create();

  for (let i = 1; i <= pdfjsDoc.numPages; i++) {
    if (ctx.signal.aborted) throw new Error('Cancelled');
    ctx.progress({
      label: `Page ${i} of ${pdfjsDoc.numPages}`,
      value: (i - 1) / pdfjsDoc.numPages,
    });

    const page = await pdfjsDoc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to acquire a 2D canvas context.');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport, canvas }).promise;

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    applyInvertColors(imageData);
    context.putImageData(imageData, 0, 0);

    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    );
    canvas.width = 0;
    canvas.height = 0;
    if (!pngBlob) throw new Error('Failed to encode the page as an image.');

    const pngBytes = await pngBlob.arrayBuffer();
    const pngImage = await newPdfDoc.embedPng(pngBytes);
    const newPage = newPdfDoc.addPage([viewport.width, viewport.height]);
    newPage.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height,
    });
  }

  ctx.progress({ label: 'Saving document', value: 0.98 });
  const resultBytes = await newPdfDoc.save();
  return new File([new Uint8Array(resultBytes)], file.name || 'document.pdf', {
    type: 'application/pdf',
  });
}
