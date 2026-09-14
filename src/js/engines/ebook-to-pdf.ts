// Shared PyMuPDF engine for the e-book/document members of the create-pdf
// family: xps, mobi, epub, fb2, cbz-to-pdf. See docs/TOOL-MIGRATION-GUIDE.md.
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import { loadPyMuPDF } from '../utils/pymupdf-loader.js';
import type { PyMuPDFInstance } from '@/types';
import type { ToolProgress } from '../tools/types.js';
import { pdfOutputName } from './pdf-output-name.js';

interface EngineCtx {
  signal: AbortSignal;
  progress(update: ToolProgress): void;
}

export type EbookFiletype = 'xps' | 'mobi' | 'epub' | 'fb2' | 'cbz';

function checkAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
}

/**
 * Converts one or more files of the given filetype to PDF via PyMuPDF,
 * merging results into a single PDF in input order (legacy pages zipped
 * separate PDFs for multi-file input; here output is one new document).
 */
export async function convertEbookToPdf(
  files: File[],
  filetype: EbookFiletype,
  ctx: EngineCtx
): Promise<File> {
  checkAborted(ctx.signal);
  ctx.progress({ label: 'Loading converter…', value: 0 });
  const pymupdf = (await loadPyMuPDF()) as PyMuPDFInstance;

  const pdfDoc = await PDFLibDocument.create();
  for (let i = 0; i < files.length; i++) {
    checkAborted(ctx.signal);
    const file = files[i];
    ctx.progress({
      label: `File ${i + 1} of ${files.length}`,
      value: i / files.length,
      detail: file.name,
    });
    let pdfBlob: Blob;
    try {
      pdfBlob = await pymupdf.convertToPdf(file, { filetype });
    } catch (cause) {
      throw new Error(
        `Could not convert "${file.name}". The file may be corrupted.`,
        { cause }
      );
    }
    const bytes = await pdfBlob.arrayBuffer();
    const doc = await PDFLibDocument.load(bytes);
    for (const page of await pdfDoc.copyPages(doc, doc.getPageIndices()))
      pdfDoc.addPage(page);
  }

  const pdfBytes = await pdfDoc.save();
  return new File([new Uint8Array(pdfBytes)], pdfOutputName(files), {
    type: 'application/pdf',
  });
}
