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

function makePdfjsDoc() {
  return {
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
    return {} as unknown as CanvasRenderingContext2D;
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

async function makeFile(pageSizes: [number, number][]): Promise<File> {
  const pdf = await PDFDocument.create();
  for (const [w, h] of pageSizes) pdf.addPage([w, h]);
  const bytes = await pdf.save();
  return new File([new Uint8Array(bytes)], 'doc.pdf', {
    type: 'application/pdf',
  });
}

describe('combineSinglePage engine', () => {
  beforeEach(() => {
    currentPdfjsDoc = makePdfjsDoc();
    installCanvasMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has the same defaults as the legacy combine-single-page page', async () => {
    const { defaultCombineSinglePageOptions } =
      await import('./combine-single-page.js');
    expect(defaultCombineSinglePageOptions).toEqual({
      orientation: 'vertical',
      spacing: 0,
      backgroundColor: '#FFFFFF',
      addSeparator: false,
      separatorThickness: 0.5,
      separatorColor: '#000000',
    });
  });

  it('always produces exactly one output page', async () => {
    const { combineSinglePage } = await import('./combine-single-page.js');
    const file = await makeFile([
      [100, 50],
      [100, 80],
      [100, 30],
    ]);
    const result = await combineSinglePage(
      file,
      {},
      { signal: new AbortController().signal, progress: () => {} }
    );
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getPageCount()).toBe(1);
  });

  it('stacks pages vertically: final height sums page heights plus spacing', async () => {
    const { combineSinglePage } = await import('./combine-single-page.js');
    const file = await makeFile([
      [100, 50],
      [120, 80],
      [90, 30],
    ]);
    const result = await combineSinglePage(
      file,
      { orientation: 'vertical', spacing: 10 },
      { signal: new AbortController().signal, progress: () => {} }
    );
    const doc = await PDFDocument.load(await result.arrayBuffer());
    const page = doc.getPage(0);
    // width = max(100,120,90) = 120; height = 50+80+30 + 2*10 spacing = 180
    expect(page.getWidth()).toBe(120);
    expect(page.getHeight()).toBe(180);
  });

  it('lays out pages horizontally: final width sums page widths plus spacing', async () => {
    const { combineSinglePage } = await import('./combine-single-page.js');
    const file = await makeFile([
      [100, 50],
      [120, 80],
      [90, 30],
    ]);
    const result = await combineSinglePage(
      file,
      { orientation: 'horizontal', spacing: 5 },
      { signal: new AbortController().signal, progress: () => {} }
    );
    const doc = await PDFDocument.load(await result.arrayBuffer());
    const page = doc.getPage(0);
    // width = 100+120+90 + 2*5 spacing = 320; height = max(50,80,30) = 80
    expect(page.getWidth()).toBe(320);
    expect(page.getHeight()).toBe(80);
  });

  it('reports progress per source page', async () => {
    const { combineSinglePage } = await import('./combine-single-page.js');
    const file = await makeFile([
      [100, 50],
      [100, 50],
    ]);
    const labels: string[] = [];
    await combineSinglePage(
      file,
      {},
      {
        signal: new AbortController().signal,
        progress: (p) => labels.push(p.label),
      }
    );
    expect(labels).toEqual(['Page 1 of 2', 'Page 2 of 2', 'Saving document']);
  });

  it('rejects when cancelled', async () => {
    const { combineSinglePage } = await import('./combine-single-page.js');
    const file = await makeFile([[100, 50]]);
    const controller = new AbortController();
    controller.abort();
    await expect(
      combineSinglePage(
        file,
        {},
        {
          signal: controller.signal,
          progress: () => {},
        }
      )
    ).rejects.toThrow('Cancelled');
  });
});
