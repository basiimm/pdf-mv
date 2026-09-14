// Pure engine for the Repair PDF tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/repair-pdf.ts. No DOM, no showAlert/showLoader.
import createModule from '@neslinesli93/qpdf-wasm';
import type { QpdfInstanceExtended } from '@/types';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RepairPdfOptions {}

export const defaultRepairOptions: RepairPdfOptions = {};

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

async function loadQpdf(): Promise<QpdfInstanceExtended> {
  return (await createModule({
    locateFile: () => import.meta.env.BASE_URL + 'qpdf.wasm',
  })) as unknown as QpdfInstanceExtended;
}

export async function repairPdf(
  file: File,
  _options: RepairPdfOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  ctx.progress({ label: 'Loading engine…' });
  const qpdf = await loadQpdf();

  const inputPath = '/input.pdf';
  const outputPath = '/repaired_form.pdf';

  try {
    ctx.progress({ label: 'Repairing PDF…' });
    const uint8Array = new Uint8Array(await file.arrayBuffer());
    qpdf.FS.writeFile(inputPath, uint8Array);

    try {
      qpdf.callMain([inputPath, '--decrypt', outputPath]);
    } catch (e) {
      console.warn(`[repair-pdf] qpdf execution warning for ${file.name}:`, e);
    }

    let repaired: Uint8Array | null = null;
    try {
      repaired = qpdf.FS.readFile(outputPath, { encoding: 'binary' });
    } catch (e) {
      console.warn(`[repair-pdf] Failed to read output for ${file.name}:`, e);
    }

    if (!repaired || repaired.length === 0) {
      throw new Error('Unable to repair this PDF file.');
    }

    return new File(
      [new Uint8Array(repaired)],
      `${baseName(file.name)}-repaired.pdf`,
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
