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

const NUM_PAGES = 3;

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

vi.mock('../utils/helpers.js', () => ({
  getPDFDocument: vi.fn(() => ({
    promise: Promise.resolve(currentPdfjsDoc),
  })),
}));

vi.mock('../utils/setup-pdf-worker.js', () => ({}));

function installCanvasMock() {
  const proto = HTMLCanvasElement.prototype;
  vi.spyOn(proto, 'getContext').mockImplementation(function () {
    return {
      getImageData: (_x: number, _y: number, w: number, h: number) =>
        new ImageData(new Uint8ClampedArray(w * h * 4).fill(10), w, h),
      putImageData: vi.fn(),
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

describe('adjustColors engine', () => {
  beforeEach(() => {
    currentPdfjsDoc = makePdfjsDoc();
    installCanvasMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has the same defaults as the legacy adjust-colors page', async () => {
    const { defaultAdjustColorsOptions } = await import('./adjust-colors.js');
    expect(defaultAdjustColorsOptions).toEqual({
      brightness: 0,
      contrast: 0,
      saturation: 0,
      hueShift: 0,
      temperature: 0,
      tint: 0,
      gamma: 1.0,
      sepia: 0,
    });
  });

  it('produces a valid PDF with one page per source page', async () => {
    const { adjustColors, defaultAdjustColorsOptions } =
      await import('./adjust-colors.js');
    const file = new File([new Uint8Array([1])], 'doc.pdf', {
      type: 'application/pdf',
    });
    const result = await adjustColors(file, defaultAdjustColorsOptions, {
      signal: new AbortController().signal,
      progress: () => {},
    });
    expect(result).toBeInstanceOf(File);
    expect(result.name).toBe('doc.pdf');
    const outDoc = await PDFDocument.load(await result.arrayBuffer());
    expect(outDoc.getPageCount()).toBe(NUM_PAGES);
  });

  it('reports progress per page', async () => {
    const { adjustColors, defaultAdjustColorsOptions } =
      await import('./adjust-colors.js');
    const file = new File([new Uint8Array([1])], 'doc.pdf', {
      type: 'application/pdf',
    });
    const labels: string[] = [];
    await adjustColors(file, defaultAdjustColorsOptions, {
      signal: new AbortController().signal,
      progress: (p) => labels.push(p.label),
    });
    expect(labels).toEqual(
      expect.arrayContaining(['Page 1 of 3', 'Page 2 of 3', 'Page 3 of 3'])
    );
  });

  it('throws a Cancelled error when aborted before starting', async () => {
    const { adjustColors, defaultAdjustColorsOptions } =
      await import('./adjust-colors.js');
    const controller = new AbortController();
    controller.abort();
    const file = new File([new Uint8Array([1])], 'doc.pdf', {
      type: 'application/pdf',
    });
    await expect(
      adjustColors(file, defaultAdjustColorsOptions, {
        signal: controller.signal,
        progress: () => {},
      })
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
    const { adjustColors, defaultAdjustColorsOptions } =
      await import('./adjust-colors.js');
    const file = new File([new Uint8Array([1])], 'doc.pdf', {
      type: 'application/pdf',
    });
    await expect(
      adjustColors(file, defaultAdjustColorsOptions, {
        signal: new AbortController().signal,
        progress: () => {},
      })
    ).rejects.toThrow(/password/i);
  });
});
