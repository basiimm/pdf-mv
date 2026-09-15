// Pure engines for the image-based members of the create-pdf family:
// image-to-pdf, bmp-to-pdf, heic-to-pdf, tiff-to-pdf, svg-to-pdf, psd-to-pdf.
// See docs/TOOL-MIGRATION-GUIDE.md.
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import heic2any from 'heic2any';
import { decode as decodeTiff } from 'tiff';
import type { ToolProgress } from '../tools/types.js';
import {
  compressImageBytes,
  compressImageFile,
  type ImageQuality,
} from '../utils/image-compress.js';
import { preprocessImageFile } from '../utils/image-input-utils.js';
import { tiffIfdToRgba } from '../utils/tiff-utils.js';
import { loadPyMuPDF } from '../utils/pymupdf-loader.js';
import type { PyMuPDFInstance } from '@/types';
import { pdfOutputName } from './pdf-output-name.js';

export { pdfOutputName };

export interface ImagesToPdfOptions {
  quality?: ImageQuality;
}

interface EngineCtx {
  signal: AbortSignal;
  progress(update: ToolProgress): void;
}

export function isValidQuality(value: string): value is ImageQuality {
  return value === 'high' || value === 'medium' || value === 'low';
}

function checkAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
}

async function canvasToBytes(
  img: HTMLImageElement,
  width: number,
  height: number,
  background: 'white' | 'transparent' = 'transparent'
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');
  if (background === 'white') {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
      'image/png'
    );
  });
  return new Uint8Array(await blob.arrayBuffer());
}

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(
          new Error(
            `Could not decode "${file.name}". The file may be corrupted.`
          )
        );
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function addRasterPage(
  pdfDoc: PDFLibDocument,
  bytes: Uint8Array,
  format: 'jpeg' | 'png'
): Promise<void> {
  const image =
    format === 'jpeg'
      ? await pdfDoc.embedJpg(bytes)
      : await pdfDoc.embedPng(bytes);
  const page = pdfDoc.addPage([image.width, image.height]);
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: image.width,
    height: image.height,
  });
}

/**
 * bmp-to-pdf: browser-native BMP decode via <img>, embedded as PNG (matches
 * legacy behavior: no quality/compression option).
 */
export async function convertBmpToPdf(
  files: File[],
  ctx: EngineCtx
): Promise<File> {
  const pdfDoc = await PDFLibDocument.create();
  for (let i = 0; i < files.length; i++) {
    checkAborted(ctx.signal);
    const file = files[i];
    ctx.progress({
      label: `File ${i + 1} of ${files.length}`,
      value: i / files.length,
      detail: file.name,
    });
    const img = await loadImageElement(file);
    const bytes = await canvasToBytes(
      img,
      img.naturalWidth || img.width,
      img.naturalHeight || img.height
    );
    await addRasterPage(pdfDoc, bytes, 'png');
  }
  const pdfBytes = await pdfDoc.save();
  return new File([new Uint8Array(pdfBytes)], pdfOutputName(files), {
    type: 'application/pdf',
  });
}

/**
 * heic-to-pdf: heic2any decode to PNG, embedded directly (matches legacy:
 * no further compression).
 */
export async function convertHeicToPdf(
  files: File[],
  ctx: EngineCtx
): Promise<File> {
  const pdfDoc = await PDFLibDocument.create();
  for (let i = 0; i < files.length; i++) {
    checkAborted(ctx.signal);
    const file = files[i];
    ctx.progress({
      label: `File ${i + 1} of ${files.length}`,
      value: i / files.length,
      detail: file.name,
    });
    let result: Blob | Blob[];
    try {
      result = await heic2any({
        blob: file,
        toType: 'image/png',
        quality: 0.92,
      });
    } catch (cause) {
      throw new Error(
        `Could not process "${file.name}". The file may be corrupted.`,
        { cause }
      );
    }
    const pngBlob = Array.isArray(result) ? result[0] : result;
    const bytes = new Uint8Array(await pngBlob.arrayBuffer());
    await addRasterPage(pdfDoc, bytes, 'png');
  }
  const pdfBytes = await pdfDoc.save();
  return new File([new Uint8Array(pdfBytes)], pdfOutputName(files), {
    type: 'application/pdf',
  });
}

/**
 * tiff-to-pdf: decode via the `tiff` package (one page per IFD), then embed
 * as JPEG unless quality is "high" (matches legacy quality-to-format mapping).
 */
