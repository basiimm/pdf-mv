import { describe, it, expect, vi, afterEach } from 'vitest';
import { createComparePanel } from './compare-panel';
import type { ToolHost } from '../workspace-tools';
import type { GridPdfDocument } from './page-grid';
import type { CompareReport } from '../engines/compare-pdfs';

const pdf = (name: string) =>
  new File(['%PDF-1.7'], name, { type: 'application/pdf' });

function fakeDoc(pages: number): GridPdfDocument {
  return {
    numPages: pages,
    destroy: vi.fn(),
    async getPage() {
      return {
        getViewport: ({ scale }) => ({
          width: 600 * scale,
          height: 800 * scale,
        }),
        render: () => ({ promise: Promise.resolve() }),
      };
    },
  };
}

const report: CompareReport = {
  leftName: 'v1.pdf',
  rightName: 'v2.pdf',
  leftPageCount: 3,
  rightPageCount: 3,
  pagesWithoutText: 0,
  totals: { added: 2, removed: 1, changed: 1, changes: 4, pagesWithChanges: 2 },
  pages: [
    {
      index: 0,
      leftPage: 1,
      rightPage: 1,
      page: 1,
      added: 0,
      removed: 0,
      changed: 0,
      changes: [],
    },
    {
      index: 1,
      leftPage: 2,
      rightPage: 2,
      page: 2,
      added: 1,
      removed: 1,
      changed: 1,
      changes: [
        {
          kind: 'added',
          type: 'added',
          description: 'Added "new"',
          before: '',
          after: 'new',
          leftRects: [],
          rightRects: [{ x: 0.1, y: 0.5, width: 0.2, height: 0.02 }],
        },
        {
          kind: 'removed',
          type: 'removed',
          description: 'Removed "old"',
          before: 'old',
          after: '',
          leftRects: [{ x: 0.1, y: 0.4, width: 0.2, height: 0.02 }],
          rightRects: [],
        },
        {
          kind: 'changed',
          type: 'modified',
          description: 'Replaced "a" with "b"',
          before: 'a',
          after: 'b',
          leftRects: [{ x: 0.3, y: 0.6, width: 0.1, height: 0.02 }],
          rightRects: [{ x: 0.3, y: 0.6, width: 0.1, height: 0.02 }],
        },
      ],
    },
    {
      index: 2,
      leftPage: 3,
      rightPage: 3,
      page: 3,
      added: 1,
      removed: 0,
      changed: 0,
      changes: [
        {
          kind: 'added',
          type: 'added',
          description: 'Added "tail"',
          before: '',
          after: 'tail',
          leftRects: [],
          rightRects: [{ x: 0.1, y: 0.9, width: 0.2, height: 0.02 }],
        },
      ],
    },
  ],
};

function mockHost() {
  const host: ToolHost = {
    activeId: () => 'doc',
    placeSignature: vi.fn(async () => {}),
    cancelSignature: vi.fn(),
    editMode: vi.fn(async () => {}),
    hasPdf: () => true,
    revision: () => 1,
    createTask: () => 'new-task',
    snapshot: vi.fn(async () => pdf('v1.pdf')),
    attach: vi.fn(async () => {}),
    result: vi.fn(async () => {}),
    status: vi.fn(),
    commit: vi.fn(async () => {}),
    canUndoCommit: vi.fn(() => false),
    undoCommit: vi.fn(async () => null),
    showPreview: vi.fn(async () => {}),
    applyPreview: vi.fn(async () => {}),
    cancelPreview: vi.fn(async () => {}),
    isPreviewing: vi.fn(() => false),
  };
  return host;
}

async function until(check: () => boolean) {
  for (let i = 0; i < 200 && !check(); i++)
    await new Promise((r) => setTimeout(r, 5));
  expect(check()).toBe(true);
}
const buttonNamed = (scope: HTMLElement, label: string) =>
  [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === label
  )!;

afterEach(() => {
  vi.restoreAllMocks();
});

function mount(compare = vi.fn(async () => report)) {
  const host = mockHost();
  const panel = createComparePanel(host, 'doc', vi.fn(), {
    loadDocument: async () => fakeDoc(3),
    compare,
  });
  document.body.append(panel.root, panel.canvasRoot);
  panel.sync();
  return { host, panel, compare };
}

