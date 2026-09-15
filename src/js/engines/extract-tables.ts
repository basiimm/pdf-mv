// Pure engine for the extract-tables tool. See docs/TOOL-MIGRATION-GUIDE.md.
import JSZip from 'jszip';
import { loadPyMuPDF, isPyMuPDFAvailable } from '../utils/pymupdf-loader.js';

export type ExtractTablesFormat = 'csv' | 'json' | 'markdown';

export interface ExtractTablesOptions {
  format?: ExtractTablesFormat;
}

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

export interface EngineTable {
  page: number;
  tableIndex: number;
  rows: (string | null)[][];
  markdown: string;
}

function csvCell(cell: string | null): string {
  const cellStr = cell ?? '';
  if (
    cellStr.includes(',') ||
    cellStr.includes('"') ||
    cellStr.includes('\n')
  ) {
    return `"${cellStr.replace(/"/g, '""')}"`;
  }
  return cellStr;
}

export function tableToCsv(rows: (string | null)[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function extensionFor(format: ExtractTablesFormat): string {
  return { csv: 'csv', json: 'json', markdown: 'md' }[format];
}

export function contentFor(
  table: EngineTable,
  format: ExtractTablesFormat
): string {
  if (format === 'csv') return tableToCsv(table.rows);
  if (format === 'json') return JSON.stringify(table.rows, null, 2);
  return table.markdown;
}

export async function extractTables(
  file: File,
  options: ExtractTablesOptions,
  ctx: EngineContext
): Promise<File | File[]> {
  const format = options.format ?? 'csv';
  if (!isPyMuPDFAvailable()) {
    throw new Error(
      'The PyMuPDF WASM engine is not configured. Configure it in WASM Settings.'
    );
  }
  ctx.progress({ label: 'Loading engine…' });
  const pymupdf = await loadPyMuPDF();

  const doc = await pymupdf.open(file);
  const pageCount = doc.pageCount;
  const baseName = file.name.replace(/\.[^/.]+$/, '');

  const tables: EngineTable[] = [];
  for (let i = 0; i < pageCount; i++) {
    if (ctx.signal.aborted) throw new Error('Cancelled');
    ctx.progress({
      label: `Page ${i + 1} of ${pageCount}`,
      value: i / pageCount,
    });
    const page = doc.getPage(i);
    page.findTables().forEach((table, tableIdx) => {
      tables.push({
        page: i + 1,
        tableIndex: tableIdx + 1,
        rows: table.rows,
        markdown: table.markdown,
      });
    });
  }

  if (tables.length === 0)
    throw new Error('No tables were detected in this PDF.');

  const ext = extensionFor(format);
  if (tables.length === 1) {
    const content = contentFor(tables[0], format);
    const mimeType =
      format === 'csv'
        ? 'text/csv'
        : format === 'json'
          ? 'application/json'
          : 'text/markdown';
    return new File([content], `${baseName}_table.${ext}`, { type: mimeType });
  }

  ctx.progress({ label: 'Creating ZIP file', value: 0.95 });
  const zip = new JSZip();
  tables.forEach((table, idx) => {
    zip.file(
      `table_${idx + 1}_page${table.page}.${ext}`,
      contentFor(table, format)
    );
  });
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return new File([zipBlob], `${baseName}_tables.zip`, {
    type: 'application/zip',
  });
}
