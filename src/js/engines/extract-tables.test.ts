import { describe, it, expect } from 'vitest';
import {
  tableToCsv,
  extensionFor,
  contentFor,
  type EngineTable,
} from './extract-tables';

const table: EngineTable = {
  page: 1,
  tableIndex: 1,
  rows: [
    ['a', 'b'],
    ['c', 'd'],
  ],
  markdown: '| a | b |\n| c | d |',
};

describe('extract-tables engine (pure parts)', () => {
  it('maps formats to file extensions', () => {
    expect(extensionFor('csv')).toBe('csv');
    expect(extensionFor('json')).toBe('json');
    expect(extensionFor('markdown')).toBe('md');
  });

  it('shapes a table as CSV', () => {
    expect(contentFor(table, 'csv')).toBe(tableToCsv(table.rows));
    expect(contentFor(table, 'csv')).toBe('a,b\nc,d');
  });

  it('shapes a table as pretty JSON rows', () => {
    expect(contentFor(table, 'json')).toBe(JSON.stringify(table.rows, null, 2));
  });

  it('shapes a table as its markdown rendering', () => {
    expect(contentFor(table, 'markdown')).toBe(table.markdown);
  });
});
