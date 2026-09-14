// Pure engine for the Flatten PDF tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/flatten-pdf-page.ts. No DOM, no showAlert/showLoader.
import { flattenAnnotations } from '../utils/flatten-annotations.js';
import { loadPdfDocument } from '../utils/load-pdf-document.js';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface FlattenPdfOptions {}

export const defaultFlattenPdfOptions: FlattenPdfOptions = {};

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

export async function flattenPdf(
  file: File,
  _options: FlattenPdfOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  ctx.progress({ label: 'Flattening PDF…' });
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(arrayBuffer);

  try {
    pdfDoc.getForm().flatten();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes('getForm')) throw e;
  }

  try {
    flattenAnnotations(pdfDoc);
  } catch (e: unknown) {
    console.warn('[flatten-pdf] Could not flatten annotations:', e);
  }

  const newPdfBytes = await pdfDoc.save();
  return new File(
    [new Uint8Array(newPdfBytes)],
    `${baseName(file.name)}-flattened.pdf`,
    {
      type: 'application/pdf',
    }
  );
}
