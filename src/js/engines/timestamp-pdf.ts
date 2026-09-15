// Pure engine for the timestamp-pdf tool. See docs/TOOL-MIGRATION-GUIDE.md.
import { timestampPdf as requestTimestamp } from '../logic/digital-sign-pdf.js';

export interface TimestampPdfOptions {
  tsaUrl: string;
}

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

export async function timestampPdf(
  file: File,
  options: TimestampPdfOptions,
  ctx: EngineContext
): Promise<File> {
  if (!options.tsaUrl) {
    throw new Error('Choose a timestamp authority (TSA) server.');
  }
  if (ctx.signal.aborted) throw new Error('Cancelled');

  ctx.progress({ label: 'Requesting timestamp…' });
  const pdfBytes = new Uint8Array(await file.arrayBuffer());

  let timestampedBytes: Uint8Array;
  try {
    timestampedBytes = await requestTimestamp(pdfBytes, options.tsaUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message, { cause: error });
  }

  if (ctx.signal.aborted) throw new Error('Cancelled');

  return new File(
    [new Uint8Array(timestampedBytes)],
    `${baseName(file.name)}-timestamped.pdf`,
    { type: 'application/pdf' }
  );
}
