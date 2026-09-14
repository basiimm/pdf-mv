import { describe, it, expect, vi } from 'vitest';

vi.mock('../logic/digital-sign-pdf.js', () => ({
  timestampPdf: vi.fn(async (bytes: Uint8Array, tsaUrl: string) => {
    if (tsaUrl === 'https://bad.example/tsa') {
      throw new Error('Invalid TSA URL.');
    }
    return bytes;
  }),
}));

const { timestampPdf } = await import('./timestamp-pdf.js');

function pdfFile(): File {
  return new File([new Uint8Array([1, 2, 3])], 'contract.pdf', {
    type: 'application/pdf',
  });
}

const ctx = () => ({ signal: new AbortController().signal, progress: vi.fn() });

describe('timestampPdf engine', () => {
  it('requires a TSA server', async () => {
    await expect(
      timestampPdf(pdfFile(), { tsaUrl: '' }, ctx())
    ).rejects.toThrow('timestamp authority');
  });

  it('timestamps and names the output with a -timestamped suffix', async () => {
    const result = await timestampPdf(
      pdfFile(),
      { tsaUrl: 'https://freetsa.org/tsr' },
      ctx()
    );
    expect(result.name).toBe('contract-timestamped.pdf');
    expect(result.type).toBe('application/pdf');
  });

  it('surfaces the underlying TSA error message', async () => {
    await expect(
      timestampPdf(pdfFile(), { tsaUrl: 'https://bad.example/tsa' }, ctx())
    ).rejects.toThrow('Invalid TSA URL.');
  });

  it('rejects when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      timestampPdf(
        pdfFile(),
        { tsaUrl: 'https://freetsa.org/tsr' },
        { signal: controller.signal, progress: vi.fn() }
      )
    ).rejects.toThrow('Cancelled');
  });
});
