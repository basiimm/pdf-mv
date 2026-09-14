import { describe, it, expect } from 'vitest';
import {
  sensitivityToThreshold,
  removeBlankPages,
} from './remove-blank-pages.js';

describe('sensitivityToThreshold', () => {
  it('maps 0-100 sensitivity to a smaller non-white percent threshold as it increases', () => {
    const low = sensitivityToThreshold(0, false);
    const high = sensitivityToThreshold(100, false);
    expect(low).toBeGreaterThan(high);
    expect(high).toBeCloseTo(0.1, 5);
  });

  it('doubles the threshold when treating nearly-blank pages as blank', () => {
    const normal = sensitivityToThreshold(80, false);
    const lenient = sensitivityToThreshold(80, true);
    expect(lenient).toBeCloseTo(normal * 2, 5);
  });
});

describe('removeBlankPages engine', () => {
  it('rejects when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const file = new File(['%PDF-1.4'], 'doc.pdf', { type: 'application/pdf' });
    await expect(
      removeBlankPages(
        file,
        {},
        { signal: controller.signal, progress: () => {} }
      )
    ).rejects.toThrow('Cancelled');
  });
});
