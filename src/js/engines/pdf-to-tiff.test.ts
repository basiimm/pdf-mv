import { describe, it, expect } from 'vitest';
import { predictorFor } from './pdf-to-tiff';

const fakeVips = {
  ForeignTiffPredictor: { horizontal: 'horizontal', none: 'none' },
} as never;

describe('pdf-to-tiff engine (pure parts)', () => {
  it('uses a horizontal predictor for lzw and deflate compression', () => {
    expect(predictorFor(fakeVips, 'lzw')).toBe('horizontal');
    expect(predictorFor(fakeVips, 'deflate')).toBe('horizontal');
  });
  it('uses no predictor for other compressions', () => {
    expect(predictorFor(fakeVips, 'jpeg')).toBe('none');
    expect(predictorFor(fakeVips, 'ccittfax4')).toBe('none');
    expect(predictorFor(fakeVips, 'none')).toBe('none');
  });
});
