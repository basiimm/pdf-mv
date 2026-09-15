import { describe, it, expect } from 'vitest';
import { renderJsonToPdfBlob } from './text-to-pdf.js';

describe('text-to-pdf engine (pure parts)', () => {
  it('renders valid JSON as a non-empty PDF blob', () => {
    const blob = renderJsonToPdfBlob('{"a":1,"b":[1,2,3]}', 'data.json');
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('falls back to raw text for invalid JSON without throwing', () => {
    const blob = renderJsonToPdfBlob('not json {{{', 'broken.json');
    expect(blob.size).toBeGreaterThan(0);
  });
});
