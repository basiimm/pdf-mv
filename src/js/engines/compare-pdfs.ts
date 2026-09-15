// Pure engine for Compare PDFs. See docs/TOOL-MIGRATION-GUIDE.md.
// Reuses the word-level diff, page pairing and change classification from
// src/js/compare/engine (used by src/js/logic/compare-pdfs-page.ts and
// compare-render.ts) and turns them into per-page summaries with highlight
// rectangles normalised to the page (0–1), so any render scale can draw them.
// No DOM.
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { comparePageModels } from '../compare/engine/compare-page-models.js';
import { pairPages } from '../compare/engine/pair-pages.js';
import { joinCompareTextItems } from '../compare/engine/text-normalization.js';
import type {
  ComparePageModel,
  ComparePageResult,
  CompareRectangle,
  CompareTextItem,
} from '../compare/types.js';

export type CompareChangeKind = 'added' | 'removed' | 'changed';

/** Fractions of the page width/height, origin top-left. */
export interface CompareRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CompareChange {
  kind: CompareChangeKind;
  /** Legacy change type: added, removed, modified, moved, style-changed, page-added, page-removed. */
  type: string;
  description: string;
  before: string;
  after: string;
  /** Highlights on the first document's page. */
  leftRects: CompareRect[];
  /** Highlights on the second document's page. */
  rightRects: CompareRect[];
}

export interface PageComparison {
  /** 0-based position in the aligned page sequence. */
  index: number;
  /** Page in the first document (1-based), or null when the page was added. */
  leftPage: number | null;
  /** Page in the second document (1-based), or null when the page was removed. */
  rightPage: number | null;
  /** Page number used in labels. */
  page: number;
  added: number;
  removed: number;
  changed: number;
  changes: CompareChange[];
}

export interface CompareReport {
  leftName: string;
  rightName: string;
  leftPageCount: number;
  rightPageCount: number;
  pages: PageComparison[];
  totals: {
    added: number;
    removed: number;
    changed: number;
    changes: number;
    pagesWithChanges: number;
  };
  /** Pages whose text could not be read (likely scanned). */
  pagesWithoutText: number;
}

export interface CompareProgress {
  label: string;
  value?: number;
  detail?: string;
}

export interface CompareOptions {
  signal?: AbortSignal;
  progress?: (update: CompareProgress) => void;
  /** Override for tests; defaults to pdf.js text extraction. */
  extractModel?: (
    doc: PDFDocumentProxy,
    pageNumber: number
  ) => Promise<ComparePageModel>;
}

export interface CompareInput {
  name: string;
  document: PDFDocumentProxy;
}

const abortError = () => new DOMException('Comparison cancelled', 'AbortError');

function kindOf(type: string): CompareChangeKind {
  if (type === 'added' || type === 'page-added') return 'added';
  if (type === 'removed' || type === 'page-removed') return 'removed';
  return 'changed';
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function normalizeRects(
  rects: CompareRectangle[],
  size: { width: number; height: number } | null
): CompareRect[] {
  if (!size || size.width <= 0 || size.height <= 0) return [];
  return rects
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => {
      const x = clamp01(r.x / size.width);
      const y = clamp01(r.y / size.height);
      return {
        x,
        y,
        width: Math.min(1 - x, r.width / size.width),
        height: Math.min(1 - y, r.height / size.height),
      };
    });
}

/** Summarise one legacy page result into counts and normalised highlights. */
export function summarizePageResult(
  index: number,
  result: ComparePageResult,
  leftSize: { width: number; height: number } | null,
  rightSize: { width: number; height: number } | null
): PageComparison {
  const changes = result.changes.map(
    (change): CompareChange => ({
      kind: kindOf(change.type),
      type: change.type,
      description: change.description,
      before: change.beforeText,
      after: change.afterText,
      leftRects: normalizeRects(change.beforeRects, leftSize),
      rightRects: normalizeRects(change.afterRects, rightSize),
    })
  );
  const count = (kind: CompareChangeKind) =>
    changes.filter((c) => c.kind === kind).length;
  return {
    index,
    leftPage: result.leftPageNumber,
    rightPage: result.rightPageNumber,
    page: result.leftPageNumber ?? result.rightPageNumber ?? index + 1,
    added: count('added'),
    removed: count('removed'),
    changed: count('changed'),
    changes,
  };
}

