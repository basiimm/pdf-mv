// Engines for the plain-text members of the create-pdf family: txt, csv,
// xml, json-to-pdf. See docs/TOOL-MIGRATION-GUIDE.md.
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import { jsPDF } from 'jspdf';
import { loadPyMuPDF } from '../utils/pymupdf-loader.js';
import type { PyMuPDFInstance } from '@/types';
import type { ToolProgress } from '../tools/types.js';
import { convertCsvToPdf } from '../utils/csv-to-pdf.js';
import { convertXmlToPdf } from '../utils/xml-to-pdf.js';
import { pdfOutputName } from './pdf-output-name.js';

interface EngineCtx {
  signal: AbortSignal;
  progress(update: ToolProgress): void;
}

function checkAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
}

async function mergePdfBlobs(blobs: Blob[]): Promise<Uint8Array> {
  const pdfDoc = await PDFLibDocument.create();
  for (const blob of blobs) {
    const doc = await PDFLibDocument.load(await blob.arrayBuffer());
    for (const page of await pdfDoc.copyPages(doc, doc.getPageIndices()))
      pdfDoc.addPage(page);
  }
  return new Uint8Array(await pdfDoc.save());
}

export interface TxtToPdfOptions {
  fontSize?: number;
  pageSize?: 'a4' | 'letter' | 'legal' | 'a3' | 'a5';
  fontName?: 'helv' | 'tiro' | 'cour' | 'times';
  textColor?: string;
}

/**
 * txt-to-pdf: PyMuPDF's textToPdf. Legacy joined every input file's text
 * into one document (not one PDF per file), which this preserves.
 */
export async function convertTxtToPdf(
  files: File[],
  options: TxtToPdfOptions,
  ctx: EngineCtx
): Promise<File> {
  checkAborted(ctx.signal);
  ctx.progress({ label: 'Loading converter…', value: 0 });
  const pymupdf = (await loadPyMuPDF()) as PyMuPDFInstance;

  let textContent = '';
  for (let i = 0; i < files.length; i++) {
    checkAborted(ctx.signal);
    ctx.progress({
      label: `File ${i + 1} of ${files.length}`,
      value: (i / files.length) * 0.5,
      detail: files[i].name,
    });
    textContent += (await files[i].text()) + '\n\n';
  }

  ctx.progress({ label: 'Creating PDF…', value: 0.75 });
  const pdfBlob = await pymupdf.textToPdf(textContent, {
    fontSize: options.fontSize ?? 12,
    pageSize: options.pageSize ?? 'a4',
    fontName: options.fontName ?? 'helv',
    textColor: options.textColor ?? '#000000',
    margins: 72,
  });
  return new File([pdfBlob], pdfOutputName(files), { type: 'application/pdf' });
}

/** csv-to-pdf: table rendering via jsPDF/autotable (src/js/utils/csv-to-pdf.ts). */
export async function convertCsvFilesToPdf(
  files: File[],
  ctx: EngineCtx
): Promise<File> {
  const blobs: Blob[] = [];
  for (let i = 0; i < files.length; i++) {
    checkAborted(ctx.signal);
    const file = files[i];
    ctx.progress({
      label: `File ${i + 1} of ${files.length}`,
      value: i / files.length,
      detail: file.name,
    });
    blobs.push(
      await convertCsvToPdf(file, {
        onProgress: (percent, message) =>
          ctx.progress({
            label: `File ${i + 1} of ${files.length}`,
            value: (i + percent / 100) / files.length,
            detail: message,
          }),
      })
    );
  }
  const bytes =
    blobs.length === 1
      ? new Uint8Array(await blobs[0].arrayBuffer())
      : await mergePdfBlobs(blobs);
  return new File([new Uint8Array(bytes)], pdfOutputName(files), {
    type: 'application/pdf',
  });
}

/** xml-to-pdf: table/property rendering via jsPDF/autotable (src/js/utils/xml-to-pdf.ts). */
export async function convertXmlFilesToPdf(
  files: File[],
  ctx: EngineCtx
): Promise<File> {
  const blobs: Blob[] = [];
  for (let i = 0; i < files.length; i++) {
    checkAborted(ctx.signal);
    const file = files[i];
    ctx.progress({
      label: `File ${i + 1} of ${files.length}`,
      value: i / files.length,
      detail: file.name,
    });
    blobs.push(
      await convertXmlToPdf(file, {
        onProgress: (percent, message) =>
          ctx.progress({
            label: `File ${i + 1} of ${files.length}`,
            value: (i + percent / 100) / files.length,
            detail: message,
          }),
      })
    );
  }
  const bytes =
    blobs.length === 1
      ? new Uint8Array(await blobs[0].arrayBuffer())
      : await mergePdfBlobs(blobs);
  return new File([new Uint8Array(bytes)], pdfOutputName(files), {
    type: 'application/pdf',
  });
}

/** Pretty-print JSON as monospace text, paginated with jsPDF. Pure/testable. */
export function renderJsonToPdfBlob(jsonText: string, fileLabel: string): Blob {
  let pretty = jsonText;
  try {
    pretty = JSON.stringify(JSON.parse(jsonText), null, 2);
  } catch {
    // Not valid JSON: fall back to rendering the raw text as-is.
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const marginX = 40;
  const marginTop = 50;
  const lineHeight = 12;
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(11);
  doc.setFont('courier', 'normal');
  doc.text(fileLabel, marginX, 30);
  doc.setFontSize(9);

  const maxWidth = pageWidth - marginX * 2;
  const lines = pretty
    .split('\n')
    .flatMap((line) => doc.splitTextToSize(line, maxWidth) as string[]);

  let y = marginTop;
  for (const line of lines) {
    if (y > pageHeight - 40) {
      doc.addPage();
      y = marginTop;
    }
    doc.text(line, marginX, y);
    y += lineHeight;
  }

  return doc.output('blob');
}

/**
 * json-to-pdf: pretty-printed monospace rendering of each file (a lighter
 * substitute for the legacy CPDF-worker pipeline, which required the
 * separately-configured CPDF WASM engine). Multiple files combine into one
 * PDF in order.
 */
export async function convertJsonToPdf(
  files: File[],
  ctx: EngineCtx
): Promise<File> {
  const blobs: Blob[] = [];
  for (let i = 0; i < files.length; i++) {
    checkAborted(ctx.signal);
    const file = files[i];
    ctx.progress({
      label: `File ${i + 1} of ${files.length}`,
      value: i / files.length,
      detail: file.name,
    });
    const text = await file.text();
    blobs.push(renderJsonToPdfBlob(text, file.name));
  }
  const bytes =
    blobs.length === 1
      ? new Uint8Array(await blobs[0].arrayBuffer())
      : await mergePdfBlobs(blobs);
  return new File([new Uint8Array(bytes)], pdfOutputName(files), {
    type: 'application/pdf',
  });
}
