// Pure engine for the Optimize for web (linearize) tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/linearize-pdf-page.ts. No DOM, no showAlert/showLoader.
import createModule from '@neslinesli93/qpdf-wasm';
import type { QpdfInstanceExtended } from '@/types';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface LinearizePdfOptions {}

export const defaultLinearizeOptions: LinearizePdfOptions = {};

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

async function loadQpdf(): Promise<QpdfInstanceExtended> {
  return (await createModule({
    locateFile: () => import.meta.env.BASE_URL + 'qpdf.wasm',
  })) as unknown as QpdfInstanceExtended;
}

export async function linearizePdf(
  file: File,
  _options: LinearizePdfOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  ctx.progress({ label: 'Loading engine…' });
  const qpdf = await loadQpdf();

  const inputPath = '/input.pdf';
  const outputPath = '/output.pdf';

  try {
    ctx.progress({ label: 'Optimizing for web view…' });
    const uint8Array = new Uint8Array(await file.arrayBuffer());
    qpdf.FS.writeFile(inputPath, uint8Array);

    try {
      qpdf.callMain([inputPath, '--linearize', outputPath]);
    } catch (qpdfError: unknown) {
      const msg = qpdfError instanceof Error ? qpdfError.message : '';
      if (/password|encrypt/i.test(msg)) {
        throw new Error(
          'This PDF requires a password before it can be optimized.',
          { cause: qpdfError }
        );
      }
      throw new Error(`Linearization failed: ${msg || 'Unknown error'}`, {
        cause: qpdfError,
      });
    }

    const outputFile = qpdf.FS.readFile(outputPath, { encoding: 'binary' });
    if (!outputFile || outputFile.length === 0) {
      throw new Error('Linearization resulted in an empty file.');
    }

    return new File(
      [new Uint8Array(outputFile)],
      `${baseName(file.name)}-optimized.pdf`,
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
