import { describe, it, expect, vi, afterEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { createOrganizePanel } from './organize-panel';
import type { ToolHost } from '../workspace-tools';
import type { GridPdfDocument } from './page-grid';

/** Page N is (100 + N) points wide so output order is observable. */
async function sourcePdf(count: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i++) doc.addPage([100 + i, 400]);
  return new File([(await doc.save()) as BlobPart], 'report.pdf', {
    type: 'application/pdf',
  });
}

async function widths(file: File) {
  const doc = await PDFDocument.load(await file.arrayBuffer());
  return doc.getPages().map((p) => Math.round(p.getWidth()));
}

/** pdf.js stand-in: counts pages with pdf-lib, renders nothing. */
async function loadDocument(bytes: ArrayBuffer): Promise<GridPdfDocument> {
  const doc = await PDFDocument.load(bytes);
  return {
    numPages: doc.getPageCount(),
    destroy: () => {},
    async getPage() {
      return {
        getViewport: ({ scale }) => ({
          width: 100 * scale,
          height: 400 * scale,
        }),
        render: () => ({ promise: Promise.resolve() }),
      };
    },
  };
}

function mockHost(file: File) {
  let current = file;
  let revision = 1;
  const host: ToolHost = {
    activeId: () => 'doc',
    placeSignature: vi.fn(async () => {}),
    cancelSignature: vi.fn(),
    editMode: vi.fn(async () => {}),
    hasPdf: () => true,
    revision: () => revision,
    createTask: () => 'new-task',
    snapshot: vi.fn(async () => current),
    attach: vi.fn(async () => {}),
    result: vi.fn(async () => {}),
    status: vi.fn(),
    commit: vi.fn(async (_id: string, next: File) => {
      current = next;
      revision++;
    }),
    canUndoCommit: vi.fn(() => true),
    undoCommit: vi.fn(async () => null),
    showPreview: vi.fn(async () => {}),
    applyPreview: vi.fn(async () => {}),
    cancelPreview: vi.fn(async () => {}),
    isPreviewing: vi.fn(() => false),
  };
  return host;
}

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};
async function until(check: () => boolean) {
  for (let i = 0; i < 200 && !check(); i++)
    await new Promise((r) => setTimeout(r, 5));
  expect(check()).toBe(true);
}
const buttonNamed = (scope: HTMLElement, label: string) =>
  [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === label
  )!;
const cards = (scope: HTMLElement) => [
  ...scope.querySelectorAll<HTMLButtonElement>('[role=option]'),
];
const click = (node: HTMLElement, init: MouseEventInit = {}) =>
  node.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init }));

afterEach(() => vi.unstubAllGlobals());

describe('organize panel', () => {
  it('loads pages into the canvas and applies a new order with host.commit', async () => {
    const host = mockHost(await sourcePdf(4));
    const refresh = vi.fn();
    const panel = createOrganizePanel(host, 'doc', 'organize', refresh, {
      loadDocument,
    });
    document.body.append(panel.root, panel.canvasRoot);
    panel.sync();
    await until(() => cards(panel.canvasRoot).length === 4);

    const apply = buttonNamed(panel.root, 'Apply changes');
    expect(apply.disabled).toBe(true);
    expect(panel.root.textContent).toContain(
      '4 pages · 0 selected · No changes'
    );

    // Select page 4 and move it to the front with Alt+ArrowLeft.
    click(cards(panel.canvasRoot)[3]);
    for (let i = 0; i < 3; i++)
      cards(panel.canvasRoot)
        .find((c) => c.getAttribute('aria-selected') === 'true')!
        .dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'ArrowLeft',
            altKey: true,
            bubbles: true,
          })
        );
    expect(panel.root.textContent).toContain('1 selected');
    expect(apply.disabled).toBe(false);

    apply.click();
    await until(
      () => (host.commit as ReturnType<typeof vi.fn>).mock.calls.length === 1
    );
    const [id, file, label] = (host.commit as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(id).toBe('doc');
    expect(label).toBe('Pages reorganized');
    expect(file.name).toBe('report.pdf');
    expect(await widths(file)).toEqual([103, 100, 101, 102]);
    // Reloads from the committed revision.
    await until(
      () => (host.snapshot as ReturnType<typeof vi.fn>).mock.calls.length >= 2
    );
    await settle();
    expect(refresh).toHaveBeenCalled();
    panel.dispose();
    expect(panel.canvasRoot.isConnected).toBe(false);
  });

  it('extracts selected pages into a new document', async () => {
    const host = mockHost(await sourcePdf(3));
    const panel = createOrganizePanel(host, 'doc', 'organize', () => {}, {
      loadDocument,
    });
    document.body.append(panel.root, panel.canvasRoot);
    panel.sync();
    await until(() => cards(panel.canvasRoot).length === 3);
    click(cards(panel.canvasRoot)[2]);
    click(cards(panel.canvasRoot)[0], { metaKey: true });
    buttonNamed(panel.root, 'Extract selected pages').click();
    await until(
      () => (host.result as ReturnType<typeof vi.fn>).mock.calls.length === 1
    );
    const out = (host.result as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as File;
    expect(out.name).toBe('report-pages.pdf');
    expect(await widths(out)).toEqual([100, 102]);
    expect(host.commit).not.toHaveBeenCalled();
    panel.dispose();
  });

  it('shows a retry alert when the document cannot be read', async () => {
    const host = mockHost(await sourcePdf(1));
    const panel = createOrganizePanel(host, 'doc', 'organize', () => {}, {
      loadDocument: async () => {
        throw new Error('Invalid PDF structure');
      },
    });
    document.body.append(panel.root, panel.canvasRoot);
    panel.sync();
    await until(() => !!panel.canvasRoot.querySelector('[role=alert]'));
    expect(buttonNamed(panel.canvasRoot, 'Try again')).toBeTruthy();
    panel.dispose();
  });
});

