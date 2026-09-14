import { describe, it, expect } from 'vitest';
import { addAttachments } from './add-attachments.js';

describe('addAttachments engine (input validation)', () => {
  it('requires a base PDF', async () => {
    await expect(
      addAttachments(
        [],
        {},
        { signal: new AbortController().signal, progress: () => {} }
      )
    ).rejects.toThrow('No PDF to attach files to.');
  });

  it('requires at least one attachment', async () => {
    const pdf = new File(['%PDF-1.4'], 'doc.pdf', { type: 'application/pdf' });
    await expect(
      addAttachments(
        [pdf],
        {},
        { signal: new AbortController().signal, progress: () => {} }
      )
    ).rejects.toThrow('Choose at least one file to attach.');
  });

  it('rejects when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      addAttachments([], {}, { signal: controller.signal, progress: () => {} })
    ).rejects.toThrow('Cancelled');
  });
});
