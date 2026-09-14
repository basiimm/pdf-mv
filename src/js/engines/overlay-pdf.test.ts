import { describe, it, expect } from 'vitest';
import { overlayPdf } from './overlay-pdf.js';

describe('overlayPdf engine (input validation)', () => {
  it('requires a base PDF', async () => {
    await expect(
      overlayPdf(
        [],
        {},
        { signal: new AbortController().signal, progress: () => {} }
      )
    ).rejects.toThrow('No PDF to apply the overlay to.');
  });

  it('requires an overlay PDF', async () => {
    const base = new File(['%PDF-1.4'], 'base.pdf', {
      type: 'application/pdf',
    });
    await expect(
      overlayPdf(
        [base],
        {},
        { signal: new AbortController().signal, progress: () => {} }
      )
    ).rejects.toThrow('Choose an overlay PDF');
  });

  it('rejects when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      overlayPdf([], {}, { signal: controller.signal, progress: () => {} })
    ).rejects.toThrow('Cancelled');
  });
});
