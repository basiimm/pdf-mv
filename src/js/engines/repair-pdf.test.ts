import { describe, it, expect, vi } from 'vitest';

function makeFakeQpdf() {
  const files = new Map<string, Uint8Array>();
  return {
    FS: {
      writeFile: (path: string, data: Uint8Array) => files.set(path, data),
      readFile: (path: string) => {
        const v = files.get(path);
        if (!v) throw new Error('not found');
        return v;
      },
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

const { repairPdf, defaultRepairOptions } = await import('./repair-pdf.js');

function makeFile(): File {
  return new File([new Uint8Array([1, 2])], 'broken.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('repairPdf engine', () => {
  it('names the output with a -repaired suffix', async () => {
    fakeQpdf = makeFakeQpdf();
    const result = await repairPdf(makeFile(), defaultRepairOptions, ctx);
    expect(result.name).toBe('broken-repaired.pdf');
  });

  it('throws when qpdf produces no output', async () => {
    fakeQpdf = makeFakeQpdf();
    fakeQpdf.callMain.mockImplementation(() => {
      throw new Error('fatal');
    });
    await expect(
      repairPdf(makeFile(), defaultRepairOptions, ctx)
    ).rejects.toThrow('Unable to repair');
  });

  it('rejects when cancelled', async () => {
    fakeQpdf = makeFakeQpdf();
    const controller = new AbortController();
    controller.abort();
    await expect(
      repairPdf(makeFile(), defaultRepairOptions, {
        signal: controller.signal,
        progress: () => {},
      })
    ).rejects.toThrow('Cancelled');
  });
});
