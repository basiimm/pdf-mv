// Pure engine for the Compress PDF tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/compress-pdf-page.ts. No DOM, no showAlert/showLoader.
import { PDFDocument } from 'pdf-lib';
import { loadPyMuPDF } from '../utils/pymupdf-loader.js';

export type CompressLevel = 'light' | 'balanced' | 'aggressive' | 'extreme';
export type CompressAlgorithm = 'condense' | 'photon';

export interface CompressPdfOptions {
  algorithm: CompressAlgorithm;
  level: CompressLevel;
  imageQuality?: number;
  dpiTarget?: number;
  dpiThreshold?: number;
  removeMetadata?: boolean;
  subsetFonts?: boolean;
  convertToGrayscale?: boolean;
  removeThumbnails?: boolean;
}

export const defaultCompressOptions: CompressPdfOptions = {
  algorithm: 'condense',
  level: 'balanced',
};

const CONDENSE_PRESETS: Record<
  CompressLevel,
  {
    images: { quality: number; dpiTarget: number; dpiThreshold: number };
    scrub: { metadata: boolean; thumbnails: boolean; xmlMetadata?: boolean };
    subsetFonts: boolean;
  }
> = {
  light: {
    images: { quality: 90, dpiTarget: 150, dpiThreshold: 200 },
    scrub: { metadata: false, thumbnails: true },
    subsetFonts: true,
  },
  balanced: {
    images: { quality: 75, dpiTarget: 96, dpiThreshold: 150 },
    scrub: { metadata: true, thumbnails: true },
    subsetFonts: true,
  },
  aggressive: {
    images: { quality: 50, dpiTarget: 72, dpiThreshold: 100 },
    scrub: { metadata: true, thumbnails: true, xmlMetadata: true },
    subsetFonts: true,
  },
  extreme: {
    images: { quality: 30, dpiTarget: 60, dpiThreshold: 96 },
    scrub: { metadata: true, thumbnails: true, xmlMetadata: true },
    subsetFonts: true,
  },
};

const PHOTON_PRESETS: Record<
  CompressLevel,
  { scale: number; quality: number }
> = {
  light: { scale: 2.0, quality: 0.85 },
  balanced: { scale: 1.5, quality: 0.65 },
  aggressive: { scale: 1.2, quality: 0.45 },
  extreme: { scale: 1.0, quality: 0.25 },
};

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

function isPasswordError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /password/i.test(msg) || /PasswordException/i.test(msg);
}

async function runCondense(
  file: File,
  options: CompressPdfOptions,
  progress: (p: { label: string; value?: number; detail?: string }) => void
): Promise<Uint8Array> {
  progress({ label: 'Loading engine…' });
  const pymupdf = await loadPyMuPDF();

  const preset = CONDENSE_PRESETS[options.level] ?? CONDENSE_PRESETS.balanced;
  const dpiTarget = options.dpiTarget ?? preset.images.dpiTarget;
  const userThreshold = options.dpiThreshold ?? preset.images.dpiThreshold;
  const dpiThreshold = Math.max(userThreshold, dpiTarget + 10);

  const pymupdfOptions = {
    images: {
      enabled: true,
      quality: options.imageQuality ?? preset.images.quality,
      dpiTarget,
      dpiThreshold,
      convertToGray: options.convertToGrayscale ?? false,
    },
    scrub: {
      metadata: options.removeMetadata ?? preset.scrub.metadata,
      thumbnails: options.removeThumbnails ?? preset.scrub.thumbnails,
      xmlMetadata: preset.scrub.xmlMetadata ?? false,
    },
    subsetFonts: options.subsetFonts ?? preset.subsetFonts,
    save: { garbage: 4 as const, deflate: true, clean: true, useObjstms: true },
  };

  progress({ label: 'Compressing…' });
  try {
    const result = await pymupdf.compressPdf(file, pymupdfOptions);
    return new Uint8Array(await result.blob.arrayBuffer());
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('PatternType') || message.includes('pattern')) {
      const fallback = {
        ...pymupdfOptions,
        images: { ...pymupdfOptions.images, enabled: false },
      };
      const result = await pymupdf.compressPdf(file, fallback);
      return new Uint8Array(await result.blob.arrayBuffer());
    }
    throw new Error(`PDF compression failed: ${message}`, { cause: error });
  }
}

async function runPhoton(
  file: File,
  options: CompressPdfOptions,
  progress: (p: { label: string; value?: number; detail?: string }) => void
): Promise<Uint8Array> {
  const pdfjsLib = await import('pdfjs-dist');
  await import('../utils/setup-pdf-worker.js');

  const arrayBuffer = await file.arrayBuffer();
  let pdfJsDoc;
  try {
    pdfJsDoc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) })
      .promise;
  } catch (e: unknown) {
    if (isPasswordError(e)) {
      throw new Error(
        'This PDF requires a password before it can be compressed.',
        { cause: e }
      );
    }
    throw e;
  }

  const settings = PHOTON_PRESETS[options.level] ?? PHOTON_PRESETS.balanced;
  const newPdfDoc = await PDFDocument.create();

  for (let i = 1; i <= pdfJsDoc.numPages; i++) {
    progress({
      label: 'Compressing…',
      value: i / pdfJsDoc.numPages,
      detail: `Page ${i}/${pdfJsDoc.numPages}`,
    });
    const page = await pdfJsDoc.getPage(i);
    const viewport = page.getViewport({ scale: settings.scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context!, viewport, canvas }).promise;

    const jpegBlob = await new Promise<Blob>((resolve) =>
      canvas.toBlob(
        (blob) => resolve(blob as Blob),
        'image/jpeg',
        settings.quality
      )
    );
    const jpegBytes = await jpegBlob.arrayBuffer();
    const jpegImage = await newPdfDoc.embedJpg(jpegBytes);
    const newPage = newPdfDoc.addPage([viewport.width, viewport.height]);
    newPage.drawImage(jpegImage, {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height,
    });
  }

  return newPdfDoc.save();
}

export async function compressPdf(
  file: File,
  options: CompressPdfOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  const bytes =
    options.algorithm === 'photon'
      ? await runPhoton(file, options, ctx.progress)
      : await runCondense(file, options, ctx.progress);

  if (ctx.signal.aborted) throw new Error('Cancelled');

  return new File(
    [new Uint8Array(bytes)],
    `${baseName(file.name)}-compressed.pdf`,
    {
      type: 'application/pdf',
    }
  );
}
