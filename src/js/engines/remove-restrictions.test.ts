import { describe, it, expect, vi } from 'vitest';

function makeFakeQpdf(exitError = false) {
  const files = new Map<string, Uint8Array>();
  return {
    FS: {
      writeFile: (path: string, data: Uint8Array) => files.set(path, data),
      readFile: (path: string) => files.get(path) ?? new Uint8Array(),
      unlink: (path: string) => files.delete(path),
    },
    callMain: vi.fn((args: string[]) => {
      if (exitError)
        throw new Error('operation not permitted: password required');
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

const { removeRestrictions, defaultRemoveRestrictionsOptions } =
  await import('./remove-restrictions.js');

function makeFile(): File {
  return new File([new Uint8Array([1])], 'doc.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('removeRestrictions engine', () => {
  it('names the output with a -unrestricted suffix', async () => {
    fakeQpdf = makeFakeQpdf();
    const result = await removeRestrictions(
      makeFile(),
      defaultRemoveRestrictionsOptions,
      ctx
    );
    expect(result.name).toBe('doc-unrestricted.pdf');
  });

  it('passes the owner password when given', async () => {
    fakeQpdf = makeFakeQpdf();
    await removeRestrictions(makeFile(), { password: 'owner' }, ctx);
    const args = fakeQpdf.callMain.mock.calls[0][0] as string[];
    expect(args).toContain('--password=owner');
    expect(args).toContain('--remove-restrictions');
  });

  it('surfaces a password-related error clearly', async () => {
    fakeQpdf = makeFakeQpdf(true);
    await expect(
      removeRestrictions(makeFile(), defaultRemoveRestrictionsOptions, ctx)
    ).rejects.toThrow('owner password');
  });
});
