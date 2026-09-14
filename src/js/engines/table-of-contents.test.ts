import { describe, it, expect } from 'vitest';
import { generateTableOfContents } from './table-of-contents.js';

describe('generateTableOfContents engine', () => {
  it('rejects when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const file = new File(['%PDF-1.4'], 'doc.pdf', { type: 'application/pdf' });
    await expect(
      generateTableOfContents(
        file,
        {},
        { signal: controller.signal, progress: () => {} }
      )
    ).rejects.toThrow('Cancelled');
  });
});