describe('compare panel', () => {
  it('asks for the second PDF, then shows the summary, legend and page rows', async () => {
    const { host, panel, compare } = mount();
    expect(panel.canvasRoot.textContent).toContain('Choose a PDF to compare');
    expect(buttonNamed(panel.root, 'Export report').disabled).toBe(true);

    panel.choose(pdf('v2.pdf'));
    await until(() => !!panel.report());
    expect(compare).toHaveBeenCalledTimes(1);
    const [left, right] = compare.mock.calls[0] as unknown as [
      { name: string },
      { name: string },
    ];
    expect(left.name).toBe('v1.pdf');
    expect(right.name).toBe('v2.pdf');
    expect(host.commit).not.toHaveBeenCalled();

    expect(
      panel.root.querySelector('.ds-compare-panel__summary')!.textContent
    ).toBe('4 changes on 2 pages');
    const chips = [...panel.root.querySelectorAll('.ds-compare-chip')].map(
      (c) => c.textContent
    );
    expect(chips).toEqual(['Added2', 'Removed1', 'Changed1']);
    const rows = [
      ...panel.root.querySelectorAll<HTMLButtonElement>(
        '.ds-compare-results__row'
      ),
    ];
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Page 2: 1 added, 1 removed, 1 changed',
      'Page 3: 1 added',
    ]);
    expect(buttonNamed(panel.root, 'Export report').disabled).toBe(false);

    // Two synced columns with headers and highlight overlays.
    const headers = [
      ...panel.canvasRoot.querySelectorAll('.ds-compare__name'),
    ].map((n) => n.textContent);
    expect(headers).toEqual(['v1.pdf', 'v2.pdf']);
    const columns = panel.canvasRoot.querySelectorAll('.ds-compare__scroll');
    expect(columns).toHaveLength(2);
    expect(columns[0].querySelectorAll('.ds-compare__page')).toHaveLength(3);
    expect(
      columns[0].querySelectorAll('.ds-compare__mark[data-kind=removed]')
    ).toHaveLength(1);
    expect(
      columns[1].querySelectorAll('.ds-compare__mark[data-kind=added]')
    ).toHaveLength(2);
    expect(
      columns[0].querySelectorAll('.ds-compare__mark[data-kind=added]')
    ).toHaveLength(0);
  });

  it('scrolls both columns to the page when a row is clicked', async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    const { panel } = mount();
    panel.choose(pdf('v2.pdf'));
    await until(
      () => panel.root.querySelectorAll('.ds-compare-results__row').length === 2
    );
    scrollTo.mockClear();

    const row = panel.root.querySelectorAll<HTMLButtonElement>(
      '.ds-compare-results__row'
    )[1];
    row.click();
    expect(row.getAttribute('aria-current')).toBe('true');
    const scrollers = [
      ...panel.canvasRoot.querySelectorAll('.ds-compare__scroll'),
    ];
    const targets = scrollTo.mock.contexts;
    expect(targets).toContain(scrollers[0]);
    expect(targets).toContain(scrollers[1]);
    const current = [
      ...panel.canvasRoot.querySelectorAll<HTMLElement>(
        '.ds-compare__page[data-current]'
      ),
    ];
    expect(
      current.map((p) => p.querySelector('.ds-compare__caption')!.textContent)
    ).toEqual(['Page 3', 'Page 3']);
    expect(
      panel.canvasRoot.querySelector('.ds-compare__position')!.textContent
    ).toBe('Page 2 of 2 with changes');
    // Previous change goes back to page 2.
    buttonNamed(panel.canvasRoot, 'Previous change').click();
    expect(
      panel.root
        .querySelectorAll('.ds-compare-results__row')[0]
        .getAttribute('aria-current')
    ).toBe('true');
    delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
  });

  it('switches to overlay, hides highlight kinds and exports a report', async () => {
    const { panel } = mount();
    panel.choose(pdf('v2.pdf'));
    await until(() => !!panel.report());
    buttonNamed(panel.root, 'Overlay').click();
    const compare = panel.canvasRoot.querySelector<HTMLElement>('.ds-compare')!;
    expect(compare.dataset.mode).toBe('overlay');
    expect(
      panel.canvasRoot.querySelectorAll('.ds-compare__scroll')
    ).toHaveLength(1);
    expect(
      panel.canvasRoot.querySelectorAll('.ds-compare__canvas[data-top]')
    ).toHaveLength(3);

    const added = panel.root.querySelector<HTMLButtonElement>(
      '.ds-compare-chip[data-kind=added]'
    )!;
    added.click();
    expect(compare.hasAttribute('data-hide-added')).toBe(true);
    expect(
      panel.root
        .querySelector('.ds-compare-chip[data-kind=added]')!
        .getAttribute('aria-pressed')
    ).toBe('false');

    const createObjectURL = vi.fn(() => 'blob:report');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const clicked = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    buttonNamed(panel.root, 'Export report').click();
    expect(clicked).toHaveBeenCalled();
    const file = (createObjectURL.mock.calls[0] as unknown as [File])[0];
    expect(file.name).toBe('v1-vs-v2-comparison.txt');
    expect(await file.text()).toContain('4 changes on 2 pages');
  });

  it('shows a recoverable error when comparison fails', async () => {
    const { panel } = mount(
      vi.fn(async () => {
        throw new Error('Broken file');
      })
    );
    panel.choose(pdf('v2.pdf'));
    await until(
      () => !!panel.root.querySelector('.ds-alert[data-tone=negative]')
    );
    expect(panel.root.textContent).toContain('The PDFs could not be compared');
    expect(buttonNamed(panel.root, 'Try again')).toBeTruthy();
  });
});
