// Pure engine for the Change Permissions tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/change-permissions-page.ts. No DOM, no showAlert/showLoader.
import createModule from '@neslinesli93/qpdf-wasm';
import type { QpdfInstanceExtended } from '@/types';

export interface ChangePermissionsOptions {
  currentPassword?: string;
  newUserPassword?: string;
  newOwnerPassword?: string;
  allowPrinting: boolean;
  allowCopying: boolean;
  allowModifying: boolean;
  allowAnnotating: boolean;
  allowFillingForms: boolean;
  allowDocumentAssembly: boolean;
  allowPageExtraction: boolean;
}

export const defaultChangePermissionsOptions: ChangePermissionsOptions = {
  currentPassword: '',
  newUserPassword: '',
  newOwnerPassword: '',
  allowPrinting: true,
  allowCopying: true,
  allowModifying: true,
  allowAnnotating: true,
  allowFillingForms: true,
  allowDocumentAssembly: true,
  allowPageExtraction: true,
};

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

async function loadQpdf(): Promise<QpdfInstanceExtended> {
  return (await createModule({
    locateFile: () => import.meta.env.BASE_URL + 'qpdf.wasm',
  })) as unknown as QpdfInstanceExtended;
}

export async function changePermissions(
  file: File,
  options: ChangePermissionsOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (options.newUserPassword && !options.newOwnerPassword) {
    throw new Error('An owner password is required when setting permissions.');
  }
  if (ctx.signal.aborted) throw new Error('Cancelled');

  ctx.progress({ label: 'Loading engine…' });
  const qpdf = await loadQpdf();

  const inputPath = '/input.pdf';
  const outputPath = '/output.pdf';

  try {
    ctx.progress({ label: 'Updating permissions…' });
    const uint8Array = new Uint8Array(await file.arrayBuffer());
    qpdf.FS.writeFile(inputPath, uint8Array);

    const args = [inputPath];
    if (options.currentPassword) {
      args.push('--password=' + options.currentPassword);
    }

    const shouldEncrypt = !!(
      options.newUserPassword || options.newOwnerPassword
    );

    if (shouldEncrypt) {
      args.push(
        '--encrypt',
        options.newUserPassword ?? '',
        options.newOwnerPassword ?? '',
        '256'
      );

      if (options.newOwnerPassword) {
        if (!options.allowModifying) args.push('--modify=none');
        if (!options.allowCopying) args.push('--extract=n');
        if (!options.allowPrinting) args.push('--print=none');
        if (!options.allowAnnotating) args.push('--annotate=n');
        if (!options.allowDocumentAssembly) args.push('--assemble=n');
        if (!options.allowFillingForms) args.push('--form=n');
        if (!options.allowPageExtraction) args.push('--extract=n');
        if (!options.allowModifying) args.push('--modify-other=n');
      } else if (options.newUserPassword) {
        args.push('--allow-insecure');
      }
    } else {
      args.push('--decrypt');
    }

    args.push('--', outputPath);

    try {
      qpdf.callMain(args);
    } catch (qpdfError: unknown) {
      const errorMsg = qpdfError instanceof Error ? qpdfError.message : '';
      if (/invalid password|incorrect password|password/i.test(errorMsg)) {
        throw new Error('The current password you entered is incorrect.', {
          cause: qpdfError,
        });
      }
      if (/encrypted|password required/i.test(errorMsg)) {
        throw new Error(
          'This PDF is password-protected. Enter the current password to proceed.',
          { cause: qpdfError }
        );
      }
      throw new Error('Processing failed: ' + (errorMsg || 'Unknown error'), {
        cause: qpdfError,
      });
    }

    const outputFile = qpdf.FS.readFile(outputPath, { encoding: 'binary' });
    if (!outputFile || outputFile.length === 0) {
      throw new Error('Processing resulted in an empty file.');
    }

    return new File(
      [new Uint8Array(outputFile)],
      `${baseName(file.name)}-permissions.pdf`,
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
