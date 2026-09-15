import { describe, it, expect } from 'vitest';
import { mimeTypeFor, extensionFor } from './pdf-to-cbz';

describe('pdf-to-cbz engine (pure parts)', () => {
  it('maps image formats to mime types', () => {
    expect(mimeTypeFor('jpeg')).toBe('image/jpeg');
    expect(mimeTypeFor('png')).toBe('image/png');
    expect(mimeTypeFor('webp')).toBe('image/webp');
  });
  it('maps image formats to file extensions', () => {
    expect(extensionFor('jpeg')).toBe('jpg');
    expect(extensionFor('png')).toBe('png');
    expect(extensionFor('webp')).toBe('webp');
  });
});
