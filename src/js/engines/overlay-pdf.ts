// Pure engine for the Overlay PDF tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/overlay-pdf-page.ts. No DOM queries,
// showAlert/showLoader; uses the shared qpdf WASM instance like other engines
// (see src/js/utils/helpers.ts#initializeQpdf).

export type OverlayMode = 'overlay' | 'underlay';

export interface OverlayPdfOptions {
  mode?: OverlayMode;
  /** Page range to apply the overlay to; blank = all pages. */
  pageRange?: string;
  /** Repeat the overlay's pages to cover the whole base document. */
  repeat?: boolean;
}

export const defaultOverlayPdfOptions: OverlayPdfOptions = {
  mode: 'overlay',
  pageRange: '',
  repeat: false,
};

export async function overlayPdf(
  files: File[],
  options: OverlayPdfOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');
  const [baseFile, overlayFile] = files;
  if (!baseFile) throw new Error('No PDF to apply the overlay to.');
  if (!overlayFile)
    throw new Error('Choose an overlay PDF to apply to the open document.');

  ctx.progress({ label: 'Loading engine…' });
  const { initializeQpdf } = await import('../utils/helpers.js');
  const qpdf = await initializeQpdf();

  const inputPath = '/input_base.pdf';
  const overlayPath = '/input_overlay.pdf';
  const outputPath = '/output.pdf';

  try {
    ctx.progress({ label: 'Reading files…', value: 0.3 });
    const baseBuffer = await baseFile.arrayBuffer();
    const overlayBuffer = await overlayFile.arrayBuffer();
    qpdf.FS.writeFile(inputPath, new Uint8Array(baseBuffer));
    qpdf.FS.writeFile(overlayPath, new Uint8Array(overlayBuffer));

    const mode = options.mode === 'underlay' ? '--underlay' : '--overlay';
    const args = [inputPath, mode, overlayPath];
    if (options.pageRange) args.push(`--to=${options.pageRange}`);
    if (options.repeat) args.push('--from=', '--repeat=1-z');
    args.push('--', outputPath);

    ctx.progress({ label: `Applying ${mode.replace('--', '')}…`, value: 0.7 });
    qpdf.callMain(args);

    const outputFile = qpdf.FS.readFile(outputPath, { encoding: 'binary' });
    if (!outputFile || outputFile.length === 0) {
      throw new Error('Applying the overlay produced an empty file.');
    }

    return new File([new Uint8Array(outputFile)], baseFile.name, {
      type: 'application/pdf',
    });
  } finally {
    try {
      if (qpdf?.FS) {
        if (qpdf.FS.analyzePath(inputPath).exists) qpdf.FS.unlink(inputPath);
        if (qpdf.FS.analyzePath(overlayPath).exists)
          qpdf.FS.unlink(overlayPath);
        if (qpdf.FS.analyzePath(outputPath).exists) qpdf.FS.unlink(outputPath);
      }
    } catch {
      // Best-effort cleanup; the WASM filesystem is ephemeral anyway.
    }
  }
}
