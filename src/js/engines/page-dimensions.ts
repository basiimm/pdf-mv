// Pure engine for the Page Dimensions tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/page-dimensions-page.ts. No DOM, no showAlert/showLoader.
// Read-only: the panel's `inspect` groups identical page sizes as details, and
// the primary action exports a full per-page table as CSV.
import { loadPdfDocument } from '../utils/load-pdf-document.js';

const STANDARD_SIZES: Record<string, { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  Letter: { width: 612, height: 792 },
  Legal: { width: 612, height: 1008 },
  Tabloid: { width: 792, height: 1224 },
  A3: { width: 841.89, height: 1190.55 },
  A5: { width: 419.53, height: 595.28 },
};

export interface PageSizeInfo {
  pageNum: number;
  width: number;
  height: number;
  orientation: 'Portrait' | 'Landscape';
  standardSize: string;
  rotation: number;
}

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

export function standardSizeName(width: number, height: number): string {
  const tolerance = 1;
  for (const [name, size] of Object.entries(STANDARD_SIZES)) {
    if (
      (Math.abs(width - size.width) < tolerance &&
        Math.abs(height - size.height) < tolerance) ||
      (Math.abs(width - size.height) < tolerance &&
        Math.abs(height - size.width) < tolerance)
    ) {
      return name;
    }
  }
  return 'Custom';
}

export function convertUnit(points: number, unit: string): number {
  switch (unit) {
    case 'in':
      return points / 72;
    case 'mm':
      return (points / 72) * 25.4;
    default:
      return points;
  }
}

export async function analyzePageDimensions(
  file: File
): Promise<PageSizeInfo[]> {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(bytes);
  return pdfDoc.getPages().map((page, i) => {
    const { width, height } = page.getSize();
    return {
      pageNum: i + 1,
      width,
      height,
      orientation: width > height ? 'Landscape' : 'Portrait',
      standardSize: standardSizeName(width, height),
      rotation: page.getRotation().angle || 0,
    };
  });
}

/** Groups consecutive pages that share the same size, orientation and rotation. */
export function groupPageSizes(
  pages: PageSizeInfo[]
): Array<{ range: string; label: string }> {
  const groups: Array<{ start: number; end: number; label: string }> = [];
  for (const p of pages) {
    const wmm = convertUnit(p.width, 'mm').toFixed(0);
    const hmm = convertUnit(p.height, 'mm').toFixed(0);
    const label = `${p.standardSize} ${p.orientation.toLowerCase()} · ${wmm} × ${hmm} mm`;
    const last = groups[groups.length - 1];
    if (last && last.label === label && last.end === p.pageNum - 1) {
      last.end = p.pageNum;
    } else {
      groups.push({ start: p.pageNum, end: p.pageNum, label });
    }
  }
  return groups.map((g) => ({
    range: g.start === g.end ? `Page ${g.start}` : `Pages ${g.start}–${g.end}`,
    label: g.label,
  }));
}

/** Label/value rows for the panel's read-only `inspect` details. */
export function pageDimensionDetails(
  pages: PageSizeInfo[]
): [string, string][] {
  return groupPageSizes(pages).map((g) => [g.range, g.label]);
}

export function pageDimensionsCsv(pages: PageSizeInfo[], unit: string): string {
  const headers = [
    'Page',
    `Width (${unit})`,
    `Height (${unit})`,
    'Standard size',
    'Orientation',
    'Aspect ratio',
    'Rotation',
  ];
  const rows = pages.map((p) => {
    const width = convertUnit(p.width, unit).toFixed(2);
    const height = convertUnit(p.height, unit).toFixed(2);
    const ratio = (p.width / p.height).toFixed(3);
    return [
      p.pageNum,
      width,
      height,
      p.standardSize,
      p.orientation,
      ratio,
      `${p.rotation}°`,
    ].join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}

export async function exportPageDimensionsCsv(
  file: File,
  options: { unit?: string },
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');
  ctx.progress({ label: 'Analyzing page sizes…' });
  const pages = await analyzePageDimensions(file);
  const csv = pageDimensionsCsv(pages, options.unit || 'mm');
  return new File([csv], `${baseName(file.name)}-page-sizes.csv`, {
    type: 'text/csv;charset=utf-8;',
  });
}
