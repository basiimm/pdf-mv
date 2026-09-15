// Pure engine for the OCR PDF tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Wraps src/js/utils/ocr.ts (which we don't own for this migration) and
// reshapes its progress callback into the two phases the panel expects:
// "Loading language data…" then "Recognizing page N of M".
import { performOcr } from '../utils/ocr.js';
import { UnsupportedOcrLanguageError } from '../utils/tesseract-language-availability.js';

export interface OcrPdfOptions {
  languages: string[];
  resolution?: number;
  binarize?: boolean;
  embedFullFonts?: boolean;
  whitelist?: string;
}

export const defaultOcrPdfOptions: {
  resolution: number;
  binarize: boolean;
  embedFullFonts: boolean;
  whitelist: string;
} = {
  resolution: 3,
  binarize: false,
  embedFullFonts: false,
  whitelist: '',
};

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

/**
 * performOcr() has no cancellation hook, so we can only race its promise: the
 * returned promise rejects immediately on abort, even though the worker
 * keeps running in the background until performOcr's own finally block
 * terminates it.
 */
function raceWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('Cancelled'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('Cancelled'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

export async function ocrPdf(
  file: File,
  options: OcrPdfOptions,
  ctx: EngineContext
): Promise<File> {
  if (!options.languages || options.languages.length === 0) {
    throw new Error('Choose at least one OCR language.');
  }
  if (ctx.signal.aborted) throw new Error('Cancelled');

  const language = options.languages.join('+');
  const resolution = options.resolution ?? defaultOcrPdfOptions.resolution;
  const binarize = options.binarize ?? defaultOcrPdfOptions.binarize;
  const embedFullFonts =
    options.embedFullFonts ?? defaultOcrPdfOptions.embedFullFonts;
  const whitelist = options.whitelist ?? defaultOcrPdfOptions.whitelist;

  let sawPageProgress = false;
  let currentPage = 0;
  let totalPages = 0;

  const arrayBuffer = await file.arrayBuffer();

  let result;
  try {
    result = await raceWithAbort(
      performOcr(new Uint8Array(arrayBuffer), {
        language,
        resolution,
        binarize,
        whitelist,
        embedFullFonts,
        onProgress(status, value) {
          const pageMatch = /page (\d+) of (\d+)/i.exec(status);
          if (pageMatch) {
            sawPageProgress = true;
            currentPage = Number(pageMatch[1]);
            totalPages = Number(pageMatch[2]);
            ctx.progress({
              label: `Recognizing page ${currentPage} of ${totalPages}`,
              value: totalPages ? (currentPage - 1) / totalPages : undefined,
            });
            return;
          }
          if (!sawPageProgress) {
            ctx.progress({
              label: 'Loading language data…',
              value: value || undefined,
            });
            return;
          }
          if (totalPages > 0) {
            const pageFraction = Math.min(Math.max(value || 0, 0), 1);
            ctx.progress({
              label: `Recognizing page ${currentPage} of ${totalPages}`,
              value: (currentPage - 1 + pageFraction) / totalPages,
            });
          }
        },
      }),
      ctx.signal
    );
  } catch (error) {
    if (error instanceof UnsupportedOcrLanguageError) {
      throw new Error(error.message, { cause: error });
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'Cancelled') throw error;
    throw new Error(`Text recognition failed: ${message}`, { cause: error });
  }

  if (ctx.signal.aborted) throw new Error('Cancelled');

  return new File(
    [new Uint8Array(result.pdfBytes)],
    `${baseName(file.name)}-ocr.pdf`,
    { type: 'application/pdf' }
  );
}
