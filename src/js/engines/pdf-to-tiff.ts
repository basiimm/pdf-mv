// Pure engine for the pdf-to-tiff tool. See docs/TOOL-MIGRATION-GUIDE.md.
import JSZip from 'jszip';
import type Vips from 'wasm-vips';
import wasmUrl from 'wasm-vips/vips.wasm?url';
import type { PDFPageProxy } from 'pdfjs-dist';
import { getPDFDocument, getCleanPdfFilename } from '../utils/helpers.js';
import '../utils/setup-pdf-worker.js';

export interface PdfToTiffOptions {
  dpi: number;
  compression: string;
  colorMode: string;
  multiPage: boolean;
}

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

let vipsInstance: typeof Vips | null = null;

async function getVips(): Promise<typeof Vips> {
  if (vipsInstance) return vipsInstance;
  const VipsInit = (await import('wasm-vips')).default;
  vipsInstance = await VipsInit({
    dynamicLibraries: [],
    locateFile: (fileName: string) =>
      fileName.endsWith('.wasm') ? wasmUrl : fileName,
  });
  vipsInstance.Cache.max(0);
  return vipsInstance;
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

async function renderPageToRgba(
  page: PDFPageProxy,
  dpi: number
): Promise<{ rgba: Uint8ClampedArray; width: number; height: number }> {
  const scale = dpi / 72;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Failed to acquire a 2D canvas context.');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: context, viewport, canvas }).promise;

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { width, height } = canvas;
  page.cleanup();
  canvas.width = 0;
  canvas.height = 0;
  return { rgba: imageData.data, width, height };
}

/** Predictor to use for a given compression, matching legacy defaults. */
export function predictorFor(
  vips: typeof Vips,
  compression: string
): Vips.Enum {
  return compression === 'lzw' || compression === 'deflate'
    ? vips.ForeignTiffPredictor.horizontal
    : vips.ForeignTiffPredictor.none;
}

function buildTiffSaveOptions(
  vips: typeof Vips,
  options: PdfToTiffOptions,
  extra: Record<string, unknown> = {}
): Parameters<Vips.Image['tiffsaveBuffer']>[0] {
  const tiffOptions: Parameters<Vips.Image['tiffsaveBuffer']>[0] = {
    compression: options.compression as Vips.Enum,
    resunit: vips.ForeignTiffResunit.inch,
    xres: options.dpi / 25.4,
    yres: options.dpi / 25.4,
    predictor: predictorFor(vips, options.compression),
    ...extra,
  };
  if (options.colorMode === 'bw') tiffOptions.bitdepth = 1;
  if (options.compression === 'jpeg') tiffOptions.Q = 85;
  return tiffOptions;
}

function encodePageToTiff(
  vips: typeof Vips,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: PdfToTiffOptions
): Uint8Array {
  const intermediates: Vips.Image[] = [];
  const track = (img: Vips.Image): Vips.Image => {
    intermediates.push(img);
    return img;
  };
  try {
    let image = track(
      vips.Image.newFromMemory(
        new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength),
        width,
        height,
        4,
        vips.BandFormat.uchar
      )
    );
    image = track(image.copy());
    const pixelsPerMm = options.dpi / 25.4;
    image.setDouble('xres', pixelsPerMm);
    image.setDouble('yres', pixelsPerMm);

    if (image.bands === 4)
      image = track(image.flatten({ background: [255, 255, 255] }));
    if (options.colorMode === 'greyscale' || options.colorMode === 'bw') {
      image = track(image.colourspace(vips.Interpretation.b_w));
    }

    return image.tiffsaveBuffer(buildTiffSaveOptions(vips, options));
  } finally {
    for (const img of intermediates) if (!img.isDeleted()) img.delete();
  }
}

export async function pdfToTiff(
  file: File,
  options: PdfToTiffOptions,
  ctx: EngineContext
): Promise<File> {
  ctx.progress({ label: 'Loading engine…' });
  const vips = await getVips();

  const buffer = await file.arrayBuffer();
  let pdf;
  try {
    pdf = await getPDFDocument(buffer.slice(0)).promise;
  } catch (error) {
    rethrowIfPassword(error);
  }

  const baseName = getCleanPdfFilename(file.name);

  if (options.multiPage && pdf.numPages > 1) {
    const pages: Vips.Image[] = [];
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        if (ctx.signal.aborted) throw new Error('Cancelled');
        ctx.progress({
          label: `Page ${i} of ${pdf.numPages}`,
          value: (i - 1) / pdf.numPages,
        });
        const page = await pdf.getPage(i);
        const { rgba, width, height } = await renderPageToRgba(
          page,
          options.dpi
        );

        const intermediates: Vips.Image[] = [];
        const track = (image: Vips.Image): Vips.Image => {
          intermediates.push(image);
          return image;
        };
        try {
          let img = track(
            vips.Image.newFromMemory(
              new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength),
              width,
              height,
              4,
              vips.BandFormat.uchar
            )
          );
          if (img.bands === 4)
            img = track(img.flatten({ background: [255, 255, 255] }));
          if (options.colorMode === 'greyscale' || options.colorMode === 'bw') {
            img = track(img.colourspace(vips.Interpretation.b_w));
          }
          pages.push(img.copyMemory());
        } finally {
          for (const img of intermediates) if (!img.isDeleted()) img.delete();
        }
      }

      const firstPage = pages[0];
      let joined = firstPage;
      if (pages.length > 1) joined = vips.Image.arrayjoin(pages, { across: 1 });

      try {
        const buf = joined.tiffsaveBuffer(
          buildTiffSaveOptions(vips, options, { page_height: firstPage.height })
        );
        return new File([new Uint8Array(buf)], `${baseName}.tiff`, {
          type: 'image/tiff',
        });
      } finally {
        if (joined !== firstPage && !joined.isDeleted()) joined.delete();
      }
    } finally {
      for (const p of pages) if (!p.isDeleted()) p.delete();
    }
  }

  if (pdf.numPages === 1) {
    ctx.progress({ label: 'Rendering page', value: 0.5 });
    const page = await pdf.getPage(1);
    const { rgba, width, height } = await renderPageToRgba(page, options.dpi);
    const buf = encodePageToTiff(vips, rgba, width, height, options);
    return new File([new Uint8Array(buf)], `${baseName}.tiff`, {
      type: 'image/tiff',
    });
  }

  const zip = new JSZip();
  for (let i = 1; i <= pdf.numPages; i++) {
    if (ctx.signal.aborted) throw new Error('Cancelled');
    ctx.progress({
      label: `Page ${i} of ${pdf.numPages}`,
      value: (i - 1) / pdf.numPages,
    });
    const page = await pdf.getPage(i);
    const { rgba, width, height } = await renderPageToRgba(page, options.dpi);
    const buf = encodePageToTiff(vips, rgba, width, height, options);
    zip.file(`page_${i}.tiff`, new Uint8Array(buf));
  }
  ctx.progress({ label: 'Creating ZIP file', value: 0.95 });
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return new File([zipBlob], `${baseName}-images.zip`, {
    type: 'application/zip',
  });
}
