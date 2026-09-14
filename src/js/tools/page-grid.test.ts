import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPageGrid, type GridPdfDocument } from './page-grid';
import type { PagePlanItem } from './page-plan';

export function fakeDocument(numPages: number): GridPdfDocument & {
  destroy: ReturnType<typeof vi.fn>;
  renders: number;
} {
  const doc = {
    numPages,
    renders: 0,
    destroy: vi.fn(),
    async getPage() {
      return {
        getViewport: ({ scale }: { scale: number }) => ({
          width: 600 * scale,
          height: 800 * scale,
        }),
        render: () => {
          doc.renders++;
          return { promise: Promise.resolve() };
        },
      };
    },
  };
  return doc;
}

const bytes = () => new ArrayBuffer(8);

async function setup(
  counts: number[] = [5],
  mode: 'organize' | 'split' = 'organize'
) {
  const docs = counts.map(fakeDocument);
  let n = 0;
  const grid = createPageGrid({
    sources: counts.map((_, i) => ({
      name: `file-${i + 1}.pdf`,
      bytes: bytes(),
    })),
    mode,
    loadDocument: async () => docs[n++],
  });
  document.body.append(grid.root);
  await grid.ready;
  const cards = () => [
    ...grid.root.querySelectorAll<HTMLButtonElement>('[role=option]'),
  ];
  const toolbarButton = (label: string) =>
    [
      ...grid.root.querySelectorAll<HTMLButtonElement>('[role=toolbar] button'),
    ].find((b) => (b.getAttribute('aria-label') ?? b.textContent) === label)!;
  const key = (keyName: string, init: KeyboardEventInit = {}) => {
    const target = (document.activeElement as HTMLElement) ?? cards()[0];
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: keyName, bubbles: true, ...init })
    );
  };
  const click = (index: number, init: MouseEventInit = {}) =>
    cards()[index].dispatchEvent(
      new MouseEvent('click', { bubbles: true, ...init })
    );
  const pages = () =>
    grid.getPlan().map((item) => ('blank' in item ? 'blank' : item.page));
  const live = () => grid.root.querySelector('[aria-live]')!.textContent;
  return { grid, docs, cards, toolbarButton, key, click, pages, live };
}

afterEach(() => vi.restoreAllMocks());

describe('page grid selection', () => {
  it('renders one option per page and an identity plan', async () => {
    const { grid, cards, live } = await setup([4]);
    expect(cards()).toHaveLength(4);
    expect(grid.getPlan()).toEqual<PagePlanItem[]>([
      { source: 0, page: 0, rotate: 0 },
      { source: 0, page: 1, rotate: 0 },
      { source: 0, page: 2, rotate: 0 },
      { source: 0, page: 3, rotate: 0 },
    ]);
    expect(grid.changeCount()).toBe(0);
    expect(cards()[0].tabIndex).toBe(0);
    expect(cards()[1].tabIndex).toBe(-1);
    expect(live()).toBe('4 pages loaded');
  });

  it('supports click, modifier toggle and shift range', async () => {
    const { grid, click, cards } = await setup([6]);
    click(1);
    expect(grid.getSelection()).toEqual([1]);
    click(3, { metaKey: true });
    expect(grid.getSelection()).toEqual([1, 3]);
    click(1, { ctrlKey: true });
    expect(grid.getSelection()).toEqual([3]);
    // The last clicked page is the range anchor, even when it was deselected.
    click(3, { metaKey: true });
    click(3, { metaKey: true });
    click(5, { shiftKey: true });
    expect(grid.getSelection()).toEqual([3, 4, 5]);
    expect(cards()[4].getAttribute('aria-selected')).toBe('true');
    click(0);
    expect(grid.getSelection()).toEqual([0]);
  });

  it('selects all, clears with Escape and toggles with Space', async () => {
    const { grid, toolbarButton, cards, key } = await setup([3]);
    toolbarButton('Select all').click();
    expect(grid.getSelection()).toEqual([0, 1, 2]);
    cards()[0].focus();
    key('Escape');
    expect(grid.getSelection()).toEqual([]);
    key('ArrowRight');
    expect(document.activeElement).toBe(cards()[1]);
    key(' ');
    expect(grid.getSelection()).toEqual([1]);
    key('ArrowRight', { shiftKey: true });
    expect(grid.getSelection()).toEqual([1, 2]);
    key('a', { ctrlKey: true });
    expect(grid.getSelection()).toEqual([0, 1, 2]);
  });

  it('disables selection actions until pages are selected', async () => {
    const { toolbarButton, click } = await setup([3]);
    expect(toolbarButton('Rotate left').disabled).toBe(true);
    expect(toolbarButton('Delete').disabled).toBe(true);
    click(0);
    expect(toolbarButton('Rotate left').disabled).toBe(false);
    expect(toolbarButton('Delete').disabled).toBe(false);
  });
});

