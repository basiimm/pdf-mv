import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';

const ONE_PX_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const NUM_PAGES = 2;

function makePdfjsDoc(numPages = NUM_PAGES) {
  return {
    numPages,
    getPage: vi.fn(async () => ({
      getViewport: ({ scale }: { scale: number }) => ({
        width: 20 * scale,
        height: 10 * scale,
      }),
      render: () => ({ promise: Promise.resolve() }),
    })),
  };
}

let currentPdfjsDoc: ReturnType<typeof makePdfjsDoc>;

vi.mock('../utils/helpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/helpers.js')>();
  return {
    ...actual,
    getPDFDocument: vi.fn(() => ({
      promise: Promise.resolve(currentPdfjsDoc),
    })),
  };
});

vi.mock('../utils/setup-pdf-worker.js', () => ({}));

function installCanvasMock() {
  const proto = HTMLCanvasElement.prototype;
  vi.spyOn(proto, 'getContext').mockImplementation(function () {
    return {
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(proto, 'toBlob').mockImplementation(function (
    callback: BlobCallback
  ) {
    callback(
      new Blob([base64ToUint8Array(ONE_PX_PNG_BASE64)], {
        type: 'image/png',
      })
    );
  });
}

const file = new File([new Uint8Array([1])], 'doc.pdf', {
  type: 'application/pdf',
});

describe('posterizePdf engine', () => {
  beforeEach(() => {
    currentPdfjsDoc = makePdfjsDoc();
    installCanvasMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has the same defaults as the legacy posterize page', async () => {
    const { defaultPosterizeOptions } = await import('./posterize-pdf.js');
    expect(defaultPosterizeOptions).toEqual({
      rows: 1,
      cols: 2,
      pageSize: 'A4',
      orientation: 'auto',
      scalingMode: 'fit',
      overlap: 0,
      overlapUnit: 'pt',
      pages: '',
    });
  });

  it('produces rows x cols output pages per source page', async () => {
    const { posterizePdf } = await import('./posterize-pdf.js');
    const result = await posterizePdf(
      file,
      { rows: 2, cols: 3 },
      { signal: new AbortController().signal, progress: () => {} }
    );
    const doc = await PDFDocument.load(await result.arrayBuffer());
    // 2 source pages x (2 rows * 3 cols) tiles each = 12 output pages
    expect(doc.getPageCount()).toBe(NUM_PAGES * 6);
  });

  it('only tiles pages within the given page range', async () => {
    currentPdfjsDoc = makePdfjsDoc(3);
    const { posterizePdf } = await import('./posterize-pdf.js');
    const result = await posterizePdf(
      file,
      { rows: 1, cols: 2, pages: '2' },
      { signal: new AbortController().signal, progress: () => {} }
    );
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getPageCount()).toBe(2);
  });

  it('reports progress per source page', async () => {
    const { posterizePdf } = await import('./posterize-pdf.js');
    const labels: string[] = [];
    await posterizePdf(
      file,
      { rows: 1, cols: 1 },
      {
        signal: new AbortController().signal,
        progress: (p) => labels.push(p.label),
      }
    );
    expect(labels).toEqual(['Page 1 of 2', 'Page 2 of 2', 'Saving document']);
  });

  it('rejects an empty page range with a plain-language error', async () => {
    const { posterizePdf } = await import('./posterize-pdf.js');
    await expect(
      posterizePdf(
        file,
        { pages: '99' },
        { signal: new AbortController().signal, progress: () => {} }
      )
    ).rejects.toThrow('Choose a valid page range to posterize.');
  });

  it('throws a Cancelled error when aborted before starting', async () => {
    const { posterizePdf } = await import('./posterize-pdf.js');
    const controller = new AbortController();
    controller.abort();
    await expect(
      posterizePdf(file, {}, { signal: controller.signal, progress: () => {} })
    ).rejects.toThrow('Cancelled');
  });

  it('throws a password-specific error for encrypted PDFs', async () => {
    const helpers = await import('../utils/helpers.js');
    (
      helpers.getPDFDocument as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce({
      promise: Promise.reject(
        Object.assign(new Error('needs a password'), {
          name: 'PasswordException',
        })
      ),
    });
    const { posterizePdf } = await import('./posterize-pdf.js');
    await expect(
      posterizePdf(
        file,
        {},
        { signal: new AbortController().signal, progress: () => {} }
      )
    ).rejects.toThrow(/password/i);
  });
});
