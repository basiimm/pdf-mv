import { describe, it, expect, vi } from 'vitest';

const rasterizePdfMock = vi.fn(
  async (file: File, options: unknown) => new Blob([await file.arrayBuffer()])
);

vi.mock('../utils/pymupdf-loader.js', () => ({
  loadPyMuPDF: vi.fn(async () => ({ rasterizePdf: rasterizePdfMock })),
}));

const { rasterizePdf, defaultRasterizePdfOptions } =
  await import('./rasterize-pdf.js');

function makeFile(): File {
  return new File([new Uint8Array([1])], 'scan.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('rasterizePdf engine', () => {
  it('passes dpi/format/grayscale through and names the output', async () => {
    const result = await rasterizePdf(
      makeFile(),
      { dpi: 300, format: 'jpeg', grayscale: true },
      ctx
    );
    expect(result.name).toBe('scan-rasterized.pdf');
    expect(rasterizePdfMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dpi: 300, format: 'jpeg', grayscale: true })
    );
  });

  it('uses sensible defaults', async () => {
    await rasterizePdf(makeFile(), defaultRasterizePdfOptions, ctx);
    expect(rasterizePdfMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dpi: 150, format: 'png', grayscale: false })
    );
  });

  it('rejects when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      rasterizePdf(makeFile(), defaultRasterizePdfOptions, {
        signal: controller.signal,
        progress: () => {},
      })
    ).rejects.toThrow('Cancelled');
  });
});
