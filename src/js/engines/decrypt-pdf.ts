// Pure engine for the Decrypt PDF tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/decrypt-pdf-page.ts. No DOM, no showAlert/showLoader.
import { decryptPdfBytes } from '../utils/pdf-decrypt.js';

export interface DecryptPdfOptions {
  password: string;
}

export const defaultDecryptOptions: DecryptPdfOptions = {
  password: '',
};

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

export async function decryptPdf(
  file: File,
  options: DecryptPdfOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (!options.password) {
    throw new Error('Enter the PDF password to decrypt this document.');
  }
  if (ctx.signal.aborted) throw new Error('Cancelled');

  ctx.progress({ label: 'Decrypting PDF…' });
  const uint8Array = new Uint8Array(await file.arrayBuffer());

  try {
    const { bytes } = await decryptPdfBytes(uint8Array, options.password);
    return new File(
      [new Uint8Array(bytes)],
      `${baseName(file.name)}-decrypted.pdf`,
      {
        type: 'application/pdf',
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'INVALID_PASSWORD' || /password/i.test(message)) {
      throw new Error(
        'Incorrect password. Please check the PDF password and try again.',
        { cause: error }
      );
    }
    throw new Error(`Decryption failed: ${message}`, { cause: error });
  }
}
