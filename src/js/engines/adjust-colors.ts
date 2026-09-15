// Pure engine for the adjust-colors tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/adjust-colors-page.ts. No DOM queries, no showAlert/showLoader.
import { PDFDocument } from 'pdf-lib';
import { getPDFDocument } from '../utils/helpers.js';
import { applyColorAdjustments } from '../utils/image-effects.js';
import type { AdjustColorsSettings } from '../types/adjust-colors-type.js';
import '../utils/setup-pdf-worker.js';

export type AdjustColorsOptions = AdjustColorsSettings;

/** Same defaults as the legacy adjust-colors page. */
export const defaultAdjustColorsOptions: AdjustColorsOptions = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hueShift: 0,
  temperature: 0,
  tint: 0,
  gamma: 1.0,
  sepia: 0,
};

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

/** Render scale used when rasterizing each page (legacy: 2.0x). */
const RENDER_SCALE = 2.0;

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

export async function adjustColors(
  file: File,
  options: AdjustColorsOptions,
  ctx: EngineContext
): Promise<File> {
  const settings = options;
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
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const renderCanvas = document.createElement('canvas');
    const renderCtx = renderCanvas.getContext('2d');
    if (!renderCtx) throw new Error('Failed to acquire a 2D canvas context.');
    renderCanvas.width = viewport.width;
    renderCanvas.height = viewport.height;

    await page.render({
      canvasContext: renderCtx,
      viewport,
      canvas: renderCanvas,
    }).promise;

    const baseData = renderCtx.getImageData(
      0,
      0,
      renderCanvas.width,
      renderCanvas.height
    );

    const outputCanvas = document.createElement('canvas');
    applyColorAdjustments(baseData, outputCanvas, settings);

    const pngBlob = await new Promise<Blob | null>((resolve) =>
      outputCanvas.toBlob(resolve, 'image/png')
    );
    renderCanvas.width = 0;
    renderCanvas.height = 0;
    if (!pngBlob) throw new Error('Failed to encode the page as an image.');

    const pngBytes = await pngBlob.arrayBuffer();
    const pngImage = await newPdfDoc.embedPng(pngBytes);
    const origViewport = page.getViewport({ scale: 1.0 });
    const newPage = newPdfDoc.addPage([
      origViewport.width,
      origViewport.height,
    ]);
    newPage.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: origViewport.width,
      height: origViewport.height,
    });
    outputCanvas.width = 0;
    outputCanvas.height = 0;
  }

  ctx.progress({ label: 'Saving document', value: 0.98 });
  const resultBytes = await newPdfDoc.save();
  return new File([new Uint8Array(resultBytes)], file.name || 'document.pdf', {
    type: 'application/pdf',
  });
}
