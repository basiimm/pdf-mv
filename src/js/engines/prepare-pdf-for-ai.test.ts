import { describe, it, expect } from 'vitest';
import { llmJsonNameFor } from './prepare-pdf-for-ai';

describe('prepare-pdf-for-ai engine (pure parts)', () => {
  it('appends _llm.json in place of the .pdf extension', () => {
    expect(llmJsonNameFor('Report.pdf')).toBe('Report_llm.json');
    expect(llmJsonNameFor('Report.PDF')).toBe('Report_llm.json');
  });
});
