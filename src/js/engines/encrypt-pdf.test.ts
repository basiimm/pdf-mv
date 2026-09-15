import { describe, it, expect, vi } from 'vitest';

function makeFakeQpdf() {
  const files = new Map<string, Uint8Array>();
  return {
    FS: {
      writeFile: (path: string, data: Uint8Array) => files.set(path, data),
      readFile: (path: string) => files.get(path) ?? new Uint8Array(),
      unlink: (path: string) => files.delete(path),
    },
    callMain: vi.fn((args: string[]) => {
      // Simulate qpdf writing an "encrypted" (here: identical) output file.
      const inputPath = args[0];
      const outputPath = args[args.length - 1];
      files.set(outputPath, files.get(inputPath) ?? new Uint8Array([9]));
      return 0;
    }),
  };
}

let fakeQpdf: ReturnType<typeof makeFakeQpdf>;

vi.mock('@neslinesli93/qpdf-wasm', () => ({
  default: vi.fn(async () => fakeQpdf),
}));

const { encryptPdf, defaultEncryptOptions } = await import('./encrypt-pdf.js');

function makeFile(): File {
  return new File([new Uint8Array([1, 2, 3])], 'report.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('encryptPdf engine', () => {
  it('requires a user password', async () => {
    await expect(
      encryptPdf(makeFile(), defaultEncryptOptions, ctx)
    ).rejects.toThrow('password');
  });

  it('encrypts with the given password and adds restriction flags when an owner password is set', async () => {
    fakeQpdf = makeFakeQpdf();
    const result = await encryptPdf(
      makeFile(),
      { userPassword: 'user', ownerPassword: 'owner' },
      ctx
    );
    expect(result.name).toBe('report-encrypted.pdf');
    const args = fakeQpdf.callMain.mock.calls[0][0] as string[];
    expect(args).toContain('--encrypt');
    expect(args).toContain('user');
    expect(args).toContain('owner');
    expect(args).toContain('--modify=none');
  });

  it('omits restriction flags when no distinct owner password is given', async () => {
    fakeQpdf = makeFakeQpdf();
    await encryptPdf(
      makeFile(),
      { userPassword: 'user', ownerPassword: '' },
      ctx
    );
    const args = fakeQpdf.callMain.mock.calls[0][0] as string[];
    expect(args).not.toContain('--modify=none');
  });

  it('rejects when cancelled', async () => {
    fakeQpdf = makeFakeQpdf();
    const controller = new AbortController();
    controller.abort();
    await expect(
      encryptPdf(
        makeFile(),
        { userPassword: 'user' },
        { signal: controller.signal, progress: () => {} }
      )
    ).rejects.toThrow('Cancelled');
  });
});
