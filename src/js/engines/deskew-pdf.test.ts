import { describe, it, expect, vi } from 'vitest';

const deskewPdfMock = vi.fn(async (file: File) => ({
  pdf: new Blob([await file.arrayBuffer()]),
  result: {
    totalPages: 1,
    correctedPages: 1,
    angles: [1.2],
    corrected: [true],
  },
}));
const loadMock = vi.fn(async () => {});

vi.mock('../utils/pymupdf-loader.js', () => ({
  loadPyMuPDF: vi.fn(async () => ({
    load: loadMock,
    deskewPdf: deskewPdfMock,
  })),
}));

const { deskewPdf, defaultDeskewPdfOptions } = await import('./deskew-pdf.js');

function makeFile(): File {
  return new File([new Uint8Array([1])], 'scan.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('deskewPdf engine', () => {
  it('passes threshold/dpi through and names the output', async () => {
    const result = await deskewPdf(
      makeFile(),
      { threshold: 0.1, dpi: 300 },
      ctx
    );
    expect(result.name).toBe('scan-deskewed.pdf');
    expect(deskewPdfMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ threshold: 0.1, dpi: 300 })
    );
  });

  it('uses sensible defaults', async () => {
    await deskewPdf(makeFile(), defaultDeskewPdfOptions, ctx);
    expect(deskewPdfMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ threshold: 0.5, dpi: 150 })
    );
  });

  it('rejects when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      deskewPdf(makeFile(), defaultDeskewPdfOptions, {
        signal: controller.signal,
        progress: () => {},
      })
    ).rejects.toThrow('Cancelled');
  });
});
