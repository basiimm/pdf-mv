import { describe, it, expect, vi } from 'vitest';

vi.mock('heic2any', () => ({ default: vi.fn() }));

const { pdfOutputName, isValidQuality } = await import('./images-to-pdf.js');

function makeFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name);
}

describe('images-to-pdf engine (pure parts)', () => {
  it('names a single-file output after the source, minus extension', () => {
    expect(pdfOutputName([makeFile('photo.jpg')])).toBe('photo.pdf');
  });

  it('names a multi-file output using the first file and a count suffix', () => {
    expect(
      pdfOutputName([
        makeFile('photo.jpg'),
        makeFile('two.png'),
        makeFile('three.bmp'),
      ])
    ).toBe('photo-and-2-more.pdf');
  });

  it('validates the quality option', () => {
    expect(isValidQuality('high')).toBe(true);
    expect(isValidQuality('medium')).toBe(true);
    expect(isValidQuality('low')).toBe(true);
    expect(isValidQuality('ultra')).toBe(false);
  });
});
