// Pure engine for the Sanitize PDF tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/sanitize-pdf-page.ts. No DOM, no showAlert/showLoader.
import {
  sanitizePdf as sanitizePdfBytes,
  type SanitizeOptions,
} from '../utils/sanitize.js';
import { getPDFDocument } from '../utils/helpers.js';

export type SanitizePdfOptions = SanitizeOptions;

export const defaultSanitizePdfOptions: SanitizePdfOptions = {
  flattenForms: true,
  removeMetadata: true,
  removeAnnotations: true,
  removeJavascript: true,
  removeEmbeddedFiles: true,
  removeLayers: true,
  removeLinks: true,
  removeStructureTree: true,
  removeMarkInfo: true,
  removeFonts: false,
};

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

async function assertNotPasswordProtected(file: File): Promise<void> {
  const arrayBuffer = await file.arrayBuffer();
  try {
    const doc = await getPDFDocument({ data: arrayBuffer.slice(0) }).promise;
    doc.destroy();
  } catch (e: unknown) {
    const name =
      e && typeof e === 'object' && 'name' in e
        ? (e as { name: string }).name
        : '';
    if (name === 'PasswordException') {
      throw new Error(
        'This PDF requires a password before it can be sanitized.',
        { cause: e }
      );
    }
    throw e;
  }
}

export async function sanitizePdf(
  file: File,
  options: SanitizePdfOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  const hasAnyOption = Object.values(options).some(Boolean);
  if (!hasAnyOption) {
    throw new Error('Select at least one item to remove.');
  }
  if (ctx.signal.aborted) throw new Error('Cancelled');

  await assertNotPasswordProtected(file);

  ctx.progress({ label: 'Sanitizing PDF…' });
  const arrayBuffer = await file.arrayBuffer();
  const result = await sanitizePdfBytes(new Uint8Array(arrayBuffer), options);

  return new File(
    [new Uint8Array(result.bytes)],
    `${baseName(file.name)}-sanitized.pdf`,
    {
      type: 'application/pdf',
    }
  );
}
