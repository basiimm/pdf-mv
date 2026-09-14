import { describe, it, expect, vi } from 'vitest';

vi.mock('../utils/pdf-decrypt.js', () => ({
  decryptPdfBytes: vi.fn(async (bytes: Uint8Array, password: string) => {
    if (password !== 'correct') {
      throw new Error('INVALID_PASSWORD');
    }
    return { bytes, engine: 'cpdf' };
  }),
}));

const { decryptPdf, defaultDecryptOptions } = await import('./decrypt-pdf.js');

function makeFile(): File {
  return new File([new Uint8Array([1, 2, 3])], 'secret.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('decryptPdf engine', () => {
  it('throws a clear error when no password is given', async () => {
    await expect(
      decryptPdf(makeFile(), defaultDecryptOptions, ctx)
    ).rejects.toThrow('password');
  });

  it('throws a friendly message on an incorrect password', async () => {
    await expect(
      decryptPdf(makeFile(), { password: 'wrong' }, ctx)
    ).rejects.toThrow('Incorrect password');
  });

  it('decrypts and names the output with a -decrypted suffix', async () => {
    const result = await decryptPdf(makeFile(), { password: 'correct' }, ctx);
    expect(result.name).toBe('secret-decrypted.pdf');
    expect(result.type).toBe('application/pdf');
  });

  it('rejects when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      decryptPdf(
        makeFile(),
        { password: 'correct' },
        { signal: controller.signal, progress: () => {} }
      )
    ).rejects.toThrow('Cancelled');
  });
});
