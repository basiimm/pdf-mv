// Pure engine for the Add Attachments tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/add-attachments-page.ts. No DOM, no showAlert/showLoader.
// Uses the same CoherentPDF worker as the legacy page (document-level
// attachments only; the worker does not support page-level attachments).

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AddAttachmentsOptions {}

interface WorkerSuccess {
  status: 'success';
  modifiedPDF: ArrayBuffer;
}
interface WorkerError {
  status: 'error';
  message?: string;
}

export async function addAttachments(
  files: File[],
  _options: AddAttachmentsOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');
  const [pdfFile, ...attachments] = files;
  if (!pdfFile) throw new Error('No PDF to attach files to.');
  if (attachments.length === 0)
    throw new Error('Choose at least one file to attach.');

  const { isCpdfAvailable } = await import('../utils/cpdf-helper.js');
  if (!isCpdfAvailable()) {
    throw new Error(
      'The CoherentPDF WASM engine is not configured. Configure it in WASM Settings.'
    );
  }
  const { WasmProvider } = await import('../utils/wasm-provider.js');

  ctx.progress({ label: 'Loading engine…' });
  const worker = new Worker(
    import.meta.env.BASE_URL + 'workers/add-attachments.worker.js'
  );
  try {
    ctx.progress({ label: 'Reading files…', value: 0.2 });
    const pdfBuffer = await pdfFile.arrayBuffer();
    const attachmentBuffers: ArrayBuffer[] = [];
    const attachmentNames: string[] = [];
    for (const attachment of attachments) {
      attachmentBuffers.push(await attachment.arrayBuffer());
      attachmentNames.push(attachment.name);
    }

    ctx.progress({ label: 'Attaching files…', value: 0.6 });
    const modifiedPDF = await new Promise<ArrayBuffer>((resolve, reject) => {
      const onAbort = () => {
        worker.terminate();
        reject(new Error('Cancelled'));
      };
      ctx.signal.addEventListener('abort', onAbort, { once: true });
      worker.onmessage = (e: MessageEvent<WorkerSuccess | WorkerError>) => {
        ctx.signal.removeEventListener('abort', onAbort);
        if (e.data.status === 'success') resolve(e.data.modifiedPDF);
        else reject(new Error(e.data.message || 'Failed to attach files.'));
      };
      worker.onerror = (err) => {
        ctx.signal.removeEventListener('abort', onAbort);
        reject(new Error(err.message || 'Failed to attach files.'));
      };
      worker.postMessage(
        {
          command: 'add-attachments',
          pdfBuffer,
          attachmentBuffers,
          attachmentNames,
          cpdfUrl: WasmProvider.getUrl('cpdf')! + 'coherentpdf.browser.min.js',
        },
        [pdfBuffer, ...attachmentBuffers]
      );
    });

    return new File([new Uint8Array(modifiedPDF)], pdfFile.name, {
      type: 'application/pdf',
    });
  } finally {
    worker.terminate();
  }
}
