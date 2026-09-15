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

if (typeof globalThis.ImageData === 'undefined') {
  class TestImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height?: number) {
      this.data = data;
      this.width = width;
      this.height = height ?? data.length / (4 * width);
    }
  }
  // @ts-expect-error -- test-only polyfill
  globalThis.ImageData = TestImageData;
}

const NUM_PAGES = 2;

function makePdfjsDoc(numPages = NUM_PAGES) {
  return {
    numPages,
    getPage: vi.fn(async () => ({
      getViewport: ({ scale }: { scale: number }) => ({
        width: 10 * scale,
        height: 10 * scale,
      }),
      render: () => ({ promise: Promise.resolve() }),
    })),
  };
}

let currentPdfjsDoc: ReturnType<typeof makePdfjsDoc>;
let lastPutImageData: ImageData | undefined;

vi.mock('../utils/helpers.js', async () => {
  const actual = await vi.importActual<typeof import('../utils/helpers.js')>(
    '../utils/helpers.js'
  );
  return {
    ...actual,
    getPDFDocument: vi.fn(() => ({
      promise: Promise.resolve(currentPdfjsDoc),
    })),
  };
});

vi.mock('../utils/setup-pdf-worker.js', () => ({}));

function installCanvasMock(fillValue = 10) {
  const proto = HTMLCanvasElement.prototype;
  vi.spyOn(proto, 'getContext').mockImplementation(function () {
    return {
      getImageData: (_x: number, _y: number, w: number, h: number) =>
        new ImageData(new Uint8ClampedArray(w * h * 4).fill(fillValue), w, h),
      putImageData: (data: ImageData) => {
        lastPutImageData = data;
      },
    } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(proto, 'toBlob').mockImplementation(function (
    callback: BlobCallback
  ) {
    callback(
      new Blob([base64ToUint8Array(ONE_PX_PNG_BASE64)], { type: 'image/png' })
    );
  });
}

describe('textColor engine', () => {
  beforeEach(() => {
    currentPdfjsDoc = makePdfjsDoc();
    lastPutImageData = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has the same defaults as the legacy text-color page', async () => {
    const { defaultTextColorOptions } = await import('./text-color.js');
    expect(defaultTextColorOptions).toEqual({
      color: '#000000',
      darknessThreshold: 120,
      scale: 2.0,
    });
  });

  it('recolors dark pixels (below the darkness threshold) to the target color', async () => {
    installCanvasMock(10); // dark source pixels, below the 120 threshold
    const { textColor, defaultTextColorOptions } =
      await import('./text-color.js');
    const file = new File([new Uint8Array([1])], 'doc.pdf', {
      type: 'application/pdf',
    });
    await textColor(
      file,
      { ...defaultTextColorOptions, color: '#ff0000' },
      { signal: new AbortController().signal, progress: () => {} }
    );
    expect(lastPutImageData).toBeDefined();
    // r=255, g=0, b=0 for every recolored pixel
    expect(lastPutImageData!.data[0]).toBe(255);
    expect(lastPutImageData!.data[1]).toBe(0);
    expect(lastPutImageData!.data[2]).toBe(0);
  });

  it('leaves light pixels (above the darkness threshold) untouched', async () => {
    installCanvasMock(200); // light source pixels, above the 120 threshold
    const { textColor, defaultTextColorOptions } =
      await import('./text-color.js');
    const file = new File([new Uint8Array([1])], 'doc.pdf', {
      type: 'application/pdf',
    });
    await textColor(
      file,
      { ...defaultTextColorOptions, color: '#ff0000' },
      { signal: new AbortController().signal, progress: () => {} }
    );
    expect(lastPutImageData!.data[0]).toBe(200);
    expect(lastPutImageData!.data[1]).toBe(200);
    expect(lastPutImageData!.data[2]).toBe(200);
  });

  it('produces a valid PDF with one page per source page', async () => {
    installCanvasMock();
    const { textColor, defaultTextColorOptions } =
      await import('./text-color.js');
    const file = new File([new Uint8Array([1])], 'doc.pdf', {
      type: 'application/pdf',
    });
    const result = await textColor(file, defaultTextColorOptions, {
      signal: new AbortController().signal,
      progress: () => {},
    });
    expect(result).toBeInstanceOf(File);
    const outDoc = await PDFDocument.load(await result.arrayBuffer());
    expect(outDoc.getPageCount()).toBe(NUM_PAGES);
  });

  it('throws a Cancelled error when aborted before starting', async () => {
    installCanvasMock();
    const { textColor, defaultTextColorOptions } =
      await import('./text-color.js');
    const controller = new AbortController();
    controller.abort();
    const file = new File([new Uint8Array([1])], 'doc.pdf', {
      type: 'application/pdf',
    });
    await expect(
      textColor(file, defaultTextColorOptions, {
        signal: controller.signal,
        progress: () => {},
      })
    ).rejects.toThrow('Cancelled');
  });

  it('throws a password-specific error for encrypted PDFs', async () => {
    installCanvasMock();
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
    const { textColor, defaultTextColorOptions } =
      await import('./text-color.js');
    const file = new File([new Uint8Array([1])], 'doc.pdf', {
      type: 'application/pdf',
    });
    await expect(
      textColor(file, defaultTextColorOptions, {
        signal: new AbortController().signal,
        progress: () => {},
      })
    ).rejects.toThrow(/password/i);
  });
});
