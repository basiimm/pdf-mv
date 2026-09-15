// Pure engine for the Encrypt PDF tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/encrypt-pdf-page.ts. No DOM, no showAlert/showLoader.
import createModule from '@neslinesli93/qpdf-wasm';
import type { QpdfInstanceExtended } from '@/types';

export interface EncryptPdfOptions {
  userPassword: string;
  /** Blank keeps the document permissive (no distinct owner restrictions). */
  ownerPassword?: string;
}

export const defaultEncryptOptions: EncryptPdfOptions = {
  userPassword: '',
  ownerPassword: '',
};

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

async function loadQpdf(): Promise<QpdfInstanceExtended> {
  return (await createModule({
    locateFile: () => import.meta.env.BASE_URL + 'qpdf.wasm',
  })) as unknown as QpdfInstanceExtended;
}

export async function encryptPdf(
  file: File,
  options: EncryptPdfOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (!options.userPassword) {
    throw new Error('Enter a user password to encrypt this PDF.');
  }
  if (ctx.signal.aborted) throw new Error('Cancelled');

  ctx.progress({ label: 'Loading engine…' });
  const qpdf = await loadQpdf();

  const inputPath = '/input.pdf';
  const outputPath = '/output.pdf';

  try {
    ctx.progress({ label: 'Encrypting PDF…' });
    const uint8Array = new Uint8Array(await file.arrayBuffer());
    qpdf.FS.writeFile(inputPath, uint8Array);

    const ownerPassword = options.ownerPassword || options.userPassword;
    const hasDistinctOwnerPassword = !!options.ownerPassword;

    const args = [
      inputPath,
      '--encrypt',
      options.userPassword,
      ownerPassword,
      '256',
    ];
    if (hasDistinctOwnerPassword) {
      args.push(
        '--modify=none',
        '--extract=n',
        '--print=none',
        '--accessibility=n',
        '--annotate=n',
        '--assemble=n',
        '--form=n',
        '--modify-other=n'
      );
    }
    args.push('--', outputPath);

    try {
      qpdf.callMain(args);
    } catch (qpdfError: unknown) {
      throw new Error(
        'Encryption failed: ' +
          (qpdfError instanceof Error ? qpdfError.message : 'Unknown error'),
        { cause: qpdfError }
      );
    }

    const outputFile = qpdf.FS.readFile(outputPath, { encoding: 'binary' });
    if (!outputFile || outputFile.length === 0) {
      throw new Error('Encryption resulted in an empty file.');
    }

    return new File(
      [new Uint8Array(outputFile)],
      `${baseName(file.name)}-encrypted.pdf`,
      {
        type: 'application/pdf',
      }
    );
  } finally {
    try {
      qpdf.FS.unlink(inputPath);
    } catch {
      /* ignore */
    }
    try {
      qpdf.FS.unlink(outputPath);
    } catch {
      /* ignore */
    }
  }
}