describe('page grid edits', () => {
  it('moves selected pages with Alt+Arrow and announces the move', async () => {
    const { grid, click, cards, key, pages, live } = await setup([5]);
    click(3);
    cards()[3].focus();
    key('ArrowLeft', { altKey: true });
    expect(pages()).toEqual([0, 1, 3, 2, 4]);
    expect(live()).toBe('Page 4 moved to position 3');
    key('ArrowLeft', { altKey: true });
    key('ArrowLeft', { altKey: true });
    key('ArrowLeft', { altKey: true }); // stops at the edge
    expect(pages()).toEqual([3, 0, 1, 2, 4]);
    expect(document.activeElement).toBe(cards()[0]);
    expect(grid.getSelection()).toEqual([0]);
    expect(grid.changeCount()).toBeGreaterThan(0);
  });

  it('moves a multi-page selection by drag and drop', async () => {
    const { click, cards, pages } = await setup([5]);
    click(0);
    click(1, { metaKey: true });
    const drag = (type: string, target: HTMLElement, clientX = 0) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX,
      });
      Object.defineProperty(event, 'dataTransfer', {
        value: { setData() {}, effectAllowed: '', dropEffect: '' },
      });
      target.dispatchEvent(event);
    };
    const target = cards()[4];
    target.getBoundingClientRect = () =>
      ({ left: 0, width: 100, top: 0, height: 100 }) as DOMRect;
    drag('dragstart', cards()[0]);
    drag('dragover', target, 90);
    expect(target.dataset.drop).toBe('after');
    drag('drop', target, 90);
    expect(pages()).toEqual([2, 3, 4, 0, 1]);
  });

  it('rotates, duplicates, inserts blank pages and deletes', async () => {
    const { grid, click, toolbarButton, pages } = await setup([3]);
    click(1);
    toolbarButton('Rotate right').click();
    toolbarButton('Rotate right').click();
    toolbarButton('Rotate left').click();
    expect(grid.getPlan()[1]).toEqual({ source: 0, page: 1, rotate: 90 });
    toolbarButton('Duplicate').click();
    expect(pages()).toEqual([0, 1, 1, 2]);
    expect(grid.getSelection()).toEqual([2]);
    toolbarButton('Insert blank page').click();
    expect(pages()).toEqual([0, 1, 1, 'blank', 2]);
    toolbarButton('Delete').click();
    expect(pages()).toEqual([0, 1, 1, 2]);
    toolbarButton('Select all').click();
    expect(toolbarButton('Delete').disabled).toBe(true);
  });

  it('shows source badges for multiple sources', async () => {
    const { grid, cards } = await setup([2, 1]);
    expect(grid.getPlan().map((p) => ('source' in p ? p.source : -1))).toEqual([
      0, 0, 1,
    ]);
    expect(cards()[2].querySelector('.ds-page-thumb__badge')?.textContent).toBe(
      'B1'
    );
    expect(cards()[2].getAttribute('aria-label')).toContain(
      'file-2.pdf page 1'
    );
  });

  it('undoes and resets edits', async () => {
    const { grid, click, toolbarButton, pages } = await setup([3]);
    click(0);
    toolbarButton('Delete').click();
    expect(pages()).toEqual([1, 2]);
    expect(grid.undo()).toBe(true);
    expect(pages()).toEqual([0, 1, 2]);
    click(2);
    toolbarButton('Rotate left').click();
    grid.reset();
    expect(grid.getPlan()[2]).toMatchObject({ rotate: 0 });
    expect(grid.changeCount()).toBe(0);
  });

  it('notifies listeners and stops after destroy', async () => {
    const { grid, docs, click } = await setup([2]);
    const listener = vi.fn();
    grid.onChange(listener);
    click(1);
    expect(listener).toHaveBeenCalled();
    grid.destroy();
    expect(docs[0].destroy).toHaveBeenCalled();
    expect(grid.root.isConnected).toBe(false);
  });
});

