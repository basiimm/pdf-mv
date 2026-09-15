import { describe, it, expect, vi } from 'vitest';

const convertFileToPdfAMock = vi.fn(async (file: File, level: string) => {
  return new Blob([await file.arrayBuffer()], { type: 'application/pdf' });
});
const rasterizePdfMock = vi.fn(
  async (file: File) => new Blob([await file.arrayBuffer()])
);

vi.mock('../utils/ghostscript-loader.js', () => ({
  convertFileToPdfA: convertFileToPdfAMock,
}));
vi.mock('../utils/pymupdf-loader.js', () => ({
  loadPyMuPDF: vi.fn(async () => ({ rasterizePdf: rasterizePdfMock })),
}));

const { pdfToPdfA, defaultPdfToPdfAOptions } = await import('./pdf-to-pdfa.js');

function makeFile(): File {
  return new File([new Uint8Array([1, 2, 3])], 'archive.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('pdfToPdfA engine', () => {
  it('converts using the requested PDF/A level and names the output', async () => {
    const result = await pdfToPdfA(makeFile(), defaultPdfToPdfAOptions, ctx);
    expect(result.name).toBe('archive-pdfa.pdf');
    expect(convertFileToPdfAMock).toHaveBeenCalledWith(
      expect.anything(),
      'PDF/A-2b',
      expect.any(Function)
    );
  });

  it('pre-flattens via PyMuPDF rasterization when requested', async () => {
    await pdfToPdfA(
      makeFile(),
      { ...defaultPdfToPdfAOptions, preFlatten: true },
      ctx
    );
    expect(rasterizePdfMock).toHaveBeenCalled();
  });

  it('rejects when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      pdfToPdfA(makeFile(), defaultPdfToPdfAOptions, {
        signal: controller.signal,
        progress: () => {},
      })
    ).rejects.toThrow('Cancelled');
  });
});
