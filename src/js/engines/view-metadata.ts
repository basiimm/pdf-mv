// Pure engine for the View Metadata tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/view-metadata-page.ts. No DOM, no showAlert/showLoader.
// Read-only: the panel's `inspect` shows the document's info dictionary as
// details, and the primary action exports the same data as JSON.
import '../utils/setup-pdf-worker.js';

export interface DocumentMetadataResult {
  info: Record<string, unknown>;
  pdfVersion: string;
  pageCount: number;
  encrypted: boolean;
}

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object' && value !== null && 'name' in value)
    return String((value as { name: string }).name);
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[object]';
    }
  }
  return String(value);
}

export async function readDocumentMetadata(
  file: File
): Promise<DocumentMetadataResult> {
  const pdfjsLib = await import('pdfjs-dist');
  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  try {
    const { info } = await doc.getMetadata();
    const infoRecord = info as Record<string, unknown>;
    return {
      info: infoRecord,
      pdfVersion: String(infoRecord.PDFFormatVersion ?? 'Unknown'),
      pageCount: doc.numPages,
      encrypted: Boolean(infoRecord.IsEncrypted),
    };
  } finally {
    await doc.destroy();
  }
}

/** Label/value rows for the panel's read-only `inspect` details. */
export function metadataDetails(
  result: DocumentMetadataResult
): [string, string][] {
  const rows: [string, string][] = [
    ['Pages', String(result.pageCount)],
    ['PDF version', result.pdfVersion],
    ['Encrypted', result.encrypted ? 'Yes' : 'No'],
  ];
  for (const [key, value] of Object.entries(result.info)) {
    if (key === 'PDFFormatVersion' || key === 'IsEncrypted') continue;
    if (value === null || value === undefined || value === '') continue;
    rows.push([key, displayValue(value)]);
  }
  return rows;
}

export async function exportMetadataJson(
  file: File,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');
  ctx.progress({ label: 'Reading metadata…' });
  const result = await readDocumentMetadata(file);
  const json = JSON.stringify(result, null, 2);
  return new File([json], `${baseName(file.name)}-metadata.json`, {
    type: 'application/json',
  });
}
