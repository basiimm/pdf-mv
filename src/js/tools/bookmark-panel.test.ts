import { describe, it, expect, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { createBookmarkPanel } from './bookmark-panel';
import {
  readBookmarks,
  writeBookmarks,
  type BookmarkNode,
} from '../engines/bookmarks';
import type { ToolHost } from '../workspace-tools';

async function sourcePdf(tree: BookmarkNode[] = [], pages = 6) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 300]);
  const file = new File([(await doc.save()) as BlobPart], 'guide.pdf', {
    type: 'application/pdf',
  });
  return tree.length ? writeBookmarks(file, tree) : file;
}

const n = (title: string, page: number, children: BookmarkNode[] = []) => ({
  id: title,
  title,
  page,
  children,
});

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

async function until(check: () => boolean) {
  for (let i = 0; i < 200 && !check(); i++)
    await new Promise((r) => setTimeout(r, 5));
  expect(check()).toBe(true);
}
const items = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('[role=treeitem]'),
];
const itemNamed = (root: HTMLElement, title: string) =>
  items(root).find((i) =>
    i.getAttribute('aria-label')?.startsWith(`${title},`)
  )!;
const key = (target: HTMLElement, k: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: k, bubbles: true, ...init })
  );
const buttonNamed = (scope: HTMLElement, label: string) =>
  [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === label
  )!;
const shape = (nodes: BookmarkNode[]): unknown =>
  nodes.map((b) =>
    b.children.length ? [b.title, b.page, shape(b.children)] : [b.title, b.page]
  );

async function mount(tree: BookmarkNode[]) {
  const host = mockHost(await sourcePdf(tree));
  const panel = createBookmarkPanel(host, 'doc', vi.fn());
  document.body.append(panel.root);
  panel.sync();
  return { host, panel };
}

describe('bookmark panel', () => {
  it('shows the empty state and adds a bookmark with inline rename', async () => {
    const { panel } = await mount([]);
    await until(() => !!panel.root.querySelector('.ds-empty'));
    expect(panel.root.textContent).toContain('No bookmarks yet');
    buttonNamed(panel.root, 'Add bookmark').click();
    const input = panel.root.querySelector<HTMLInputElement>(
      '.ds-bookmark-tree__rename'
    )!;
    expect(input).toBeTruthy();
    input.value = 'Welcome';
    key(input, 'Enter');
    expect(shape(panel.getBookmarks())).toEqual([['Welcome', 1]]);
    const item = items(panel.root)[0];
    expect(item.getAttribute('aria-level')).toBe('1');
    expect(item.getAttribute('aria-selected')).toBe('true');
    expect(
      panel.root.querySelector<HTMLButtonElement>('[data-variant=accent]')!
        .disabled
    ).toBe(false);
  });

  it('navigates, expands and restructures with the keyboard', async () => {
    const { panel } = await mount([
      n('One', 1),
      n('Two', 2, [n('Two A', 3), n('Two B', 4)]),
      n('Three', 5),
    ]);
    await until(() => items(panel.root).length === 3);
    const tree = panel.root.querySelector('[role=tree]')!;
    expect(tree).toBeTruthy();
    const two = itemNamed(panel.root, 'Two');
    expect(two.getAttribute('aria-expanded')).toBe('false');

    key(itemNamed(panel.root, 'One'), 'ArrowDown');
    expect(itemNamed(panel.root, 'Two').getAttribute('aria-selected')).toBe(
      'true'
    );
    key(itemNamed(panel.root, 'Two'), 'ArrowRight');
    expect(itemNamed(panel.root, 'Two').getAttribute('aria-expanded')).toBe(
      'true'
    );
    expect(items(panel.root)).toHaveLength(5);
    expect(itemNamed(panel.root, 'Two A').getAttribute('aria-level')).toBe('2');

    // Right again moves into the first child; Alt+Down reorders it.
    key(itemNamed(panel.root, 'Two'), 'ArrowRight');
    key(itemNamed(panel.root, 'Two A'), 'ArrowDown', { altKey: true });
    expect(shape(panel.getBookmarks())).toEqual([
      ['One', 1],
      [
        'Two',
        2,
        [
          ['Two B', 4],
          ['Two A', 3],
        ],
      ],
      ['Three', 5],
    ]);

    // Outdent Two A, then indent Three under it.
    key(itemNamed(panel.root, 'Two A'), 'ArrowLeft', { altKey: true });
    key(itemNamed(panel.root, 'Two A'), 'ArrowDown');
    key(itemNamed(panel.root, 'Three'), 'ArrowRight', { altKey: true });
    expect(shape(panel.getBookmarks())).toEqual([
      ['One', 1],
      ['Two', 2, [['Two B', 4]]],
      ['Two A', 3, [['Three', 5]]],
    ]);

    // Left goes to the parent, Delete removes it with its child.
    key(itemNamed(panel.root, 'Three'), 'ArrowLeft');
    expect(itemNamed(panel.root, 'Two A').getAttribute('aria-selected')).toBe(
      'true'
    );
    key(itemNamed(panel.root, 'Two A'), 'Delete');
    expect(shape(panel.getBookmarks())).toEqual([
      ['One', 1],
      ['Two', 2, [['Two B', 4]]],
    ]);

    // F2 renames; Escape cancels.
    key(itemNamed(panel.root, 'One'), 'F2');
    const input = panel.root.querySelector<HTMLInputElement>(
      '.ds-bookmark-tree__rename'
    )!;
    input.value = 'Changed';
    key(input, 'Escape');
    expect(panel.getBookmarks()[0].title).toBe('One');
  });

  it('edits page numbers within the document range', async () => {
    const { panel } = await mount([n('One', 1)]);
    await until(() => items(panel.root).length === 1);
    const page = panel.root.querySelector<HTMLInputElement>(
      '.ds-bookmark-tree__page'
    )!;
    page.value = '99';
    page.dispatchEvent(new Event('change'));
    expect(panel.getBookmarks()[0].page).toBe(6);
    expect(page.value).toBe('6');
  });

  it('saves with host.commit and reloads the written outline', async () => {
    const { host, panel } = await mount([n('One', 1), n('Two', 2)]);
    await until(() => items(panel.root).length === 2);
    key(itemNamed(panel.root, 'Two'), 'ArrowUp', { altKey: true });
    const save = buttonNamed(panel.root, 'Save bookmarks');
    expect(save.disabled).toBe(false);
    save.click();
    await until(
      () => (host.commit as ReturnType<typeof vi.fn>).mock.calls.length === 1
    );
    const [, file, label] = (host.commit as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(label).toBe('Bookmarks updated');
    expect(shape(await readBookmarks(file))).toEqual([
      ['Two', 2],
      ['One', 1],
    ]);
    await until(() => buttonNamed(panel.root, 'Save bookmarks').disabled);
    expect(document.body.textContent).toContain('Bookmarks updated');
  });

  it('imports CSV and resets to the saved outline', async () => {
    const { panel } = await mount([n('Keep', 1)]);
    await until(() => items(panel.root).length === 1);
    const area = panel.root.querySelector<HTMLTextAreaElement>('textarea')!;
    area.value = 'title,page,level\nA,1,0\nB,2,1';
    buttonNamed(panel.root, 'Replace with imported').click();
    expect(shape(panel.getBookmarks())).toEqual([['A', 1, [['B', 2]]]]);
    buttonNamed(panel.root, 'Reset').click();
    expect(shape(panel.getBookmarks())).toEqual([['Keep', 1]]);
    area.value = '{broken';
    buttonNamed(panel.root, 'Replace with imported').click();
    expect(area.getAttribute('aria-invalid')).toBe('true');
  });
});
