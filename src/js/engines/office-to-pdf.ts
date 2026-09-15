// Shared LibreOffice-WASM engine for the office/ODF members of the
// create-pdf family: word, excel, powerpoint, odt, ods, odp, odg, rtf,
// wpd, wps, pages, pub, vsd-to-pdf. See docs/TOOL-MIGRATION-GUIDE.md.
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import {
  getLibreOfficeConverter,
  type LoadProgress,
} from '../utils/libreoffice-loader.js';
import type { ToolProgress } from '../tools/types.js';
import { pdfOutputName } from './pdf-output-name.js';

interface EngineCtx {
  signal: AbortSignal;
  progress(update: ToolProgress): void;
}

function checkAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
}

/**
 * Converts one or more office/ODF documents to PDF via the LibreOffice WASM
 * converter, merging every result into a single PDF in input order (the
 * legacy pages zipped separate PDFs; the panel's `new-document` output is a
 * single PDF, so multi-file input is combined instead).
 */
export async function convertOfficeToPdf(
  files: File[],
  ctx: EngineCtx
): Promise<File> {
  checkAborted(ctx.signal);
  const converter = getLibreOfficeConverter();
  ctx.progress({ label: 'Loading converter…', value: 0 });
  await converter.initialize((p: LoadProgress) => {
    ctx.progress({
      label: 'Loading converter…',
      value: (p.percent || 0) / 100,
      detail: p.message,
    });
  });

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
      pdfBlob = await converter.convertToPdf(file);
    } catch (cause) {
      throw new Error(
        `Could not convert "${file.name}". The file may be corrupted or password-protected.`,
        {
          cause,
        }
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
