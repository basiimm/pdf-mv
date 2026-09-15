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

const { changePermissions, defaultChangePermissionsOptions } =
  await import('./change-permissions.js');

function makeFile(): File {
  return new File([new Uint8Array([1])], 'doc.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('changePermissions engine', () => {
  it('requires an owner password when a user password is set', async () => {
    fakeQpdf = makeFakeQpdf();
    await expect(
      changePermissions(
        makeFile(),
        {
          ...defaultChangePermissionsOptions,
          newUserPassword: 'user',
          newOwnerPassword: '',
        },
        ctx
      )
    ).rejects.toThrow('owner password');
  });

  it('maps disallowed permissions to qpdf restriction flags', async () => {
    fakeQpdf = makeFakeQpdf();
    await changePermissions(
      makeFile(),
      {
        ...defaultChangePermissionsOptions,
        newOwnerPassword: 'owner',
        allowPrinting: false,
        allowCopying: false,
      },
      ctx
    );
    const args = fakeQpdf.callMain.mock.calls[0][0] as string[];
    expect(args).toContain('--print=none');
    expect(args).toContain('--extract=n');
  });

  it('falls back to --decrypt when no new passwords are given', async () => {
    fakeQpdf = makeFakeQpdf();
    await changePermissions(makeFile(), defaultChangePermissionsOptions, ctx);
    const args = fakeQpdf.callMain.mock.calls[0][0] as string[];
    expect(args).toContain('--decrypt');
  });

  it('names the output with a -permissions suffix', async () => {
    fakeQpdf = makeFakeQpdf();
    const result = await changePermissions(
      makeFile(),
      defaultChangePermissionsOptions,
      ctx
    );
    expect(result.name).toBe('doc-permissions.pdf');
  });
});
