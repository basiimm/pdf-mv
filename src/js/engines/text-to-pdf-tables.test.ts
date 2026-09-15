import { describe, it, expect } from 'vitest';
import { convertCsvFilesToPdf, convertXmlFilesToPdf } from './text-to-pdf.js';

function makeFile(name: string, content: string, type: string): File {
  return new File([content], name, { type });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('csv/xml table engines', () => {
  it('renders a CSV file as a non-empty PDF named after it', async () => {
    const file = makeFile('rows.csv', 'a,b\n1,2\n3,4\n', 'text/csv');
    const result = await convertCsvFilesToPdf([file], ctx);
    expect(result.name).toBe('rows.pdf');
    expect(result.type).toBe('application/pdf');
    expect(result.size).toBeGreaterThan(0);
  });

  it('renders an XML file as a non-empty PDF named after it', async () => {
    const file = makeFile(
      'data.xml',
      '<root><item a="1">x</item></root>',
      'text/xml'
    );
    const result = await convertXmlFilesToPdf([file], ctx);
    expect(result.name).toBe('data.pdf');
    expect(result.size).toBeGreaterThan(0);
  });

  it('combines multiple CSV files into one PDF, named after the first plus a count', async () => {
    const a = makeFile('a.csv', 'x,y\n1,2\n', 'text/csv');
    const b = makeFile('b.csv', 'x,y\n3,4\n', 'text/csv');
    const result = await convertCsvFilesToPdf([a, b], ctx);
    expect(result.name).toBe('a-and-1-more.pdf');
  });
});
