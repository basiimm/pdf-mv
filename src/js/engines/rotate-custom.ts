// Pure engine for the Rotate Custom tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/rotate-custom-page.ts. No DOM, no showAlert/showLoader.
// Simplified to a single uniform angle for the chosen pages (the legacy page
// let each page carry its own angle, which needs a per-page thumbnail UI the
// shared panel doesn't provide).
import { PDFDocument, degrees } from 'pdf-lib';
import { loadPdfDocument } from '../utils/load-pdf-document.js';
import { parsePageRanges } from '../utils/helpers.js';

export interface RotateCustomOptions {
  /** Degrees, -180 to 180. */
  angle?: string;
  /** Page range to rotate; blank = all pages. */
  pages?: string;
}

export const defaultRotateCustomOptions: RotateCustomOptions = {
  angle: '0',
  pages: '',
};

export async function rotateCustom(
  file: File,
  options: RotateCustomOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  const angle = Math.max(
    -180,
    Math.min(180, Math.round(Number(options.angle) || 0))
  );
  if (angle === 0) {
    throw new Error('Enter a rotation angle other than 0.');
  }

  ctx.progress({ label: 'Rotating pages…' });
  const bytes = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(bytes);
  const totalPages = pdfDoc.getPageCount();
  const targets = new Set(parsePageRanges(options.pages || '', totalPages));

  const newDoc = await PDFDocument.create();
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    if (ctx.signal.aborted) throw new Error('Cancelled');
    ctx.progress({ label: 'Rotating pages…', value: (i + 1) / pages.length });
    const originalPage = pages[i];

    if (!targets.has(i)) {
      const [copied] = await newDoc.copyPages(pdfDoc, [i]);
      newDoc.addPage(copied);
      continue;
    }

    const currentRotation = originalPage.getRotation().angle;
    const totalRotation = currentRotation + angle;

    if (totalRotation % 90 === 0) {
      const [copied] = await newDoc.copyPages(pdfDoc, [i]);
      copied.setRotation(degrees(totalRotation));
      newDoc.addPage(copied);
    } else {
      const embeddedPage = await newDoc.embedPage(originalPage);
      const { width, height } = embeddedPage.scale(1);

      const angleRad = (totalRotation * Math.PI) / 180;
      const absCos = Math.abs(Math.cos(angleRad));
      const absSin = Math.abs(Math.sin(angleRad));
      const newWidth = width * absCos + height * absSin;
      const newHeight = width * absSin + height * absCos;

      const newPage = newDoc.addPage([newWidth, newHeight]);
      const x =
        newWidth / 2 -
        ((width / 2) * Math.cos(angleRad) - (height / 2) * Math.sin(angleRad));
      const y =
        newHeight / 2 -
        ((width / 2) * Math.sin(angleRad) + (height / 2) * Math.cos(angleRad));

      newPage.drawPage(embeddedPage, {
        x,
        y,
        width,
        height,
        rotate: degrees(totalRotation),
      });
    }
  }

  const outBytes = await newDoc.save();
  return new File([new Uint8Array(outBytes)], file.name, {
    type: 'application/pdf',
  });
}
