// Pure engine for the Edit Metadata (Save metadata) tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/edit-metadata-page.ts. No DOM, no showAlert/showLoader.
//
// The panel prefills every field from the open document via `inspect()` (see
// readEditableMetadata below and the document-info family registration), so
// each field's value IS the new value: leaving a field blank clears it.
import { loadPdfDocument } from '../utils/load-pdf-document.js';
import { PDFName, PDFString } from 'pdf-lib';

export interface EditMetadataOptions {
  title?: string;
  author?: string;
  subject?: string;
  /** Comma-separated. */
  keywords?: string;
  creator?: string;
  producer?: string;
  /** One entry per line or separated by `;`, as `Key: value`. */
  customFields?: string;
}

export const defaultEditMetadataOptions: EditMetadataOptions = {
  title: '',
  author: '',
  subject: '',
  keywords: '',
  creator: '',
  producer: '',
  customFields: '',
};

const STANDARD_INFO_KEYS = new Set([
  'Title',
  'Author',
  'Subject',
  'Keywords',
  'Creator',
  'Producer',
  'CreationDate',
  'ModDate',
]);

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

/** Parses "Key: value" lines (separated by newlines or `;`) into pairs. */
export function parseCustomFields(text: string): Array<[string, string]> {
  return (text ?? '')
    .split(/[\n;]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): [string, string] => {
      const idx = line.indexOf(':');
      if (idx === -1) return [line, ''];
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    })
    .filter(([key]) => Boolean(key));
}

/** Formats existing custom info-dict entries back into "Key: value" lines. */
function formatCustomFields(pairs: Array<[string, string]>): string {
  return pairs.map(([key, value]) => `${key}: ${value}`).join('; ');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readCustomFields(pdfDoc: any): Array<[string, string]> {
  try {
    const infoDict = pdfDoc.getInfoDict();
    const keys = infoDict
      .keys()
      .map((k: { asString: () => string }) => k.asString().substring(1))
      .filter((k: string) => !STANDARD_INFO_KEYS.has(k));
    return keys.map((key: string) => {
      const raw = infoDict.lookup(PDFName.of(key));
      let value = '';
      if (raw && typeof raw.decodeText === 'function') value = raw.decodeText();
      else if (raw && typeof raw.asString === 'function')
        value = raw.asString();
      else if (raw) value = String(raw);
      return [key, value] as [string, string];
    });
  } catch {
    return [];
  }
}

/** Read current metadata to prefill the tool's fields (used by `inspect`). */
export async function readEditableMetadata(
  file: File
): Promise<{ values: Record<string, string> }> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(arrayBuffer);
  return {
    values: {
      title: pdfDoc.getTitle() ?? '',
      author: pdfDoc.getAuthor() ?? '',
      subject: pdfDoc.getSubject() ?? '',
      keywords: pdfDoc.getKeywords() ?? '',
      creator: pdfDoc.getCreator() ?? '',
      producer: pdfDoc.getProducer() ?? '',
      customFields: formatCustomFields(readCustomFields(pdfDoc)),
    },
  };
}

export async function editMetadata(
  file: File,
  options: EditMetadataOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  ctx.progress({ label: 'Updating metadata…' });
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(arrayBuffer);

  // Fields are prefilled with the current values, so the field value IS the
  // new value: blank clears it.
  pdfDoc.setTitle(options.title ?? '');
  pdfDoc.setAuthor(options.author ?? '');
  pdfDoc.setSubject(options.subject ?? '');
  pdfDoc.setCreator(options.creator ?? '');
  pdfDoc.setProducer(options.producer ?? '');
  pdfDoc.setKeywords(
    (options.keywords ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
  );

  if (options.customFields !== undefined) {
    // @ts-expect-error getInfoDict is private but accessible at runtime
    const infoDict = pdfDoc.getInfoDict();
    for (const [key] of readCustomFields(pdfDoc)) {
      infoDict.delete(PDFName.of(key));
    }
    for (const [key, value] of parseCustomFields(options.customFields)) {
      infoDict.set(PDFName.of(key), PDFString.of(value));
    }
  }

  pdfDoc.setModificationDate(new Date());

  const newPdfBytes = await pdfDoc.save();
  return new File([new Uint8Array(newPdfBytes)], `${baseName(file.name)}.pdf`, {
    type: 'application/pdf',
  });
}
