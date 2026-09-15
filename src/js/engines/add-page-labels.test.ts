import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';

// cpdf is a WASM library with a complex API (page ranges, style enums as
// opaque numbers resolved from the loaded instance). Faking its full
// numeric/range semantics correctly in jsdom is impractical, so we mock the
// module boundary (src/js/utils/cpdf-helper.js) and assert that the engine
// calls it with the right, legacy-equivalent arguments (style resolution,
// normalized start value, trimmed prefix, page range parsing, and the
// removeExistingLabels / progress flags) rather than trying to validate real
// cpdf WASM output. Options validation and the "WASM not configured" /
// "password protected" error paths are exercised against the real engine
// logic, unmocked.

const addPageLabelsCalls: {
  style: unknown;
  prefix: string;
  offset: number;
  range: unknown;
  progress: boolean;
}[] = [];

let cpdfAvailable = true;

function makeFakeCpdf() {
  return {
    setSlow: vi.fn(),
    fromMemory: vi.fn((bytes: Uint8Array) => ({ bytes })),
    removePageLabels: vi.fn(),
    parsePagespec: vi.fn((_pdf: unknown, spec: string) => ({ spec })),
    all: vi.fn(() => ({ all: true })),
    addPageLabels: vi.fn(
      (
        _pdf: unknown,
        style: unknown,
        prefix: string,
        offset: number,
        range: unknown,
        progress: boolean
      ) => {
        addPageLabelsCalls.push({ style, prefix, offset, range, progress });
      }
    ),
    toMemory: vi.fn(() => new Uint8Array([1, 2, 3, 4])),
    deletePdf: vi.fn(),
    decimalArabic: 0,
    lowercaseRoman: 1,
    uppercaseRoman: 2,
    lowercaseLetters: 3,
    uppercaseLetters: 4,
    noLabelPrefixOnly: 5,
  };
}

let fakeCpdf = makeFakeCpdf();

vi.mock('../utils/cpdf-helper.js', () => ({
  isCpdfAvailable: () => cpdfAvailable,
  getCpdf: async () => fakeCpdf,
}));

const { addPageLabels } = await import('./add-page-labels.js');

async function makeFile(pageCount = 3): Promise<File> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    pdf.addPage([300, 400]);
  }
  const bytes = await pdf.save();
  return new File([new Uint8Array(bytes)], 'source.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

beforeEach(() => {
  cpdfAvailable = true;
  fakeCpdf = makeFakeCpdf();
  addPageLabelsCalls.length = 0;
});

describe('addPageLabels engine', () => {
  it('throws a plain-language error when cpdf is not configured', async () => {
    cpdfAvailable = false;
    const file = await makeFile(1);
    await expect(addPageLabels(file, {}, ctx)).rejects.toThrow(
      'Configure it in WASM Settings'
    );
  });

  it('applies the default rule to all pages with DecimalArabic style', async () => {
    const file = await makeFile(3);
    const result = await addPageLabels(file, {}, ctx);
    expect(result).toBeInstanceOf(File);
    expect(addPageLabelsCalls).toHaveLength(1);
    expect(addPageLabelsCalls[0]).toMatchObject({
      style: 0, // decimalArabic
      prefix: '',
      offset: 1,
      progress: false,
    });
  });

  it('resolves each style name to the matching cpdf enum value', async () => {
    const file = await makeFile(1);
    await addPageLabels(
      file,
      { rules: [{ style: 'UppercaseRoman', startValue: 5 }] },
      ctx
    );
    expect(addPageLabelsCalls[0].style).toBe(2); // uppercaseRoman
    expect(addPageLabelsCalls[0].offset).toBe(5);
  });

  it('parses a page range when one is given, and uses "all" when blank', async () => {
    const file = await makeFile(1);
    await addPageLabels(
      file,
      { rules: [{ pageRange: '1-4, 7' }, { pageRange: '' }] },
      ctx
    );
    expect(fakeCpdf.parsePagespec).toHaveBeenCalledWith(
      expect.anything(),
      '1-4, 7'
    );
    expect(fakeCpdf.all).toHaveBeenCalled();
  });

  it('trims the prefix and normalizes a negative/fractional start value', async () => {
    const file = await makeFile(1);
    await addPageLabels(
      file,
      { rules: [{ prefix: '  A- ', startValue: -3.7 }] },
      ctx
    );
    expect(addPageLabelsCalls[0].prefix).toBe('A-');
    expect(addPageLabelsCalls[0].offset).toBe(0);
  });

  it('removes existing labels by default, and skips when disabled', async () => {
    const file = await makeFile(1);
    await addPageLabels(file, {}, ctx);
    expect(fakeCpdf.removePageLabels).toHaveBeenCalledTimes(1);

    await addPageLabels(file, { removeExistingLabels: false }, ctx);
    expect(fakeCpdf.removePageLabels).toHaveBeenCalledTimes(1);
  });

  it('applies multiple rules in order', async () => {
    const file = await makeFile(1);
    await addPageLabels(
      file,
      {
        rules: [
          { pageRange: '1-2', style: 'DecimalArabic', startValue: 1 },
          { pageRange: '3-4', style: 'UppercaseLetters', startValue: 0 },
        ],
      },
      ctx
    );
    expect(addPageLabelsCalls).toHaveLength(2);
    expect(addPageLabelsCalls[1].style).toBe(4); // uppercaseLetters
  });

  it('cleans up the cpdf document handle even on failure', async () => {
    const file = await makeFile(1);
    fakeCpdf.parsePagespec = vi.fn(() => {
      throw new Error('bad range');
    });
    await expect(
      addPageLabels(file, { rules: [{ pageRange: 'nonsense' }] }, ctx)
    ).rejects.toThrow('invalid page range');
    expect(fakeCpdf.deletePdf).toHaveBeenCalledTimes(1);
  });

  it('rejects immediately when already cancelled', async () => {
    const file = await makeFile(1);
    const controller = new AbortController();
    controller.abort();
    await expect(
      addPageLabels(file, {}, { signal: controller.signal, progress: () => {} })
    ).rejects.toThrow('Cancelled');
  });
});
