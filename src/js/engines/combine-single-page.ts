// Pure engine for the Combine to Single Page tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/combine-single-page-page.ts. No DOM queries,
// no showAlert/showLoader, no Tailwind strings.
import { PDFDocument, rgb } from 'pdf-lib';
import { getPDFDocument, hexToRgb } from '../utils/helpers.js';
import { loadPdfDocument } from '../utils/load-pdf-document.js';
import '../utils/setup-pdf-worker.js';

export type CombineOrientation = 'vertical' | 'horizontal';

export interface CombineSinglePageOptions {
  /** 'vertical' stacks pages top-to-bottom; 'horizontal' lays them left-to-right. */
  orientation?: CombineOrientation;
  /** Gap between pages, in points. */
  spacing?: number;
  backgroundColor?: string;
  addSeparator?: boolean;
  separatorThickness?: number;
  separatorColor?: string;
}

export const defaultCombineSinglePageOptions: CombineSinglePageOptions = {
  orientation: 'vertical',
  spacing: 0,
  backgroundColor: '#FFFFFF',
  addSeparator: false,
  separatorThickness: 0.5,
  separatorColor: '#000000',
};

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

export async function combineSinglePage(
  file: File,
  options: CombineSinglePageOptions,
  ctx: EngineContext
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  const orientation = options.orientation ?? 'vertical';
  const spacing = options.spacing ?? 0;
  const backgroundColorHex = options.backgroundColor ?? '#FFFFFF';
  const addSeparator = options.addSeparator ?? false;
  const separatorThickness = options.separatorThickness ?? 0.5;
  const separatorColorHex = options.separatorColor ?? '#000000';
  const backgroundColor = hexToRgb(backgroundColorHex);
  const separatorColor = hexToRgb(separatorColorHex);

  const buffer = await file.arrayBuffer();
  let sourceDoc: PDFDocument;
  try {
    sourceDoc = await loadPdfDocument(buffer);
  } catch (error) {
    throw error instanceof Error
      ? new Error(error.message, { cause: error })
      : new Error(String(error));
  }
  if (sourceDoc.isEncrypted) {
    throw new Error(
      'This PDF is password protected. Remove the password and try again.'
    );
  }

  const sourcePages = sourceDoc.getPages();
  if (sourcePages.length === 0) {
    throw new Error('This PDF has no pages to combine.');
  }

  const newDoc = await PDFDocument.create();
  const pdfBytes = await sourceDoc.save();

  let pdfjsDoc;
  try {
    pdfjsDoc = await getPDFDocument({ data: pdfBytes }).promise;
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }

  let maxWidth = 0;
  let maxHeight = 0;
  let totalWidth = 0;
  let totalHeight = 0;

  sourcePages.forEach((page) => {
    const { width, height } = page.getSize();
    if (width > maxWidth) maxWidth = width;
    if (height > maxHeight) maxHeight = height;
    totalWidth += width;
    totalHeight += height;
  });

  let finalWidth: number;
  let finalHeight: number;
  if (orientation === 'horizontal') {
    finalWidth = totalWidth + Math.max(0, sourcePages.length - 1) * spacing;
    finalHeight = maxHeight;
  } else {
    finalWidth = maxWidth;
    finalHeight = totalHeight + Math.max(0, sourcePages.length - 1) * spacing;
  }

  const newPage = newDoc.addPage([finalWidth, finalHeight]);

  if (backgroundColorHex.toUpperCase() !== '#FFFFFF') {
    newPage.drawRectangle({
      x: 0,
      y: 0,
      width: finalWidth,
      height: finalHeight,
      color: rgb(backgroundColor.r, backgroundColor.g, backgroundColor.b),
    });
  }

  let currentX = 0;
  let currentY = finalHeight;

  for (let i = 0; i < sourcePages.length; i++) {
    if (ctx.signal.aborted) throw new Error('Cancelled');
    ctx.progress({
      label: `Page ${i + 1} of ${sourcePages.length}`,
      value: i / sourcePages.length,
    });

    const sourcePage = sourcePages[i];
    const { width, height } = sourcePage.getSize();

    try {
      const page = await pdfjsDoc.getPage(i + 1);
      const scale = 2.0;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Failed to acquire a 2D canvas context.');

      await page.render({ canvasContext: context, viewport, canvas }).promise;

      const pngBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      );
      canvas.width = 0;
      canvas.height = 0;
      if (!pngBlob) throw new Error('Failed to encode the page as an image.');

      const pngBytes = await pngBlob.arrayBuffer();
      const pngImage = await newDoc.embedPng(pngBytes);

      if (orientation === 'horizontal') {
        const y = (finalHeight - height) / 2;
        newPage.drawImage(pngImage, { x: currentX, y, width, height });
      } else {
        currentY -= height;
        const x = (finalWidth - width) / 2;
        newPage.drawImage(pngImage, { x, y: currentY, width, height });
      }
    } catch (renderError) {
      console.warn(`Failed to render page ${i + 1}:`, renderError);
    }

    if (addSeparator && i < sourcePages.length - 1) {
      if (orientation === 'horizontal') {
        const lineX = currentX + width + spacing / 2;
        newPage.drawLine({
          start: { x: lineX, y: 0 },
          end: { x: lineX, y: finalHeight },
          thickness: separatorThickness,
          color: rgb(separatorColor.r, separatorColor.g, separatorColor.b),
        });
        currentX += width + spacing;
      } else {
        const lineY = currentY - spacing / 2;
        newPage.drawLine({
          start: { x: 0, y: lineY },
          end: { x: finalWidth, y: lineY },
          thickness: separatorThickness,
          color: rgb(separatorColor.r, separatorColor.g, separatorColor.b),
        });
        currentY -= spacing;
      }
    } else {
      if (orientation === 'horizontal') {
        currentX += width + spacing;
      } else {
        currentY -= spacing;
      }
    }
  }

  ctx.progress({ label: 'Saving document', value: 0.98 });
  const newPdfBytes = await newDoc.save();
  return new File([new Uint8Array(newPdfBytes)], file.name || 'document.pdf', {
    type: 'application/pdf',
  });
}