describe('split panel', () => {
  it('splits at markers and opens each part via host.result', async () => {
    const host = mockHost(await sourcePdf(5));
    const panel = createOrganizePanel(host, 'doc', 'split', () => {}, {
      loadDocument,
    });
    document.body.append(panel.root, panel.canvasRoot);
    panel.sync();
    await until(() => cards(panel.canvasRoot).length === 5);
    const split = buttonNamed(panel.root, 'Split PDF');
    expect(split.disabled).toBe(true);
    const toggle = buttonNamed(panel.canvasRoot, 'Split after');
    click(cards(panel.canvasRoot)[0]);
    toggle.click();
    click(cards(panel.canvasRoot)[2]);
    toggle.click();
    expect(panel.root.textContent).toContain('3 parts');
    expect(split.disabled).toBe(false);
    split.click();
    const result = host.result as ReturnType<typeof vi.fn>;
    await until(() => result.mock.calls.length === 3);
    const files = result.mock.calls.map((c) => c[0] as File);
    expect(files.map((f) => f.name)).toEqual([
      'report-part-1.pdf',
      'report-part-2.pdf',
      'report-part-3.pdf',
    ]);
    expect(await widths(files[0])).toEqual([100]);
    expect(await widths(files[1])).toEqual([101, 102]);
    expect(await widths(files[2])).toEqual([103, 104]);
    panel.dispose();
  });

  it('splits every N pages, and one part per selected page', async () => {
    const host = mockHost(await sourcePdf(5));
    const panel = createOrganizePanel(host, 'doc', 'split', () => {}, {
      loadDocument,
    });
    document.body.append(panel.root, panel.canvasRoot);
    panel.sync();
    await until(() => cards(panel.canvasRoot).length === 5);
    buttonNamed(panel.root, 'Every N pages').click();
    const every =
      panel.root.querySelector<HTMLInputElement>('input[type=number]')!;
    every.value = '2';
    every.dispatchEvent(new Event('input'));
    expect(panel.root.textContent).toContain('3 parts');
    expect(cards(panel.canvasRoot)[1].hasAttribute('data-split-after')).toBe(
      true
    );
    buttonNamed(panel.root, 'Split PDF').click();
    const result = host.result as ReturnType<typeof vi.fn>;
    await until(() => result.mock.calls.length === 3);
    expect(await widths(result.mock.calls[2][0])).toEqual([104]);

    result.mockClear();
    buttonNamed(panel.root, 'Selected pages').click();
    click(cards(panel.canvasRoot)[1]);
    click(cards(panel.canvasRoot)[3], { metaKey: true });
    expect(panel.root.textContent).toContain('2 parts');
    await until(() => !buttonNamed(panel.root, 'Split PDF').disabled);
    buttonNamed(panel.root, 'Split PDF').click();
    await until(() => result.mock.calls.length === 2);
    expect(await widths(result.mock.calls[0][0])).toEqual([101]);
    expect(await widths(result.mock.calls[1][0])).toEqual([103]);
    panel.dispose();
  });

  it('downloads a ZIP instead of opening more than the tab limit', async () => {
    const host = mockHost(await sourcePdf(4));
    const createObjectURL = vi.fn(() => 'blob:zip');
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
    );
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const panel = createOrganizePanel(host, 'doc', 'split', () => {}, {
      loadDocument,
      maxTabs: 2,
    });
    document.body.append(panel.root, panel.canvasRoot);
    panel.sync();
    await until(() => cards(panel.canvasRoot).length === 4);
    buttonNamed(panel.root, 'Every N pages').click();
    const every =
      panel.root.querySelector<HTMLInputElement>('input[type=number]')!;
    every.value = '1';
    every.dispatchEvent(new Event('input'));
    buttonNamed(panel.root, 'Split PDF').click();
    await until(() => clickSpy.mock.calls.length === 1);
    expect(host.result).not.toHaveBeenCalled();
    expect(panel.root.textContent).toContain('split into 4 parts');
    clickSpy.mockRestore();
    panel.dispose();
  });
});
