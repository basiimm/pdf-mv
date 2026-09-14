// Pure engine for the Table of Contents tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/table-of-contents.ts. No DOM, no showAlert/showLoader.
// Uses the same CoherentPDF worker as the legacy page: it always inserts a
// generated TOC page at the front of the document (no position field, since
// the worker does not support choosing where to insert it).
import '../utils/setup-pdf-worker.js';

export interface TableOfContentsOptions {
  title?: string;
  fontSize?: number;
  addBookmark?: boolean;
}

export const defaultTableOfContentsOptions: TableOfContentsOptions = {
  title: 'Table of Contents',
  fontSize: 14,
  addBookmark: true,
};

interface WorkerSuccess {
  status: 'success';
  pdfBytes: ArrayBuffer;
}
interface WorkerError {
  status: 'error';
  message?: string;
}

/** Counts the document's existing bookmarks (outline entries), for `inspect`. */
export async function countBookmarks(file: File): Promise<number> {
  const pdfjsLib = await import('pdfjs-dist');
  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  try {
    const outline = await doc.getOutline();
    const count = (
      nodes: Array<{ items?: unknown[] }> | null | undefined
    ): number =>
      (nodes ?? []).reduce(
        (sum, node) =>
          sum + 1 + count(node.items as Array<{ items?: unknown[] }>),
        0
      );
    return count(outline);
  } finally {
    await doc.destroy();
  }
}

export async function generateTableOfContents(
  file: File,
  options: TableOfContentsOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  const { isCpdfAvailable } = await import('../utils/cpdf-helper.js');
  if (!isCpdfAvailable()) {
    throw new Error(
      'The CoherentPDF WASM engine is not configured. Configure it in WASM Settings.'
    );
  }
  const { WasmProvider } = await import('../utils/wasm-provider.js');

  ctx.progress({ label: 'Loading engine…' });
  const worker = new Worker(
    import.meta.env.BASE_URL + 'workers/table-of-contents.worker.js'
  );
  try {
    const pdfData = await file.arrayBuffer();
    ctx.progress({ label: 'Generating table of contents…', value: 0.5 });
    const pdfBytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const onAbort = () => {
        worker.terminate();
        reject(new Error('Cancelled'));
      };
      ctx.signal.addEventListener('abort', onAbort, { once: true });
      worker.onmessage = (e: MessageEvent<WorkerSuccess | WorkerError>) => {
        ctx.signal.removeEventListener('abort', onAbort);
        if (e.data.status === 'success') resolve(e.data.pdfBytes);
        else
          reject(
            new Error(e.data.message || 'Failed to generate table of contents.')
          );
      };
      worker.onerror = (err) => {
        ctx.signal.removeEventListener('abort', onAbort);
        reject(
          new Error(err.message || 'Failed to generate table of contents.')
        );
      };
      worker.postMessage(
        {
          command: 'generate-toc',
          pdfData,
          title: options.title || 'Table of Contents',
          fontSize: options.fontSize || 14,
          fontFamily: 1,
          addBookmark: options.addBookmark !== false,
          cpdfUrl: WasmProvider.getUrl('cpdf')! + 'coherentpdf.browser.min.js',
        },
        [pdfData]
      );
    });

    return new File([new Uint8Array(pdfBytes)], file.name, {
      type: 'application/pdf',
    });
  } finally {
    worker.terminate();
  }
}
