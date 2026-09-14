// Pure engine for the pdf-to-cbz tool. See docs/TOOL-MIGRATION-GUIDE.md.
import JSZip from 'jszip';
import type { PDFPageProxy } from 'pdfjs-dist';
import { getPDFDocument, getCleanPdfFilename } from '../utils/helpers.js';
import {
  generateComicInfoXml,
  generateMetadataOpf,
  generateComicBookInfoJson,
} from '../utils/comic-info.js';
import type { CbzOptions, ComicMetadata } from '@/types';
import '../utils/setup-pdf-worker.js';

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

export function mimeTypeFor(format: CbzOptions['imageFormat']): string {
  return { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[format];
}

export function extensionFor(format: CbzOptions['imageFormat']): string {
  return { jpeg: 'jpg', png: 'png', webp: 'webp' }[format];
}

async function renderPage(
  page: PDFPageProxy,
  options: CbzOptions
): Promise<Blob> {
  const viewport = page.getViewport({ scale: options.scale });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Failed to acquire a 2D canvas context.');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: context, viewport, canvas }).promise;

  if (options.grayscale) {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
    context.putImageData(imageData, 0, 0);
  }

  const mimeType = mimeTypeFor(options.imageFormat);
  const quality = options.imageFormat === 'png' ? undefined : options.quality;
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mimeType, quality)
  );
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error('Failed to encode the page as an image.');
  return blob;
}

export async function pdfToCbz(
  file: File,
  options: CbzOptions,
  ctx: EngineContext
): Promise<File> {
  const buffer = await file.arrayBuffer();
  let pdf;
  try {
    pdf = await getPDFDocument(buffer.slice(0)).promise;
  } catch (error) {
    rethrowIfPassword(error);
  }
  if (pdf.numPages === 0) throw new Error('PDF has no pages');

  const zip = new JSZip();
  const ext = extensionFor(options.imageFormat);
  const padLength = String(pdf.numPages).length;

  for (let i = 1; i <= pdf.numPages; i++) {
    if (ctx.signal.aborted) throw new Error('Cancelled');
    ctx.progress({
      label: `Page ${i} of ${pdf.numPages}`,
      value: (i - 1) / pdf.numPages,
    });
    const page = await pdf.getPage(i);
    const blob = await renderPage(page, options);
    const pageNum = String(i).padStart(padLength, '0');
    zip.file(`${pageNum}.${ext}`, blob);
  }

  let zipComment = '';
  if (options.includeMetadata) {
    const meta: ComicMetadata = {
      title: options.title || getCleanPdfFilename(file.name),
      series: options.series || undefined,
      number: options.number || undefined,
      volume: options.volume || undefined,
      writer: options.author || undefined,
      publisher: options.publisher || undefined,
      genre: options.tags || undefined,
      year: options.year || undefined,
      communityRating: options.rating || undefined,
      pageCount: pdf.numPages,
      manga: options.manga,
      blackAndWhite: options.grayscale,
    };
    zip.file('ComicInfo.xml', generateComicInfoXml(meta));
    zip.file('metadata.opf', generateMetadataOpf(meta));
    zipComment = generateComicBookInfoJson(meta);
  }

  ctx.progress({ label: 'Creating CBZ file', value: 0.95 });
  const cbzBlob = await zip.generateAsync({
    type: 'blob',
    comment: zipComment || undefined,
  });
  return new File([cbzBlob], `${getCleanPdfFilename(file.name)}.cbz`, {
    type: 'application/vnd.comicbook+zip',
  });
}
