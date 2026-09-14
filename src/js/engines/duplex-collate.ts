// Pure engine for the Duplex Collate tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/duplex-collate-page.ts. No DOM, no showAlert/showLoader.
// Simplified to a single revision output: the legacy "export as grouped ZIP"
// option isn't expressible as a `revision` (single-file) output, so it's
// dropped here (see the family registration report).
import { PDFDocument } from 'pdf-lib';
import { loadPdfDocument } from '../utils/load-pdf-document.js';

export type DuplexBackOrder = 'reverse' | 'keep';

export interface DuplexCollateOptions {
  /** 1-based page to split fronts from backs. Blank = document midpoint. */
  splitPage?: string;
  backOrder?: DuplexBackOrder;
}

export const defaultDuplexCollateOptions: DuplexCollateOptions = {
  splitPage: '',
  backOrder: 'reverse',
};

/** Builds the final 0-based page order by interleaving front/back blocks. */
export function buildDuplexOrder(
  totalPages: number,
  splitPoint: number,
  backOrder: DuplexBackOrder
): { order: number[]; frontCount: number; backCount: number } {
  const fronts = Array.from({ length: splitPoint }, (_, i) => i);
  const backs = Array.from(
    { length: totalPages - splitPoint },
    (_, i) => splitPoint + i
  );
  if (backOrder === 'reverse') backs.reverse();

  const order: number[] = [];
  const pairCount = Math.max(fronts.length, backs.length);
  for (let i = 0; i < pairCount; i++) {
    if (fronts[i] !== undefined) order.push(fronts[i]);
    if (backs[i] !== undefined) order.push(backs[i]);
  }

  return { order, frontCount: fronts.length, backCount: backs.length };
}

export async function duplexCollate(
  file: File,
  options: DuplexCollateOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  ctx.progress({ label: 'Collating duplex scan…' });
  const bytes = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(bytes);
  const totalPages = pdfDoc.getPageCount();
  if (totalPages < 2) {
    throw new Error('The document needs at least 2 pages to collate.');
  }

  const parsedSplit = Number.parseInt(options.splitPage || '', 10);
  const splitPoint = Number.isFinite(parsedSplit)
    ? Math.max(1, Math.min(parsedSplit, totalPages - 1))
    : Math.ceil(totalPages / 2);
  const backOrder = options.backOrder === 'keep' ? 'keep' : 'reverse';

  const { order } = buildDuplexOrder(totalPages, splitPoint, backOrder);

  const outDoc = await PDFDocument.create();
  const copied = await outDoc.copyPages(pdfDoc, order);
  copied.forEach((page) => outDoc.addPage(page));

  const outBytes = await outDoc.save();
  return new File([new Uint8Array(outBytes)], file.name, {
    type: 'application/pdf',
  });
}
