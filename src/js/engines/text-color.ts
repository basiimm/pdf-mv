// Pure engine for the text-color tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/text-color-page.ts. No DOM queries, no showAlert/showLoader.
// Raster-based: pdf.js renders each page, dark pixels (a rough proxy for text)
// are recolored, and the page is re-embedded as an image. It does not touch
// the PDF's actual text objects.
import { PDFDocument } from 'pdf-lib';
import { getPDFDocument, hexToRgb } from '../utils/helpers.js';
import '../utils/setup-pdf-worker.js';

export interface TextColorOptions {
  /** Hex color to recolor dark pixels to. Legacy default: black. */
  color?: string;
  /** Pixels with all RGB channels below this are treated as "text". Legacy: 120. */
  darknessThreshold?: number;
  /** Render scale used when rasterizing each page. Legacy default: 2.0x. */
  scale?: number;
}

export const defaultTextColorOptions: TextColorOptions = {
  color: '#000000',
  darknessThreshold: 120,
  scale: 2.0,
};

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
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

export async function textColor(
  file: File,
  options: TextColorOptions,
  ctx: EngineContext
): Promise<File> {
  const { r, g, b } = hexToRgb(options.color || defaultTextColorOptions.color!);
  const darknessThreshold =
    options.darknessThreshold ?? defaultTextColorOptions.darknessThreshold!;
  const scale =
    options.scale && options.scale > 0
      ? options.scale
      : defaultTextColorOptions.scale!;

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
    const data = imageData.data;
    for (let j = 0; j < data.length; j += 4) {
      if (
        data[j] < darknessThreshold &&
        data[j + 1] < darknessThreshold &&
        data[j + 2] < darknessThreshold
      ) {
        data[j] = r * 255;
        data[j + 1] = g * 255;
        data[j + 2] = b * 255;
      }
    }
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
