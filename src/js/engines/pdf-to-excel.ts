// Pure engine for the pdf-to-excel tool. See docs/TOOL-MIGRATION-GUIDE.md.
import * as XLSX from 'xlsx';
import { loadPyMuPDF, isPyMuPDFAvailable } from '../utils/pymupdf-loader.js';

export interface PdfToExcelOptions {
  [key: string]: never;
}

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

export interface EngineTable {
  page: number;
  rows: (string | null)[][];
}

/** Excel sheet names are capped at 31 characters. */
export function sheetNameFor(index: number, page: number): string {
  return `Table ${index + 1} (Page ${page})`.substring(0, 31);
}

export function buildWorkbook(tables: EngineTable[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  if (tables.length === 1) {
    const worksheet = XLSX.utils.aoa_to_sheet(tables[0].rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Table');
  } else {
    tables.forEach((table, idx) => {
      const worksheet = XLSX.utils.aoa_to_sheet(table.rows);
      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        sheetNameFor(idx, table.page)
      );
    });
  }
  return workbook;
}

export async function pdfToExcel(
  file: File,
  _options: PdfToExcelOptions,
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

  const tables: EngineTable[] = [];
  for (let i = 0; i < pageCount; i++) {
    if (ctx.signal.aborted) throw new Error('Cancelled');
    ctx.progress({
      label: `Page ${i + 1} of ${pageCount}`,
      value: i / pageCount,
    });
    const page = doc.getPage(i);
    for (const table of page.findTables()) {
      tables.push({ page: i + 1, rows: table.rows });
    }
  }

  if (tables.length === 0)
    throw new Error('No tables were detected in this PDF.');

  ctx.progress({ label: 'Creating Excel file', value: 0.95 });
  const workbook = buildWorkbook(tables);
  const xlsxData = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new File([xlsxData], `${baseName}.xlsx`, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
