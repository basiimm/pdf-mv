import { describe, it, expect } from 'vitest';
import { svgZipName } from './pdf-to-svg';

describe('pdf-to-svg engine (pure parts)', () => {
  it('names the multi-page archive from the cleaned source filename', () => {
    expect(svgZipName('Report.pdf')).toBe('Report-images.zip');
  });
});
