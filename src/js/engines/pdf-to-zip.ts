// Pure engine for the pdf-to-zip tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Unlike the other tools in this family, this one bundles multiple chosen
// PDFs into a single archive rather than operating on the open document.
import JSZip from 'jszip';
import { deduplicateFileName } from '../utils/deduplicate-filename.js';

export interface PdfToZipOptions {
  [key: string]: never;
}

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

export const ZIP_ARCHIVE_NAME = 'pdfs_archive.zip';

export async function pdfToZip(
  files: File[],
  _options: PdfToZipOptions,
  ctx: EngineContext
): Promise<File> {
  if (files.length === 0)
    throw new Error('Choose at least one PDF to archive.');

  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (let i = 0; i < files.length; i++) {
    if (ctx.signal.aborted) throw new Error('Cancelled');
    const file = files[i];
    ctx.progress({
      label: `Adding ${file.name} (${i + 1} of ${files.length})`,
      value: i / files.length,
    });
    const buffer = await file.arrayBuffer();
    zip.file(deduplicateFileName(file.name, usedNames), buffer);
  }

  ctx.progress({ label: 'Generating ZIP file', value: 0.95 });
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return new File([zipBlob], ZIP_ARCHIVE_NAME, { type: 'application/zip' });
}
