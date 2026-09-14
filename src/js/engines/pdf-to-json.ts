// Pure engine for the pdf-to-json tool. See docs/TOOL-MIGRATION-GUIDE.md.
import { isCpdfAvailable } from '../utils/cpdf-helper.js';
import { WasmProvider } from '../utils/wasm-provider.js';

export interface PdfToJsonOptions {
  [key: string]: never;
}

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

export function jsonNameFor(sourceName: string): string {
  return sourceName.replace(/\.pdf$/i, '.json');
}

interface WorkerSuccess {
  status: 'success';
  jsonFiles: Array<{ name: string; data: ArrayBuffer }>;
}
interface WorkerError {
  status: 'error';
  message?: string;
}

export async function pdfToJson(
  file: File,
  _options: PdfToJsonOptions,
  ctx: EngineContext
): Promise<File> {
  if (!isCpdfAvailable()) {
    throw new Error(
      'The CoherentPDF WASM engine is not configured. Configure it in WASM Settings.'
    );
  }

  ctx.progress({ label: 'Loading engine…' });
  const worker = new Worker(
    import.meta.env.BASE_URL + 'workers/pdf-to-json.worker.js'
  );

  try {
    ctx.progress({ label: 'Converting to JSON…', value: 0.3 });
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
          reject(new Error(e.data.message || 'PDF to JSON conversion failed.'));
      };
      worker.onerror = (err) => {
        ctx.signal.removeEventListener('abort', onAbort);
        reject(new Error(err.message || 'PDF to JSON conversion failed.'));
      };
      worker.postMessage(
        {
          command: 'convert',
          fileBuffers: [buffer],
          fileNames: [file.name],
          cpdfUrl: WasmProvider.getUrl('cpdf')! + 'coherentpdf.browser.min.js',
        },
        [buffer]
      );
    });

    const [jsonFile] = result.jsonFiles;
    if (!jsonFile)
      throw new Error('PDF to JSON conversion produced no output.');
    return new File([new Uint8Array(jsonFile.data)], jsonNameFor(file.name), {
      type: 'application/json',
    });
  } finally {
    worker.terminate();
  }
}