export async function convertTiffToPdf(
  files: File[],
  options: ImagesToPdfOptions,
  ctx: EngineCtx
): Promise<File> {
  const quality = options.quality ?? 'medium';
  const jpegQualityMap: Record<ImageQuality, number> = {
    high: 0.92,
    medium: 0.75,
    low: 0.5,
  };
  const useJpeg = quality !== 'high';
  const jpegQuality = jpegQualityMap[quality];

  const pdfDoc = await PDFLibDocument.create();
  for (let i = 0; i < files.length; i++) {
    checkAborted(ctx.signal);
    const file = files[i];
    ctx.progress({
      label: `File ${i + 1} of ${files.length}`,
      value: i / files.length,
      detail: file.name,
    });
    const tiffBytes = await file.arrayBuffer();
    let ifds: ReturnType<typeof decodeTiff>;
    try {
      ifds = decodeTiff(tiffBytes);
    } catch (cause) {
      throw new Error(
        `Could not process "${file.name}". The file may be corrupted.`,
        { cause }
      );
    }
    for (const ifd of ifds) {
      checkAborted(ctx.signal);
      const { width, height } = ifd;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const canvasCtx = canvas.getContext('2d');
      if (!canvasCtx) continue;
      const rgba = tiffIfdToRgba(
        ifd.data,
        width,
        height,
        ifd.samplesPerPixel || 1,
        ifd.type
      );
      const imageData = canvasCtx.createImageData(width, height);
      imageData.data.set(rgba);
      canvasCtx.putImageData(imageData, 0, 0);
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(
          res,
          useJpeg ? 'image/jpeg' : 'image/png',
          useJpeg ? jpegQuality : undefined
        )
      );
      if (!blob) continue;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await addRasterPage(pdfDoc, bytes, useJpeg ? 'jpeg' : 'png');
    }
  }
  const pdfBytes = await pdfDoc.save();
  return new File([new Uint8Array(pdfBytes)], pdfOutputName(files), {
    type: 'application/pdf',
  });
}

async function svgToPng(svgText: string): Promise<Uint8Array> {
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Failed to load SVG image'));
      i.src = url;
    });
    const width = img.naturalWidth || img.width || 800;
    const height = img.naturalHeight || img.height || 600;
    return await canvasToBytes(img, width, height, 'white');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** svg-to-pdf: rasterize via canvas, then compress per the quality option. */
export async function convertSvgToPdf(
  files: File[],
  options: ImagesToPdfOptions,
  ctx: EngineCtx
): Promise<File> {
  const quality = options.quality ?? 'medium';
  const pdfDoc = await PDFLibDocument.create();
  for (let i = 0; i < files.length; i++) {
    checkAborted(ctx.signal);
    const file = files[i];
    ctx.progress({
      label: `File ${i + 1} of ${files.length}`,
      value: i / files.length,
      detail: file.name,
    });
    try {
      const svgText = await file.text();
      const pngBytes = await svgToPng(svgText);
      const compressed = await compressImageBytes(pngBytes, quality);
      await addRasterPage(pdfDoc, compressed.bytes, compressed.type);
    } catch (cause) {
      throw new Error(
        `Could not process "${file.name}". The file may be corrupted.`,
        { cause }
      );
    }
  }
  const pdfBytes = await pdfDoc.save();
  return new File([new Uint8Array(pdfBytes)], pdfOutputName(files), {
    type: 'application/pdf',
  });
}

let pymupdf: PyMuPDFInstance | null = null;
async function ensurePyMuPDF(ctx: EngineCtx): Promise<PyMuPDFInstance> {
  if (!pymupdf) {
    ctx.progress({ label: 'Loading converter…' });
    pymupdf = (await loadPyMuPDF()) as PyMuPDFInstance;
  }
  return pymupdf;
}

/**
 * image-to-pdf: mixed image formats in one PDF, via PyMuPDF (matches legacy
 * image-to-pdf-page.ts: preprocess heic/webp, compress per quality, then
 * mupdf.imagesToPdf combines every page into one document).
 */
export async function convertImagesToPdf(
  files: File[],
  options: ImagesToPdfOptions,
  ctx: EngineCtx
): Promise<File> {
  const quality = options.quality ?? 'medium';
  const processed: File[] = [];
  for (let i = 0; i < files.length; i++) {
    checkAborted(ctx.signal);
    const file = files[i];
    ctx.progress({
      label: `File ${i + 1} of ${files.length}`,
      value: (i / files.length) * 0.5,
      detail: file.name,
    });
    const pre = await preprocessImageFile(file);
    processed.push(await compressImageFile(pre, quality));
  }
  const mupdf = await ensurePyMuPDF(ctx);
  ctx.progress({ label: 'Converting images to PDF…', value: 0.9 });
  const pdfBlob = await mupdf.imagesToPdf(processed);
  return new File([pdfBlob], pdfOutputName(files), { type: 'application/pdf' });
}

/** psd-to-pdf: PyMuPDF's native PSD support. */
export async function convertPsdToPdf(
  files: File[],
  ctx: EngineCtx
): Promise<File> {
  const mupdf = await ensurePyMuPDF(ctx);
  checkAborted(ctx.signal);
  if (files.length === 1) {
    ctx.progress({ label: `Converting ${files[0].name}…`, value: 0.5 });
    const pdfBlob = await mupdf.imageToPdf(files[0], { imageType: 'psd' });
    return new File([pdfBlob], pdfOutputName(files), {
      type: 'application/pdf',
    });
  }
  ctx.progress({ label: 'Converting files…', value: 0.5 });
  const pdfBlob = await mupdf.imagesToPdf(files);
  return new File([pdfBlob], pdfOutputName(files), { type: 'application/pdf' });
}
