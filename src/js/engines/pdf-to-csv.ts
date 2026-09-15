// Pure engine for the pdf-to-csv tool. See docs/TOOL-MIGRATION-GUIDE.md.
import { loadPyMuPDF, isPyMuPDFAvailable } from '../utils/pymupdf-loader.js';

export interface PdfToCsvOptions {
  [key: string]: never;
}

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
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

export async function pdfToCsv(
  file: File,
  _options: PdfToCsvOptions,
  ctx: EngineContext
): Promise<File> {
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

  const allRows: (string | null)[][] = [];
  for (let i = 0; i < pageCount; i++) {
    if (ctx.signal.aborted) throw new Error('Cancelled');
    ctx.progress({
      label: `Page ${i + 1} of ${pageCount}`,
      value: i / pageCount,
    });
    const page = doc.getPage(i);
    for (const table of page.findTables()) {
      allRows.push(...table.rows);
      allRows.push([]);
    }
  }

  const rows = allRows.filter((row) => row.length > 0);
  if (rows.length === 0)
    throw new Error('No tables were detected in this PDF.');

  const csvContent = tableToCsv(rows);
  return new File([csvContent], `${baseName}.csv`, {
    type: 'text/csv;charset=utf-8;',
  });
}
