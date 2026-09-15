import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { resolvePageRotation } from './scanner-effect.js';

// A real, minimal 1x1 black JPEG — lets pdf-lib's embedJpg succeed for real.
const ONE_PX_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

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
      drawImage: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      setTransform: vi.fn(),
      filter: '',
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(proto, 'toBlob').mockImplementation(function (
    callback: BlobCallback
  ) {
    callback(
      new Blob([base64ToUint8Array(ONE_PX_JPEG_BASE64)], { type: 'image/jpeg' })
    );
  });
}

describe('resolvePageRotation (pure)', () => {
  it('is exactly `rotate` when rotateVariance is 0', () => {
    expect(resolvePageRotation({ rotate: 0, rotateVariance: 0 })).toBe(0);
    expect(resolvePageRotation({ rotate: 12, rotateVariance: 0 })).toBe(12);
  });

  it('stays within +-rotateVariance of rotate', () => {
    const random = () => 1; // max end of the (random() - 0.5) * 2 range
    expect(resolvePageRotation({ rotate: 5, rotateVariance: 3 }, random)).toBe(
      8
    );
    const randomMin = () => 0;
    expect(
      resolvePageRotation({ rotate: 5, rotateVariance: 3 }, randomMin)
    ).toBe(2);
  });
});

describe('scannerEffect engine', () => {
  beforeEach(() => {
    currentPdfjsDoc = makePdfjsDoc();
    installCanvasMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('produces a valid PDF with one page per source page using default settings', async () => {
    const { scannerEffect, defaultScannerEffectOptions } =
      await import('./scanner-effect.js');
    expect(defaultScannerEffectOptions).toEqual({
      grayscale: false,
      border: false,
      rotate: 0,
      rotateVariance: 0,
      brightness: 0,
      contrast: 0,
      blur: 0,
      noise: 10,
      yellowish: 0,
      resolution: 150,
    });

    const file = new File([new Uint8Array([1])], 'doc.pdf', {
      type: 'application/pdf',
    });
    const result = await scannerEffect(file, defaultScannerEffectOptions, {
      signal: new AbortController().signal,
      progress: () => {},
      random: () => 0.5,
    });

    expect(result).toBeInstanceOf(File);
    const outDoc = await PDFDocument.load(await result.arrayBuffer());
    expect(outDoc.getPageCount()).toBe(NUM_PAGES);
  });

  it('reports progress per page', async () => {
    const { scannerEffect, defaultScannerEffectOptions } =
      await import('./scanner-effect.js');
    const file = new File([new Uint8Array([1])], 'doc.pdf', {
      type: 'application/pdf',
    });
    const labels: string[] = [];
    await scannerEffect(file, defaultScannerEffectOptions, {
      signal: new AbortController().signal,
      progress: (p) => labels.push(p.label),
      random: () => 0.5,
    });
    expect(labels).toEqual(
      expect.arrayContaining(['Page 1 of 2', 'Page 2 of 2'])
    );
  });

  it('throws a Cancelled error when aborted before starting', async () => {
    const { scannerEffect, defaultScannerEffectOptions } =
      await import('./scanner-effect.js');
    const controller = new AbortController();
    controller.abort();
    const file = new File([new Uint8Array([1])], 'doc.pdf', {
      type: 'application/pdf',
    });
    await expect(
      scannerEffect(file, defaultScannerEffectOptions, {
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
    const { scannerEffect, defaultScannerEffectOptions } =
      await import('./scanner-effect.js');
    const file = new File([new Uint8Array([1])], 'doc.pdf', {
      type: 'application/pdf',
    });
    await expect(
      scannerEffect(file, defaultScannerEffectOptions, {
        signal: new AbortController().signal,
        progress: () => {},
      })
    ).rejects.toThrow(/password/i);
  });
});
