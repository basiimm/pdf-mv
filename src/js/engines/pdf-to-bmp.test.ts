import { describe, it, expect } from 'vitest';
import { bmpZipName } from './pdf-to-bmp';

describe('pdf-to-bmp engine (pure parts)', () => {
  it('names the multi-page archive from the cleaned source filename', () => {
    expect(bmpZipName('Report.pdf')).toBe('Report-images.zip');
    expect(bmpZipName('already-clean')).toBe('already-clean-images.zip');
  });
});
