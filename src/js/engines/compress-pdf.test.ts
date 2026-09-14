import { describe, it, expect, vi } from 'vitest';

const compressPdfMock = vi.fn(
  async (file: Blob, _options: Record<string, unknown>) => ({
    blob: file,
    compressedSize: 42,
  })
);

vi.mock('../utils/pymupdf-loader.js', () => ({
  loadPyMuPDF: vi.fn(async () => ({ compressPdf: compressPdfMock })),
}));

const { compressPdf, defaultCompressOptions } =
  await import('./compress-pdf.js');

function makeFile(): File {
  return new File([new Uint8Array([1, 2, 3])], 'report.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('compressPdf engine (condense algorithm)', () => {
  it('maps the level to PyMuPDF options and names the output', async () => {
    const result = await compressPdf(makeFile(), defaultCompressOptions, ctx);
    expect(result.name).toBe('report-compressed.pdf');
    const [, options] = compressPdfMock.mock.calls[0] as [
      Blob,
      { images: { dpiTarget: number }; scrub: { metadata: boolean } },
    ];
    expect(options.images.dpiTarget).toBe(96);
    expect(options.scrub.metadata).toBe(true);
  });

  it('lets custom settings override the level preset', async () => {
    await compressPdf(
      makeFile(),
      { ...defaultCompressOptions, imageQuality: 10, removeMetadata: false },
      ctx
    );
    const [, options] = compressPdfMock.mock.calls.at(-1)! as [
      Blob,
      { images: { quality: number }; scrub: { metadata: boolean } },
    ];
    expect(options.images.quality).toBe(10);
    expect(options.scrub.metadata).toBe(false);
  });

  it('rejects when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      compressPdf(makeFile(), defaultCompressOptions, {
        signal: controller.signal,
        progress: () => {},
      })
    ).rejects.toThrow('Cancelled');
  });
});
