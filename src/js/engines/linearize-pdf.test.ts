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

const { linearizePdf, defaultLinearizeOptions } =
  await import('./linearize-pdf.js');

function makeFile(): File {
  return new File([new Uint8Array([1])], 'doc.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('linearizePdf engine', () => {
  it('calls qpdf with --linearize', async () => {
    fakeQpdf = makeFakeQpdf();
    await linearizePdf(makeFile(), defaultLinearizeOptions, ctx);
    const args = fakeQpdf.callMain.mock.calls[0][0] as string[];
    expect(args).toContain('--linearize');
  });

  it('names the output with a -optimized suffix', async () => {
    fakeQpdf = makeFakeQpdf();
    const result = await linearizePdf(makeFile(), defaultLinearizeOptions, ctx);
    expect(result.name).toBe('doc-optimized.pdf');
  });

  it('reports a password error clearly', async () => {
    fakeQpdf = makeFakeQpdf();
    fakeQpdf.callMain.mockImplementation(() => {
      throw new Error('file is encrypted');
    });
    await expect(
      linearizePdf(makeFile(), defaultLinearizeOptions, ctx)
    ).rejects.toThrow('password');
  });
});
