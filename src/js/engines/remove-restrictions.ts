// Pure engine for the Remove Restrictions tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/remove-restrictions-page.ts. No DOM, no showAlert/showLoader.
import createModule from '@neslinesli93/qpdf-wasm';
import type { QpdfInstanceExtended } from '@/types';

export interface RemoveRestrictionsOptions {
  /** Owner password, if the PDF requires one to remove restrictions. */
  password?: string;
}

export const defaultRemoveRestrictionsOptions: RemoveRestrictionsOptions = {
  password: '',
};

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

async function loadQpdf(): Promise<QpdfInstanceExtended> {
  return (await createModule({
    locateFile: () => import.meta.env.BASE_URL + 'qpdf.wasm',
  })) as unknown as QpdfInstanceExtended;
}

export async function removeRestrictions(
  file: File,
  options: RemoveRestrictionsOptions,
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
    ctx.progress({ label: 'Removing restrictions…' });
    const uint8Array = new Uint8Array(await file.arrayBuffer());
    qpdf.FS.writeFile(inputPath, uint8Array);

    const args = [inputPath];
    if (options.password) {
      args.push(`--password=${options.password}`);
    }
    args.push('--decrypt', '--remove-restrictions', '--', outputPath);

    try {
      qpdf.callMain(args);
    } catch (qpdfError: unknown) {
      const qpdfMsg = qpdfError instanceof Error ? qpdfError.message : '';
      if (/password|encrypt/i.test(qpdfMsg)) {
        throw new Error(
          'This PDF requires the correct owner password to remove restrictions.',
          { cause: qpdfError }
        );
      }
      throw new Error(
        'Failed to remove restrictions: ' + (qpdfMsg || 'Unknown error'),
        {
          cause: qpdfError,
        }
      );
    }

    const outputFile = qpdf.FS.readFile(outputPath, { encoding: 'binary' });
    if (!outputFile || outputFile.length === 0) {
      throw new Error('Operation resulted in an empty file.');
    }

    return new File(
      [new Uint8Array(outputFile)],
      `${baseName(file.name)}-unrestricted.pdf`,
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