describe('page grid split markers', () => {
  it('toggles a marker after the focused page and follows reorders', async () => {
    const { grid, click, toolbarButton, cards, key } = await setup(
      [4],
      'split'
    );
    const toggle = toolbarButton('Split after');
    click(1);
    toggle.click();
    expect([...grid.getSplitAfter()]).toEqual([1]);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(cards()[1].hasAttribute('data-split-after')).toBe(true);
    expect(cards()[1].getAttribute('aria-label')).toContain(
      'split after this page'
    );
    cards()[1].focus();
    key('ArrowLeft', { altKey: true });
    expect([...grid.getSplitAfter()]).toEqual([0]);
    toggle.click();
    expect([...grid.getSplitAfter()]).toEqual([]);
  });

  it('never marks the last page and prefers a preview when set', async () => {
    const { grid, click, toolbarButton } = await setup([3], 'split');
    click(2);
    expect(toolbarButton('Split after').disabled).toBe(true);
    grid.setMarkerPreview(new Set([0, 1]));
    expect([...grid.getSplitAfter()]).toEqual([0, 1]);
    grid.setMarkerPreview(null);
    expect([...grid.getSplitAfter()]).toEqual([]);
  });
});

describe('page grid thumbnails', () => {
  it('renders at most the concurrency limit at once, lazily on intersection', async () => {
    const observed: Element[] = [];
    let callback: IntersectionObserverCallback = () => {};
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          callback = cb;
        }
        observe(target: Element) {
          observed.push(target);
        }
        unobserve() {}
        disconnect() {}
      }
    );
    let inFlight = 0;
    let peak = 0;
    const resolvers: (() => void)[] = [];
    const doc: GridPdfDocument = {
      numPages: 500,
      destroy: () => {},
      async getPage() {
        return {
          getViewport: ({ scale }) => ({
            width: 600 * scale,
            height: 800 * scale,
          }),
          render: () => {
            inFlight++;
            peak = Math.max(peak, inFlight);
            return {
              promise: new Promise<void>((resolve) =>
                resolvers.push(() => {
                  inFlight--;
                  resolve();
                })
              ),
            };
          },
        };
      },
    };
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({
        drawImage() {},
      } as unknown as CanvasRenderingContext2D);
    const grid = createPageGrid({
      sources: [{ name: 'big.pdf', bytes: bytes() }],
      loadDocument: async () => doc,
    });
    await grid.ready;
    expect(observed).toHaveLength(500);
    callback(
      observed.slice(0, 10).map((target) => ({
        target,
        isIntersecting: true,
      })) as unknown as IntersectionObserverEntry[],
      {} as IntersectionObserver
    );
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(inFlight).toBe(2);
    while (resolvers.length) {
      resolvers.shift()!();
      for (let i = 0; i < 20; i++) await Promise.resolve();
    }
    expect(peak).toBe(2);
    grid.destroy();
    getContext.mockRestore();
    vi.unstubAllGlobals();
  });
});
