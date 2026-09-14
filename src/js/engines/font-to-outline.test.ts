import { describe, it, expect, vi } from 'vitest';

const convertFileToOutlinesMock = vi.fn(
  async (file: File) => new Blob([await file.arrayBuffer()])
);

vi.mock('../utils/ghostscript-loader.js', () => ({
  convertFileToOutlines: convertFileToOutlinesMock,
}));

const { fontToOutline, defaultFontToOutlineOptions } =
  await import('./font-to-outline.js');

function makeFile(): File {
  return new File([new Uint8Array([1])], 'brochure.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('fontToOutline engine', () => {
  it('delegates to Ghostscript and names the output', async () => {
    const result = await fontToOutline(
      makeFile(),
      defaultFontToOutlineOptions,
      ctx
    );
    expect(result.name).toBe('brochure-outlined.pdf');
    expect(convertFileToOutlinesMock).toHaveBeenCalled();
  });

  it('rejects when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      fontToOutline(makeFile(), defaultFontToOutlineOptions, {
        signal: controller.signal,
        progress: () => {},
      })
    ).rejects.toThrow('Cancelled');
  });
});