/** Pair pages (tolerating inserted/removed pages) and diff each pair. */
export function compareModels(
  left: ComparePageModel[],
  right: ComparePageModel[]
): PageComparison[] {
  const signature = (model: ComparePageModel) => ({
    pageNumber: model.pageNumber,
    plainText: model.plainText,
    hasText: model.hasText,
    tokenItems: [] as CompareTextItem[],
  });
  const leftByPage = new Map(left.map((m) => [m.pageNumber, m]));
  const rightByPage = new Map(right.map((m) => [m.pageNumber, m]));
  const pairs = pairPages(left.map(signature), right.map(signature));
  return pairs.map((pair, index) => {
    const l =
      pair.leftPageNumber === null
        ? null
        : leftByPage.get(pair.leftPageNumber)!;
    const r =
      pair.rightPageNumber === null
        ? null
        : rightByPage.get(pair.rightPageNumber)!;
    const result = comparePageModels(l, r);
    return summarizePageResult(index, result, l, r);
  });
}

export function buildReport(
  leftName: string,
  rightName: string,
  left: ComparePageModel[],
  right: ComparePageModel[],
  pages = compareModels(left, right)
): CompareReport {
  const sum = (key: 'added' | 'removed' | 'changed') =>
    pages.reduce((total, page) => total + page[key], 0);
  const added = sum('added');
  const removed = sum('removed');
  const changed = sum('changed');
  return {
    leftName,
    rightName,
    leftPageCount: left.length,
    rightPageCount: right.length,
    pages,
    totals: {
      added,
      removed,
      changed,
      changes: added + removed + changed,
      pagesWithChanges: pages.filter((p) => p.changes.length).length,
    },
    pagesWithoutText: [...left, ...right].filter((m) => !m.hasText).length,
  };
}

/**
 * Synthetic page model from plain lines of text (one text item per line,
 * evenly spaced). Used for plain-text comparisons and tests.
 */
export function pageModelFromText(
  pageNumber: number,
  lines: string[],
  size = { width: 612, height: 792 }
): ComparePageModel {
  const lineHeight = 14;
  const textItems: CompareTextItem[] = lines
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((text, i) => ({
      id: `line-${pageNumber}-${i}`,
      text,
      normalizedText: text,
      rect: {
        x: 72,
        y: 72 + i * (lineHeight + 4),
        width: text.length * 6,
        height: lineHeight,
      },
    }));
  return {
    pageNumber,
    width: size.width,
    height: size.height,
    textItems,
    plainText: joinCompareTextItems(textItems),
    hasText: textItems.length > 0,
    source: 'pdfjs',
  };
}

async function defaultExtract(doc: PDFDocumentProxy, pageNumber: number) {
  const { extractPageModel } =
    await import('../compare/engine/extract-page-model.js');
  const page = await doc.getPage(pageNumber);
  try {
    return await extractPageModel(page, page.getViewport({ scale: 1 }));
  } finally {
    page.cleanup();
  }
}

async function readModels(
  input: CompareInput,
  extract: NonNullable<CompareOptions['extractModel']>,
  options: CompareOptions,
  offset: number,
  total: number
) {
  const models: ComparePageModel[] = [];
  for (let page = 1; page <= input.document.numPages; page++) {
    if (options.signal?.aborted) throw abortError();
    options.progress?.({
      label: 'Reading text…',
      value: (offset + page - 1) / total,
      detail: `${input.name}: page ${page} of ${input.document.numPages}`,
    });
    models.push(await extract(input.document, page));
  }
  return models;
}

