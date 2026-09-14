// Pure engine for the extract-attachments tool. See docs/TOOL-MIGRATION-GUIDE.md.
import JSZip from 'jszip';
import { isCpdfAvailable } from '../utils/cpdf-helper.js';
import { WasmProvider } from '../utils/wasm-provider.js';
import { getCleanPdfFilename } from '../utils/helpers.js';

export interface ExtractAttachmentsOptions {
  [key: string]: never;
}

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

interface Attachment {
  name: string;
  data: ArrayBuffer;
}
interface WorkerSuccess {
  status: 'success';
  attachments: Attachment[];
}
interface WorkerError {
  status: 'error';
  message?: string;
}

/** Sanitize an attachment path into a safe, unique ZIP entry name. */
export function safeAttachmentName(
  rawName: string,
  usedNames: Set<string>
): string {
  const base =
    (rawName || 'attachment')
      .split(/[/\\]/)
      .pop()
      ?.replace(/^\.+/, '')
      .replace(/\p{Cc}/gu, '')
      .trim() || 'attachment';
  let safeName = base;
  let counter = 1;
  while (usedNames.has(safeName)) {
    const dot = base.lastIndexOf('.');
    safeName =
      dot > 0
        ? `${base.slice(0, dot)}_${counter}${base.slice(dot)}`
        : `${base}_${counter}`;
    counter++;
  }
  usedNames.add(safeName);
  return safeName;
}

export function attachmentsZipName(baseName: string): string {
  return `${getCleanPdfFilename(baseName)}-attachments.zip`;
}

export async function extractAttachments(
  file: File,
  _options: ExtractAttachmentsOptions,
  ctx: EngineContext
): Promise<File> {
  if (!isCpdfAvailable()) {
    throw new Error(
      'The CoherentPDF WASM engine is not configured. Configure it in WASM Settings.'
    );
  }

  ctx.progress({ label: 'Loading engine…' });
  const worker = new Worker(
    import.meta.env.BASE_URL + 'workers/extract-attachments.worker.js'
  );

  try {
    ctx.progress({ label: 'Extracting attachments…', value: 0.3 });
    const buffer = await file.arrayBuffer();

    const result = await new Promise<WorkerSuccess>((resolve, reject) => {
      const onAbort = () => {
        worker.terminate();
        reject(new Error('Cancelled'));
      };
      ctx.signal.addEventListener('abort', onAbort, { once: true });
      worker.onmessage = (e: MessageEvent<WorkerSuccess | WorkerError>) => {
        ctx.signal.removeEventListener('abort', onAbort);
        if (e.data.status === 'success') resolve(e.data);
        else
          reject(new Error(e.data.message || 'Attachment extraction failed.'));
      };
      worker.onerror = (err) => {
        ctx.signal.removeEventListener('abort', onAbort);
        reject(new Error(err.message || 'Attachment extraction failed.'));
      };
      worker.postMessage(
        {
          command: 'extract-attachments',
          fileBuffers: [buffer],
          fileNames: [file.name],
          cpdfUrl: WasmProvider.getUrl('cpdf')! + 'coherentpdf.browser.min.js',
        },
        [buffer]
      );
    });

    if (result.attachments.length === 0) {
      throw new Error('This PDF does not contain any attachments to extract.');
    }

    ctx.progress({ label: 'Creating ZIP file', value: 0.9 });
    const zip = new JSZip();
    const usedNames = new Set<string>();
    for (const attachment of result.attachments) {
      zip.file(
        safeAttachmentName(attachment.name, usedNames),
        new Uint8Array(attachment.data)
      );
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    return new File([zipBlob], attachmentsZipName(file.name), {
      type: 'application/zip',
    });
  } finally {
    worker.terminate();
  }
}
