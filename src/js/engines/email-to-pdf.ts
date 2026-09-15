// Engine for email-to-pdf. See docs/TOOL-MIGRATION-GUIDE.md.
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import { loadPyMuPDF } from '../utils/pymupdf-loader.js';
import type { PyMuPDFInstance } from '@/types';
import type { ToolProgress } from '../tools/types.js';
import { parseEmailFile, renderEmailToHtml } from '../logic/email-to-pdf.js';
import { pdfOutputName } from './pdf-output-name.js';

interface EngineCtx {
  signal: AbortSignal;
  progress(update: ToolProgress): void;
}

export interface EmailToPdfOptions {
  pageSize?: 'a4' | 'letter' | 'legal';
  includeCcBcc?: boolean;
  includeAttachments?: boolean;
}

function checkAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
}

/**
 * email-to-pdf: parse .eml/.msg (src/js/logic/email-to-pdf.ts, already
 * pure), render to HTML, then PyMuPDF's htmlToPdf. Multiple files combine
 * into one PDF in order (legacy zipped separate PDFs).
 */
export async function convertEmailToPdf(
  files: File[],
  options: EmailToPdfOptions,
  ctx: EngineCtx
): Promise<File> {
  checkAborted(ctx.signal);
  ctx.progress({ label: 'Loading converter…', value: 0 });
  const pymupdf = (await loadPyMuPDF()) as PyMuPDFInstance;

  const pageSize = options.pageSize ?? 'a4';
  const includeCcBcc = options.includeCcBcc ?? true;
  const includeAttachments = options.includeAttachments ?? true;

  const pdfDoc = await PDFLibDocument.create();
  for (let i = 0; i < files.length; i++) {
    checkAborted(ctx.signal);
    const file = files[i];
    ctx.progress({
      label: `File ${i + 1} of ${files.length}`,
      value: i / files.length,
      detail: file.name,
    });

    let email;
    try {
      email = await parseEmailFile(file);
    } catch (cause) {
      throw new Error(
        `Could not read "${file.name}". The file may be corrupted.`,
        { cause }
      );
    }
    const html = renderEmailToHtml(email, {
      includeCcBcc,
      includeAttachments,
      pageSize,
    });
    const pdfBlob = await (
      pymupdf as unknown as {
        htmlToPdf: (html: string, options: unknown) => Promise<Blob>;
      }
    ).htmlToPdf(html, {
      pageSize,
      margins: { top: 50, right: 50, bottom: 50, left: 50 },
      attachments: email.attachments
        .filter((a) => a.content)
        .map((a) => ({ filename: a.filename, content: a.content! })),
    });
    const doc = await PDFLibDocument.load(await pdfBlob.arrayBuffer());
    for (const page of await pdfDoc.copyPages(doc, doc.getPageIndices()))
      pdfDoc.addPage(page);
  }

  const pdfBytes = await pdfDoc.save();
  return new File([new Uint8Array(pdfBytes)], pdfOutputName(files), {
    type: 'application/pdf',
  });
}
