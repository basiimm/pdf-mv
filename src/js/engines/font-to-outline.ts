// Pure engine for the Convert text to outlines tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/font-to-outline-page.ts. No DOM, no showAlert/showLoader.
import { convertFileToOutlines } from '../utils/ghostscript-loader.js';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface FontToOutlineOptions {}

export const defaultFontToOutlineOptions: FontToOutlineOptions = {};

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

export async function fontToOutline(
  file: File,
  _options: FontToOutlineOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  ctx.progress({ label: 'Loading engine…' });
  const resultBlob = await convertFileToOutlines(file, (msg) =>
    ctx.progress({ label: msg })
  );

  const bytes = new Uint8Array(await resultBlob.arrayBuffer());
  return new File([bytes], `${baseName(file.name)}-outlined.pdf`, {
    type: 'application/pdf',
  });
}
