import { describe, it, expect } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  buildReport,
  compareDocuments,
  compareModels,
  formatReportJson,
  formatReportText,
  pageLabel,
  pageModelFromText,
  summaryLine,
} from './compare-pdfs';

const page = (n: number, ...lines: string[]) => pageModelFromText(n, lines);

describe('compare PDFs engine', () => {
  it('reports no changes for identical text', () => {
    const left = [page(1, 'Hello world', 'Second line')];
    const right = [page(1, 'Hello world', 'Second line')];
    const report = buildReport('a.pdf', 'b.pdf', left, right);
    expect(report.totals.changes).toBe(0);
    expect(summaryLine(report)).toBe('No text differences found');
    expect(report.pages[0]).toMatchObject({ leftPage: 1, rightPage: 1 });
  });

  it('finds word-level additions, removals and replacements with rects', () => {
    const left = [page(1, 'The quick brown fox jumps', 'over the lazy dog')];
    const right = [
      page(
        1,
        'The quick red fox jumps',
        'over the lazy dog',
        'and runs away fast'
      ),
    ];
    const [result] = compareModels(left, right);
    expect(result.changed).toBeGreaterThanOrEqual(1);
    expect(result.added + result.removed + result.changed).toBe(
      result.changes.length
    );
    const replaced = result.changes.find((c) => c.kind === 'changed')!;
    expect(replaced.before).toContain('brown');
    expect(replaced.after).toContain('red');
    expect(replaced.leftRects.length).toBeGreaterThan(0);
    expect(replaced.rightRects.length).toBeGreaterThan(0);
    for (const rect of [...replaced.leftRects, ...replaced.rightRects]) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(1);
      expect(rect.y + rect.height).toBeLessThanOrEqual(1);
    }
    const kinds = result.changes.map((c) => c.kind);
    expect(kinds).toContain('added');
  });

  it('aligns inserted pages instead of reporting every later page as changed', () => {
    const left = [
      page(1, 'Introduction to the annual budget report'),
      page(2, 'Revenue grew across every region this year'),
      page(3, 'Appendix with detailed tables and notes'),
    ];
    const right = [
      page(1, 'Introduction to the annual budget report'),
      page(2, 'A brand new executive summary page inserted here'),
      page(3, 'Revenue grew across every region this year'),
      page(4, 'Appendix with detailed tables and notes'),
    ];
    const report = buildReport('v1.pdf', 'v2.pdf', left, right);
    expect(report.pages).toHaveLength(4);
    const added = report.pages.find((p) => p.leftPage === null)!;
    expect(added.rightPage).toBe(2);
    expect(added.added).toBe(1);
    expect(pageLabel(added)).toBe('Page 2 (added)');
    expect(report.totals.pagesWithChanges).toBe(1);
    const moved = report.pages.find((p) => p.leftPage === 2)!;
    expect(pageLabel(moved)).toBe('Page 2 → 3');
    expect(moved.changes).toHaveLength(0);
  });

  it('extracts through the injected model reader with progress and cancel', async () => {
    const doc = (pages: string[][]) =>
      ({ numPages: pages.length, pages }) as unknown as PDFDocumentProxy;
    const extractModel = async (d: PDFDocumentProxy, n: number) =>
      page(n, ...(d as unknown as { pages: string[][] }).pages[n - 1]);
    const updates: string[] = [];
    const report = await compareDocuments(
      { name: 'a.pdf', document: doc([['alpha beta'], ['gamma']]) },
      { name: 'b.pdf', document: doc([['alpha delta'], ['gamma']]) },
      { extractModel, progress: (u) => updates.push(u.label) }
    );
    expect(updates).toContain('Reading text…');
    expect(report.totals.changes).toBe(1);
    expect(report.totals.pagesWithChanges).toBe(1);
    expect(summaryLine(report)).toBe('1 change on 1 page');

    const controller = new AbortController();
    controller.abort();
    await expect(
      compareDocuments(
        { name: 'a.pdf', document: doc([['x']]) },
        { name: 'b.pdf', document: doc([['y']]) },
        { extractModel, signal: controller.signal }
      )
    ).rejects.toThrow(/cancel/i);
  });

  it('formats text and JSON reports', () => {
    const report = buildReport(
      'a.pdf',
      'b.pdf',
      [page(1, 'one two three')],
      [page(1, 'one 2 three')]
    );
    const text = formatReportText(report);
    expect(text).toContain('First PDF:  a.pdf (1 page)');
    expect(text).toContain('Page 1: 0 added, 0 removed, 1 changed');
    const json = JSON.parse(formatReportJson(report));
    expect(json.totals.changes).toBe(1);
    expect(json.pages[0].changes[0]).toMatchObject({
      kind: 'changed',
      before: 'two',
      after: '2',
    });
  });
});
