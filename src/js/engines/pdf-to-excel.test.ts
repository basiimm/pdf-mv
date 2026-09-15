import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { sheetNameFor, buildWorkbook, type EngineTable } from './pdf-to-excel';

describe('pdf-to-excel engine (pure parts)', () => {
  it('truncates sheet names to the 31-character Excel limit', () => {
    const name = sheetNameFor(0, 123456789);
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).toBe('Table 1 (Page 123456789)'.substring(0, 31));
  });

  it('puts a single table on a sheet named "Table"', () => {
    const tables: EngineTable[] = [{ page: 1, rows: [['a', 'b']] }];
    const wb = buildWorkbook(tables);
    expect(wb.SheetNames).toEqual(['Table']);
  });

  it('gives each table its own page-labeled sheet when there are several', () => {
    const tables: EngineTable[] = [
      { page: 1, rows: [['a']] },
      { page: 2, rows: [['b']] },
    ];
    const wb = buildWorkbook(tables);
    expect(wb.SheetNames).toEqual(['Table 1 (Page 1)', 'Table 2 (Page 2)']);
    expect(
      XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
    ).toEqual([['a']]);
  });
});
