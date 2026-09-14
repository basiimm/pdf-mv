import { describe, it, expect } from 'vitest';
import { alternateMerge } from './alternate-merge.js';

describe('alternateMerge engine (input validation)', () => {
  it('requires at least two PDFs', async () => {
    const pdf = new File(['%PDF-1.4'], 'doc.pdf', { type: 'application/pdf' });
    await expect(
      alternateMerge(
        [pdf],
        {},
        { signal: new AbortController().signal, progress: () => {} }
      )
    ).rejects.toThrow('Choose at least one more PDF');
  });

  it('rejects when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      alternateMerge([], {}, { signal: controller.signal, progress: () => {} })
    ).rejects.toThrow('Cancelled');
  });
});
