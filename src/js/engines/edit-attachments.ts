// Pure engine for the Edit Attachments tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/edit-attachments-page.ts. No DOM, no showAlert/showLoader.
// Uses the same CoherentPDF worker as the legacy page.

export interface AttachmentInfo {
  index: number;
  name: string;
  page: number;
  size: number;
}

export interface EditAttachmentsOptions {
  /** Comma-separated attachment names to remove. */
  removeNames?: string;
}

interface RawAttachment {
  index: number;
  name: string;
  page: number;
  data: ArrayBuffer;
}
interface GetAttachmentsSuccess {
  status: 'success';
  attachments: RawAttachment[];
}
interface EditAttachmentsSuccess {
  status: 'success';
  modifiedPDF: ArrayBuffer;
}
interface WorkerError {
  status: 'error';
  message?: string;
}

async function getAttachments(
  file: File,
  ctx: { signal: AbortSignal }
): Promise<RawAttachment[]> {
  const { isCpdfAvailable } = await import('../utils/cpdf-helper.js');
  if (!isCpdfAvailable()) {
    throw new Error(
      'The CoherentPDF WASM engine is not configured. Configure it in WASM Settings.'
    );
  }
  const { WasmProvider } = await import('../utils/wasm-provider.js');

  const worker = new Worker(
    import.meta.env.BASE_URL + 'workers/edit-attachments.worker.js'
  );
  try {
    const fileBuffer = await file.arrayBuffer();
    return await new Promise<RawAttachment[]>((resolve, reject) => {
      const onAbort = () => {
        worker.terminate();
        reject(new Error('Cancelled'));
      };
      ctx.signal.addEventListener('abort', onAbort, { once: true });
      worker.onmessage = (
        e: MessageEvent<GetAttachmentsSuccess | WorkerError>
      ) => {
        ctx.signal.removeEventListener('abort', onAbort);
        if (e.data.status === 'success') resolve(e.data.attachments);
        else reject(new Error(e.data.message || 'Failed to read attachments.'));
      };
      worker.onerror = (err) => {
        ctx.signal.removeEventListener('abort', onAbort);
        reject(new Error(err.message || 'Failed to read attachments.'));
      };
      worker.postMessage(
        {
          command: 'get-attachments',
          fileBuffer,
          fileName: file.name,
          cpdfUrl: WasmProvider.getUrl('cpdf')! + 'coherentpdf.browser.min.js',
        },
        [fileBuffer]
      );
    });
  } finally {
    worker.terminate();
  }
}

/** List attachments for the panel's `inspect` details. */
export async function listAttachments(file: File): Promise<AttachmentInfo[]> {
  const raw = await getAttachments(file, {
    signal: new AbortController().signal,
  });
  return raw.map((a) => ({
    index: a.index,
    name: a.name,
    page: a.page,
    size: a.data.byteLength,
  }));
}

export function parseNamesToRemove(text: string): string[] {
  return (text || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function editAttachments(
  file: File,
  options: EditAttachmentsOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');
  const namesToRemove = parseNamesToRemove(options.removeNames || '');
  if (namesToRemove.length === 0)
    throw new Error('Enter at least one attachment name to remove.');

  ctx.progress({ label: 'Loading attachments…' });
  const attachments = await getAttachments(file, ctx);
  const indices = attachments
    .filter((a) => namesToRemove.includes(a.name))
    .map((a) => a.index);
  if (indices.length === 0)
    throw new Error('No attachments matched the names entered.');

  const { isCpdfAvailable } = await import('../utils/cpdf-helper.js');
  if (!isCpdfAvailable()) {
    throw new Error(
      'The CoherentPDF WASM engine is not configured. Configure it in WASM Settings.'
    );
  }
  const { WasmProvider } = await import('../utils/wasm-provider.js');

  ctx.progress({ label: 'Removing attachments…', value: 0.6 });
  const worker = new Worker(
    import.meta.env.BASE_URL + 'workers/edit-attachments.worker.js'
  );
  try {
    const fileBuffer = await file.arrayBuffer();
    const modifiedPDF = await new Promise<ArrayBuffer>((resolve, reject) => {
      const onAbort = () => {
        worker.terminate();
        reject(new Error('Cancelled'));
      };
      ctx.signal.addEventListener('abort', onAbort, { once: true });
      worker.onmessage = (
        e: MessageEvent<EditAttachmentsSuccess | WorkerError>
      ) => {
        ctx.signal.removeEventListener('abort', onAbort);
        if (e.data.status === 'success') resolve(e.data.modifiedPDF);
        else reject(new Error(e.data.message || 'Failed to edit attachments.'));
      };
      worker.onerror = (err) => {
        ctx.signal.removeEventListener('abort', onAbort);
        reject(new Error(err.message || 'Failed to edit attachments.'));
      };
      worker.postMessage(
        {
          command: 'edit-attachments',
          fileBuffer,
          fileName: file.name,
          attachmentsToRemove: indices,
          cpdfUrl: WasmProvider.getUrl('cpdf')! + 'coherentpdf.browser.min.js',
        },
        [fileBuffer]
      );
    });

    return new File([new Uint8Array(modifiedPDF)], file.name, {
      type: 'application/pdf',
    });
  } finally {
    worker.terminate();
  }
}
