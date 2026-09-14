// Pure engine for the extract-images tool. See docs/TOOL-MIGRATION-GUIDE.md.
import JSZip from 'jszip';
import { loadPyMuPDF, isPyMuPDFAvailable } from '../utils/pymupdf-loader.js';
import { getCleanPdfFilename } from '../utils/helpers.js';

export interface ExtractImagesOptions {
  [key: string]: never;
}

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

export function imagesZipName(baseName: string): string {
  return `${getCleanPdfFilename(baseName)}-images.zip`;
}

export async function extractImages(
  file: File,
  _options: ExtractImagesOptions,
  ctx: EngineContext
): Promise<File | File[]> {
  if (!isPyMuPDFAvailable()) {
    throw new Error(
      'The PyMuPDF WASM engine is not configured. Configure it in WASM Settings.'
    );
  }
  ctx.progress({ label: 'Loading engine…' });
  const pymupdf = await loadPyMuPDF();

  ctx.progress({ label: 'Extracting images…' });
  const doc = await pymupdf.open(file);
  const pageCount = doc.pageCount;

  const images: { data: Uint8Array; name: string }[] = [];
  let counter = 0;

  for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
    if (ctx.signal.aborted) throw new Error('Cancelled');
    ctx.progress({
      label: `Page ${pageIdx + 1} of ${pageCount}`,
      value: pageIdx / pageCount,
    });
    const page = doc.getPage(pageIdx);
    for (const imgInfo of page.getImages()) {
      try {
        const imgData = page.extractImage(imgInfo.xref);
        if (imgData && imgData.data) {
          counter++;
          images.push({
            data: imgData.data,
            name: `image_${counter}.${imgData.ext || 'png'}`,
          });
        }
      } catch {
        // Skip images that fail to extract, matching legacy behavior.
      }
    }
  }
  doc.close();

  if (images.length === 0)
    throw new Error('No embedded images were found in this PDF.');

  if (images.length === 1) {
    return new File([new Uint8Array(images[0].data)], images[0].name);
  }

  ctx.progress({ label: 'Creating ZIP file', value: 0.95 });
  const zip = new JSZip();
  for (const img of images) zip.file(img.name, img.data);
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return new File([zipBlob], imagesZipName(file.name), {
    type: 'application/zip',
  });
}