/** Compare two loaded pdf.js documents. */
export async function compareDocuments(
  left: CompareInput,
  right: CompareInput,
  options: CompareOptions = {}
): Promise<CompareReport> {
  const extract = options.extractModel ?? defaultExtract;
  const total = Math.max(1, left.document.numPages + right.document.numPages);
  const leftModels = await readModels(left, extract, options, 0, total);
  const rightModels = await readModels(
    right,
    extract,
    options,
    left.document.numPages,
    total
  );
  if (options.signal?.aborted) throw abortError();
  options.progress?.({ label: 'Finding differences…', value: 1 });
  // Yield so the progress label paints before the synchronous diff.
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (options.signal?.aborted) throw abortError();
  return buildReport(left.name, right.name, leftModels, rightModels);
}

async function loadPdf(file: File): Promise<PDFDocumentProxy> {
  const pdfjs = await import('pdfjs-dist');
  await import('../utils/setup-pdf-worker.js');
  try {
    return await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    }).promise;
  } catch (error) {
    if ((error as { name?: string })?.name === 'PasswordException')
      throw new Error(
        `${file.name} is password-protected. Remove the password, then compare again.`,
        { cause: error }
      );
    throw error;
  }
}

/** Compare two PDF files (loads them with pdf.js). */
export async function comparePdfs(
  left: File,
  right: File,
  options: CompareOptions = {}
): Promise<CompareReport> {
  options.progress?.({ label: 'Opening PDFs…' });
  const [a, b] = await Promise.all([loadPdf(left), loadPdf(right)]);
  try {
    return await compareDocuments(
      { name: left.name, document: a },
      { name: right.name, document: b },
      options
    );
  } finally {
    void a.destroy();
    void b.destroy();
  }
}

// ---------- Report output ----------

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function pageLabel(page: PageComparison): string {
  if (page.leftPage === null) return `Page ${page.rightPage} (added)`;
  if (page.rightPage === null) return `Page ${page.leftPage} (removed)`;
  return page.leftPage === page.rightPage
    ? `Page ${page.leftPage}`
    : `Page ${page.leftPage} → ${page.rightPage}`;
}

export function summaryLine(report: CompareReport): string {
  const { changes, pagesWithChanges } = report.totals;
  if (!changes) return 'No text differences found';
  return `${plural(changes, 'change')} on ${plural(pagesWithChanges, 'page')}`;
}

export function formatReportText(report: CompareReport): string {
  const lines = [
    'PDF comparison report',
    '',
    `First PDF:  ${report.leftName} (${plural(report.leftPageCount, 'page')})`,
    `Second PDF: ${report.rightName} (${plural(report.rightPageCount, 'page')})`,
    '',
    `${summaryLine(report)}: ${report.totals.added} added, ${report.totals.removed} removed, ${report.totals.changed} changed.`,
  ];
  if (report.pagesWithoutText)
    lines.push(
      `${plural(report.pagesWithoutText, 'page')} had no readable text and could only be compared visually.`
    );
  for (const page of report.pages) {
    if (!page.changes.length) continue;
    lines.push(
      '',
      `${pageLabel(page)}: ${page.added} added, ${page.removed} removed, ${page.changed} changed`
    );
    for (const change of page.changes)
      lines.push(`  [${change.kind}] ${change.description}`);
  }
  return `${lines.join('\n')}\n`;
}

export function formatReportJson(report: CompareReport): string {
  return JSON.stringify(
    {
      first: { name: report.leftName, pages: report.leftPageCount },
      second: { name: report.rightName, pages: report.rightPageCount },
      totals: report.totals,
      pages: report.pages
        .filter((page) => page.changes.length)
        .map((page) => ({
          firstPage: page.leftPage,
          secondPage: page.rightPage,
          added: page.added,
          removed: page.removed,
          changed: page.changed,
          changes: page.changes.map((c) => ({
            kind: c.kind,
            type: c.type,
            before: c.before,
            after: c.after,
          })),
        })),
    },
    null,
    2
  );
}
