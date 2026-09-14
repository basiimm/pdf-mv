import { describe, it, expect, vi } from 'vitest';
import {
  createMergePanel,
  mergePageJobs,
  moveMergeItem,
} from './workspace-merge-panel';
describe('native merge output order', () => {
  it('keeps contiguous source ranges for the existing engine and omits unchecked pages', () => {
    expect(
      mergePageJobs([
        { source: 'a', index: 0, selected: true },
        { source: 'a', index: 1, selected: true },
        { source: 'a', index: 2, selected: false },
        { source: 'b', index: 2, selected: true },
        { source: 'a', index: 4, selected: true },
        { source: 'a', index: 3, selected: true },
      ])
    ).toEqual([
      { fileName: 'a', rangeType: 'range', startPage: 1, endPage: 2 },
      { fileName: 'b', rangeType: 'single', pageIndex: 2 },
      { fileName: 'a', rangeType: 'single', pageIndex: 4 },
      { fileName: 'a', rangeType: 'single', pageIndex: 3 },
    ]);
  });
  it('reorders without dropping entries and ignores moves beyond either boundary', () => {
    const pages = ['a', 'b', 'c'];
    expect(moveMergeItem(pages, 0, -1)).toBe(false);
    expect(moveMergeItem(pages, 2, 1)).toBe(false);
    expect(moveMergeItem(pages, 1, -1)).toBe(true);
    expect(pages).toEqual(['b', 'a', 'c']);
    expect(moveMergeItem(pages, 0, 1)).toBe(true);
    expect(pages).toEqual(['a', 'b', 'c']);
  });
  it('allows an empty selection without producing invalid engine jobs', () => {
    expect(mergePageJobs([{ source: 'a', index: 0, selected: false }])).toEqual(
      []
    );
  });
});

describe('native merge panel lifecycle', () => {
  it('provides one compact picker on the panel and central empty canvas, then cleans up both surfaces', () => {
    const host: Parameters<typeof createMergePanel>[0] = {
      activeId: () => 'empty-task',
      placeSignature: vi.fn(async () => {}),
      cancelSignature: vi.fn(),
      editMode: vi.fn(async () => {}),
      hasPdf: () => false,
      revision: () => 0,
      createTask: () => 'new-task',
      snapshot: vi.fn(
        async () => new File([], 'source.pdf', { type: 'application/pdf' })
      ),
      attach: vi.fn(async () => {}),
      result: vi.fn(async () => {}),
      status: vi.fn(),
    };
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    const panel = createMergePanel(host, 'empty-task', () => {});
    document.body.append(panel.root, panel.canvasRoot);
    expect(panel.sourceFiles()).toEqual([]);
    expect(
      panel.root.querySelector<HTMLInputElement>('input[type=file]')?.multiple
    ).toBe(true);
    const merge = Array.from(panel.root.querySelectorAll('button')).find(
      (b) => b.textContent === 'Merge PDF'
    );
    expect(merge?.disabled).toBe(true);
    expect(panel.canvasRoot.querySelector('button')?.textContent).toBe(
      'Choose files'
    );
    expect(panel.root.textContent).toContain('0 of 0 pages');
    panel.dispose();
    expect(panel.root.isConnected).toBe(false);
    expect(panel.canvasRoot.isConnected).toBe(false);
    vi.unstubAllGlobals();
  });
});
