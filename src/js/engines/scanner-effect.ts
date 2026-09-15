// Pure engine for the scanner-effect tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/scanner-effect-page.ts. No DOM queries, no showAlert/showLoader.
import { PDFDocument } from 'pdf-lib';
import { getPDFDocument } from '../utils/helpers.js';
import { applyScannerEffect } from '../utils/image-effects.js';
import type { ScanSettings } from '../types/scanner-effect-type.js';
import '../utils/setup-pdf-worker.js';

export type ScannerEffectOptions = ScanSettings;

/** Same defaults as the legacy scanner-effect page. */
export const defaultScannerEffectOptions: ScannerEffectOptions = {
  grayscale: false,
  border: false,
  rotate: 0,
  rotateVariance: 0,
  brightness: 0,
  contrast: 0,
  blur: 0,
  noise: 10,
  yellowish: 0,
  resolution: 150,
};

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
  /** Injection point for deterministic tests; defaults to Math.random. */
  random?: () => number;
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

/**
 * Legacy per-page rotation: `rotate` plus a random offset within
 * `+-rotateVariance` degrees. Pass `random` (0-1) for deterministic tests;
 * with `rotateVariance` at 0 the result is always exactly `rotate`.
 */
export function resolvePageRotation(
  settings: Pick<ScanSettings, 'rotate' | 'rotateVariance'>,
  random: () => number = Math.random
): number {
  return (
    settings.rotate +
    (settings.rotateVariance > 0
      ? (random() - 0.5) * 2 * settings.rotateVariance
      : 0)
  );
}

export async function scannerEffect(
  file: File,
  options: ScannerEffectOptions,
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
  const dpiScale = settings.resolution / 72;
  const random = ctx.random ?? Math.random;

  for (let i = 1; i <= pdfjsDoc.numPages; i++) {
    if (ctx.signal.aborted) throw new Error('Cancelled');
    ctx.progress({
      label: `Page ${i} of ${pdfjsDoc.numPages}`,
      value: (i - 1) / pdfjsDoc.numPages,
    });

    const page = await pdfjsDoc.getPage(i);
    const viewport = page.getViewport({ scale: dpiScale });
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
    const baselineCopy = new ImageData(
      new Uint8ClampedArray(baseData.data),
      baseData.width,
      baseData.height
    );

    const outputCanvas = document.createElement('canvas');
    const pageRotation = resolvePageRotation(settings, random);

    applyScannerEffect(
      baselineCopy,
      outputCanvas,
      settings,
      pageRotation,
      dpiScale
    );

    const jpegBlob = await new Promise<Blob | null>((resolve) =>
      outputCanvas.toBlob(resolve, 'image/jpeg', 0.85)
    );
    renderCanvas.width = 0;
    renderCanvas.height = 0;
    if (!jpegBlob) throw new Error('Failed to encode the page as an image.');

    const jpegBytes = await jpegBlob.arrayBuffer();
    const jpegImage = await newPdfDoc.embedJpg(jpegBytes);
    const newPage = newPdfDoc.addPage([
      outputCanvas.width,
      outputCanvas.height,
    ]);
    newPage.drawImage(jpegImage, {
      x: 0,
      y: 0,
      width: outputCanvas.width,
      height: outputCanvas.height,
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
