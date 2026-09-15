import { describe, it, expect } from 'vitest';
import { imagesZipName } from './extract-images';

describe('extract-images engine (pure parts)', () => {
  it('names the archive from the cleaned source filename', () => {
    expect(imagesZipName('Report.pdf')).toBe('Report-images.zip');
  });
});
