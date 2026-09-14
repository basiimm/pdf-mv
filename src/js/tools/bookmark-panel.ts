import {
  button,
  disclosure,
  dropZone,
  el,
  emptyState,
  iconButton,
  inlineAlert,
  panelSkeleton,
  setBusy,
  textArea,
  toast,
} from '../../design-system/ui/index.js';
import '../../design-system/bookmarks.css';
import {
  bookmarkSignature,
  cloneBookmarks,
  countBookmarks,
  createBookmarkId,
  exportBookmarksCsv,
  exportBookmarksJson,
  inspectBookmarks,
  parseBookmarks,
  writeBookmarks,
  type BookmarkNode,
} from '../engines/bookmarks.js';
import { describeWorkspaceError } from '../workspace-errors.js';
import type { ToolHost } from '../workspace-tools.js';

export interface BookmarkPanelOptions {
  /** Page shown in the viewer (1-based); new bookmarks point to it. */
  currentPage?: () => number | undefined;
}

const svg = (d: string) =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const icons = {
  add: svg('<path d="M12 5v14M5 12h14"/>'),
  child: svg('<path d="M6 4v8a3 3 0 0 0 3 3h9"/><path d="m15 11 4 4-4 4"/>'),
  up: svg('<path d="m18 15-6-6-6 6"/>'),
  down: svg('<path d="m6 9 6 6 6-6"/>'),
  indent: svg('<path d="M4 6h16M10 12h10M10 18h10"/><path d="m4 10 3 2-3 2"/>'),
  outdent: svg(
    '<path d="M4 6h16M10 12h10M10 18h10"/><path d="m7 10-3 2 3 2"/>'
  ),
  delete: svg(
    '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'
  ),
  bookmark: svg('<path d="M6 3h12v18l-6-4-6 4z"/>'),
};

const SVG_NS = 'http://www.w3.org/2000/svg';
function chevron() {
  const icon = document.createElementNS(SVG_NS, 'svg');
  for (const [name, value] of Object.entries({
    viewBox: '0 0 24 24',
    width: '14',
    height: '14',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }))
    icon.setAttribute(name, value);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'm9 6 6 6-6 6');
  icon.append(path);
  return icon;
}

const DONE = 'Bookmarks updated';
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = el('a', { attrs: { href: url, download: file.name } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

interface Location {
  node: BookmarkNode;
  parent: BookmarkNode | null;
  list: BookmarkNode[];
  index: number;
  level: number;
}

/**
 * Edit bookmarks: a keyboard-first outline tree in the tool panel. The PDF
 * stays visible; Save writes a new outline as an undoable revision.
 */
export function createBookmarkPanel(
  host: ToolHost,
  id: string,
  refresh: () => void,
  options: BookmarkPanelOptions = {}
) {
  const root = el('div', {
    className: 'ds-tool-panel ds-bookmarks',
    dataset: { tool: 'bookmark' },
  });
  const body = el('div', { className: 'ds-tool-panel__body' });
  const footer = el('div', { className: 'ds-tool-panel__footer' });
  root.append(body, footer);

  const intro = el('p', {
    className: 'ds-tool-panel__description',
    text: 'Bookmarks let readers jump straight to a section. Changes apply when you save.',
  });
  const summary = el('p', {
    className: 'ds-tool-panel__note',
    attrs: { 'data-summary': '' },
  });
  const live = el('div', {
    className: 'ds-visually-hidden',
    attrs: { 'aria-live': 'polite', role: 'status' },
  });
  const feedback = el('div', { attrs: { 'aria-live': 'polite' } });

  // ---------- Toolbar ----------
  const tool = (label: string, icon: string, run: () => void) =>
    iconButton({ label, icon, size: 's', onClick: run });
  const addButton = button({
    label: 'Add bookmark',
    icon: icons.add,
    size: 's',
    variant: 'quiet',
    onClick: () => add(false),
  });
  const addChildButton = tool('Add child bookmark', icons.child, () =>
    add(true)
  );
  const upButton = tool('Move up (Alt+Up)', icons.up, () => move(-1));
  const downButton = tool('Move down (Alt+Down)', icons.down, () => move(1));
  const outdentButton = tool('Outdent (Alt+Left)', icons.outdent, outdent);
  const indentButton = tool('Indent (Alt+Right)', icons.indent, indent);
  const deleteButton = tool('Delete bookmark', icons.delete, () => remove());
  const toolbar = el(
    'div',
    {
      className: 'ds-toolbar ds-bookmarks__toolbar',
      attrs: { role: 'toolbar', 'aria-label': 'Bookmark actions' },
    },
    [
      addButton,
      addChildButton,
      el('span', {
        className: 'ds-toolbar__divider',
        attrs: { 'aria-hidden': 'true' },
      }),
      upButton,
      downButton,
      outdentButton,
      indentButton,
      el('span', {
        className: 'ds-toolbar__divider',
        attrs: { 'aria-hidden': 'true' },
      }),
      deleteButton,
    ]
  );
  const toolButtons = [
    addButton,
    addChildButton,
    upButton,
    downButton,
    outdentButton,
    indentButton,
    deleteButton,
  ];
  toolbar.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const enabled = toolButtons.filter((b) => !b.disabled);
    const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    enabled[(index + step + enabled.length) % enabled.length].focus();
  });

  const tree = el('ul', {
    className: 'ds-bookmark-tree',
    attrs: { role: 'tree', 'aria-label': 'Bookmarks' },
  });
  const surface = el('div', { className: 'ds-bookmarks__surface' });
  const keyHelp = el('p', {
    className: 'ds-tool-panel__note',
    text: 'F2 renames. Alt+arrow keys move and nest. Delete removes.',
  });

  // ---------- Import / export ----------
  const importField = textArea({
    label: 'Bookmarks as JSON or CSV',
    rows: 5,
    help: 'CSV columns: title,page,level (level 0 is top level).',
  });
  importField.control.spellcheck = false;
  importField.control.classList.add('ds-bookmarks__code');
  const importButton = button({
    label: 'Replace with imported',
    size: 's',
    onClick: () => importText(),
  });
  const exportJsonButton = button({
    label: 'Export JSON',
    size: 's',
    variant: 'quiet',
    onClick: () => exportAs('json'),
  });
  const exportCsvButton = button({
    label: 'Export CSV',
    size: 's',
    variant: 'quiet',
    onClick: () => exportAs('csv'),
  });
  const advanced = disclosure({
    summary: 'Import and export',
    children: [
      importField.root,
      el('div', { className: 'ds-bookmarks__actions' }, [
        importButton,
        exportJsonButton,
        exportCsvButton,
      ]),
    ],
  });

  body.append(intro, surface, feedback, advanced.root, live);

  // ---------- Footer ----------
  const primary = button({
    label: 'Save bookmarks',
    variant: 'accent',
    size: 'l',
    block: true,
    onClick: () => void save(),
  });
  const reset = button({
    label: 'Reset',
    variant: 'quiet',
    size: 's',
    onClick: () => resetEdits(),
  });
  footer.append(
    primary,
    el('div', { className: 'ds-tool-panel__footer-row' }, [summary, reset])
  );

  // ---------- State ----------
  let nodes: BookmarkNode[] = [];
  let baseline = bookmarkSignature([]);
  let saved: BookmarkNode[] = [];
  let pageCount = 0;
  let selectedId: string | null = null;
  let editingId: string | null = null;
  const expanded = new Set<string>();
  let source: File | null = null;
  let loadedRevision = -1;
  let loadToken = 0;
  let loading = false;
  let loadFailed = false;
  let busy = false;
  let active = true;
  let disposed = false;

  const announce = (message: string) => {
    live.textContent = '';
    // Re-set on the next frame so repeated messages are read again.
    setTimeout(() => (live.textContent = message), 30);
  };

  function locate(
    targetId: string | null,
    list = nodes,
    parent: BookmarkNode | null = null,
    level = 1
  ): Location | null {
    if (!targetId) return null;
    for (const [index, node] of list.entries()) {
      if (node.id === targetId) return { node, parent, list, index, level };
      const found = locate(targetId, node.children, node, level + 1);
      if (found) return found;
    }
    return null;
  }

  /** Items in visual order (children of collapsed items are skipped). */
  function visible(list = nodes, out: BookmarkNode[] = []) {
    for (const node of list) {
      out.push(node);
      if (node.children.length && expanded.has(node.id))
        visible(node.children, out);
    }
    return out;
  }

  const clampPage = (value: number) =>
    Math.max(1, Math.min(Math.trunc(value) || 1, Math.max(pageCount, 1)));

  // ---------- Rendering ----------
  function renderItem(
    node: BookmarkNode,
    level: number,
    setsize: number,
    pos: number
  ): HTMLLIElement {
    const hasChildren = node.children.length > 0;
    const isOpen = hasChildren && expanded.has(node.id);
    const selected = node.id === selectedId;
    const item = el('li', {
      className: 'ds-bookmark-tree__item',
      attrs: {
        role: 'treeitem',
        'aria-level': level,
        'aria-setsize': setsize,
        'aria-posinset': pos,
        'aria-selected': String(selected),
        'aria-expanded': hasChildren ? String(isOpen) : undefined,
        'aria-label': `${node.title}, page ${node.page}`,
        tabindex: selected ? 0 : -1,
      },
      dataset: { id: node.id },
    });
    const twisty = el('span', {
      className: 'ds-bookmark-tree__twisty',
      attrs: { 'aria-hidden': 'true' },
      dataset: { hidden: hasChildren ? undefined : '' },
    });
    twisty.append(chevron());
    let title: HTMLElement;
    if (editingId === node.id) {
      const input = el('input', {
        className: 'ds-input ds-bookmark-tree__rename',
        attrs: { type: 'text', 'aria-label': 'Bookmark title' },
      });
      input.value = node.title;
      input.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          finishRename(input.value, true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          finishRename(null, true);
        }
      });
      input.addEventListener('blur', () => finishRename(input.value, false));
      title = input;
    } else {
      title = el('span', {
        className: 'ds-bookmark-tree__title',
        text: node.title,
        attrs: { title: node.title },
        dataset: {
          bold: node.bold ? '' : undefined,
          italic: node.italic ? '' : undefined,
        },
      });
      title.addEventListener('dblclick', () => startRename(node.id));
    }
    const page = el('input', {
      className: 'ds-bookmark-tree__page',
      attrs: {
        type: 'number',
        inputmode: 'numeric',
        min: 1,
        max: pageCount || undefined,
        step: 1,
        'aria-label': `Page for ${node.title}`,
        tabindex: selected ? 0 : -1,
      },
    });
    page.value = String(node.page);
    page.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault();
        if (event.key === 'Escape') page.value = String(node.page);
        else commitPage(node.id, page);
        focusItem(node.id);
      }
    });
    page.addEventListener('change', () => commitPage(node.id, page));
    page.addEventListener('focus', () => {
      if (selectedId !== node.id) select(node.id, false);
    });
    const row = el('div', { className: 'ds-bookmark-tree__row' }, [
      twisty,
      title,
      page,
    ]);
    row.style.setProperty('--_level', String(level - 1));
    row.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('input')) return;
      if (target.closest('.ds-bookmark-tree__twisty') && hasChildren) {
        toggle(node.id);
        return;
      }
      select(node.id, true);
    });
    item.append(row);
    if (isOpen) {
      const group = el('ul', {
        className: 'ds-bookmark-tree__group',
        attrs: { role: 'group' },
      });
      node.children.forEach((child, i) =>
        group.append(renderItem(child, level + 1, node.children.length, i + 1))
      );
      item.append(group);
    }
    return item;
  }

  function render() {
    if (disposed) return;
    const hadFocus =
      root.contains(document.activeElement) &&
      tree.contains(document.activeElement);
    if (selectedId && !locate(selectedId)) selectedId = null;
    if (!selectedId && nodes.length) selectedId = nodes[0].id;
    tree.replaceChildren(
      ...nodes.map((node, i) => renderItem(node, 1, nodes.length, i + 1))
    );
    // Make sure one item is tabbable even when the selection is hidden.
    if (!tree.querySelector('[role=treeitem][tabindex="0"]')) {
      const first = tree.querySelector<HTMLElement>('[role=treeitem]');
      first?.setAttribute('tabindex', '0');
    }
    if (editingId) {
      const input = tree.querySelector<HTMLInputElement>(
        '.ds-bookmark-tree__rename'
      );
      input?.focus();
      input?.select();
    } else if (hadFocus && selectedId) focusItem(selectedId);
    update();
  }

  function itemNode(targetId: string) {
    return [...tree.querySelectorAll<HTMLElement>('[role=treeitem]')].find(
      (n) => n.dataset.id === targetId
    );
  }

  function focusItem(targetId: string) {
    const node = itemNode(targetId);
    node?.focus({ preventScroll: true });
    node
      ?.querySelector('.ds-bookmark-tree__row')
      ?.scrollIntoView?.({ block: 'nearest' });
  }

  let surfaceState = '';
  function showSurface() {
    const state = !host.hasPdf(id)
      ? 'no-pdf'
      : loadFailed
        ? 'error'
        : loading && !source
          ? 'loading'
          : nodes.length
            ? 'tree'
            : 'empty';
    if (state === surfaceState) return;
    surfaceState = state;
    if (state === 'error') return;
    if (state === 'no-pdf') {
      const picker = dropZone({
        accept: '.pdf,application/pdf',
        title: 'Choose a PDF',
        hint: 'Files stay on this device',
        compact: true,
        onFiles: (files) =>
          void host
            .attach(id, files[0])
            .then(() => refresh())
            .catch((error) => showLoadError(error)),
      });
      const empty = emptyState({
        title: 'Open a PDF to edit bookmarks',
        message: 'Its bookmarks appear here, ready to edit.',
      });
      empty.append(picker.root);
      surface.replaceChildren(empty);
    } else if (state === 'loading')
      surface.replaceChildren(panelSkeleton('Loading bookmarks'));
    else if (state === 'empty')
      surface.replaceChildren(
        emptyState({
          icon: icons.bookmark,
          title: 'No bookmarks yet',
          message:
            'Add a bookmark for each section so readers can jump straight to it.',
          primary: { label: 'Add bookmark', onClick: () => add(false) },
        })
      );
    else surface.replaceChildren(toolbar, tree, keyHelp);
  }

  function update() {
    if (disposed) return;
    showSurface();
    const ready = host.hasPdf(id) && !!source && !loading;
    const location = locate(selectedId);
    const off = busy || !ready;
    addButton.disabled = off;
    addChildButton.disabled = off || !location;
    upButton.disabled = off || !location || location.index === 0;
    downButton.disabled =
      off || !location || location.index === location.list.length - 1;
    indentButton.disabled = off || !location || location.index === 0;
    outdentButton.disabled = off || !location?.parent;
    deleteButton.disabled = off || !location;
    const dirty = ready && bookmarkSignature(nodes) !== baseline;
    primary.disabled = busy || !dirty;
    reset.disabled = busy || !dirty;
    importButton.disabled = off;
    exportJsonButton.disabled = off || !nodes.length;
    exportCsvButton.disabled = off || !nodes.length;
    const count = countBookmarks(nodes);
    summary.textContent = !host.hasPdf(id)
      ? 'Open a PDF to edit its bookmarks.'
      : !ready
        ? 'Loading bookmarks…'
        : `${plural(count, 'bookmark')}${dirty ? ' · Unsaved changes' : ''}`;
    advanced.root.hidden = !host.hasPdf(id);
  }

  // ---------- Edits ----------
  function changed(message: string) {
    feedback.replaceChildren();
    render();
    announce(message);
  }

  function select(targetId: string, focus: boolean) {
    selectedId = targetId;
    for (const item of tree.querySelectorAll<HTMLElement>('[role=treeitem]')) {
      const on = item.dataset.id === targetId;
      item.setAttribute('aria-selected', String(on));
      item.tabIndex = on ? 0 : -1;
      const page = item.querySelector<HTMLInputElement>(
        ':scope > .ds-bookmark-tree__row .ds-bookmark-tree__page'
      );
      if (page) page.tabIndex = on ? 0 : -1;
    }
    if (focus) focusItem(targetId);
    update();
  }

  function toggle(targetId: string, open?: boolean) {
    const next = open ?? !expanded.has(targetId);
    if (next) expanded.add(targetId);
    else expanded.delete(targetId);
    selectedId = targetId;
    render();
    focusItem(targetId);
  }

  function add(asChild: boolean) {
    if (busy || !source) return;
    const location = locate(selectedId);
    const page = clampPage(options.currentPage?.() ?? location?.node.page ?? 1);
    const node: BookmarkNode = {
      id: createBookmarkId(),
      title: 'New bookmark',
      page,
      children: [],
    };
    if (asChild && location) {
      location.node.children.push(node);
      expanded.add(location.node.id);
    } else if (location) location.list.splice(location.index + 1, 0, node);
    else nodes.push(node);
    selectedId = node.id;
    editingId = node.id;
    changed(`Bookmark added on page ${page}. Type a title, then press Enter.`);
  }

  function startRename(targetId: string) {
    if (busy) return;
    selectedId = targetId;
    editingId = targetId;
    render();
  }

  function finishRename(value: string | null, refocus: boolean) {
    const targetId = editingId;
    if (!targetId) return;
    editingId = null;
    const location = locate(targetId);
    const title = value?.replace(/\s+/g, ' ').trim();
    if (location && title && title !== location.node.title) {
      location.node.title = title;
      announce(`Renamed to ${title}`);
    }
    render();
    if (refocus) focusItem(targetId);
  }

  function commitPage(targetId: string, input: HTMLInputElement) {
    const location = locate(targetId);
    if (!location) return;
    const page = clampPage(Number(input.value));
    input.value = String(page);
    if (page === location.node.page) return;
    location.node.page = page;
    const item = itemNode(targetId);
    item?.setAttribute('aria-label', `${location.node.title}, page ${page}`);
    announce(`${location.node.title} now opens page ${page}`);
    update();
  }

  function move(step: -1 | 1) {
    const location = locate(selectedId);
    if (!location || busy) return;
    const target = location.index + step;
    if (target < 0 || target >= location.list.length) return;
    location.list.splice(location.index, 1);
    location.list.splice(target, 0, location.node);
    changed(step < 0 ? 'Moved up' : 'Moved down');
  }

  function indent() {
    const location = locate(selectedId);
    if (!location || busy || location.index === 0) return;
    const previous = location.list[location.index - 1];
    location.list.splice(location.index, 1);
    previous.children.push(location.node);
    expanded.add(previous.id);
    changed(`Nested under ${previous.title}`);
  }

  function outdent() {
    const location = locate(selectedId);
    if (!location?.parent || busy) return;
    const parent = locate(location.parent.id)!;
    location.list.splice(location.index, 1);
    parent.list.splice(parent.index + 1, 0, location.node);
    changed('Moved out one level');
  }

  function remove(targetId = selectedId) {
    const location = locate(targetId);
    if (!location || busy) return;
    const order = visible();
    const at = order.indexOf(location.node);
    location.list.splice(location.index, 1);
    const removed = countBookmarks([location.node]);
    const rest = visible();
    const next =
      location.list[location.index] ??
      location.list[location.index - 1] ??
      location.parent ??
      rest[Math.min(at, rest.length - 1)];
    selectedId = next?.id ?? null;
    changed(
      removed > 1
        ? `Deleted ${location.node.title} and ${plural(removed - 1, 'child bookmark')}`
        : `Deleted ${location.node.title}`
    );
    if (!nodes.length) addButtonFocus();
  }

  function addButtonFocus() {
    surface.querySelector<HTMLButtonElement>('.ds-empty .ds-button')?.focus();
  }

  tree.addEventListener('keydown', (event) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>(
      '[role=treeitem]'
    );
    if (!item || event.target !== item || busy) return;
    const current = item.dataset.id!;
    const location = locate(current);
    if (!location) return;
    // Keys act on the focused item, which is the selection.
    selectedId = current;
    const order = visible();
    const index = order.indexOf(location.node);
    const go = (node: BookmarkNode | undefined) => {
      if (node) select(node.id, true);
    };
    const hasChildren = location.node.children.length > 0;
    const isOpen = expanded.has(current);
    let handled = true;
    if (event.altKey && event.key === 'ArrowUp') move(-1);
    else if (event.altKey && event.key === 'ArrowDown') move(1);
    else if (event.altKey && event.key === 'ArrowRight') indent();
    else if (event.altKey && event.key === 'ArrowLeft') outdent();
    else if (event.key === 'ArrowDown') go(order[index + 1]);
    else if (event.key === 'ArrowUp') go(order[index - 1]);
    else if (event.key === 'Home') go(order[0]);
    else if (event.key === 'End') go(order[order.length - 1]);
    else if (event.key === 'ArrowRight') {
      if (hasChildren && !isOpen) toggle(current, true);
      else if (hasChildren) go(location.node.children[0]);
    } else if (event.key === 'ArrowLeft') {
      if (hasChildren && isOpen) toggle(current, false);
      else go(location.parent ?? undefined);
    } else if (event.key === 'F2' || event.key === 'Enter')
      startRename(current);
    else if (event.key === 'Delete' || event.key === 'Backspace')
      remove(current);
    else if (event.key === '*') {
      for (const sibling of location.list)
        if (sibling.children.length) expanded.add(sibling.id);
      render();
    } else handled = false;
    if (handled) event.preventDefault();
  });

  function resetEdits() {
    if (busy) return;
    nodes = cloneBookmarks(saved);
    editingId = null;
    feedback.replaceChildren();
    render();
    announce('Changes discarded');
  }

  function importText() {
    importField.setError('');
    try {
      const imported = parseBookmarks(importField.control.value, pageCount);
      if (!imported.length) throw new Error('No bookmarks found in the text.');
      nodes = imported;
      selectedId = imported[0].id;
      editingId = null;
      for (const node of imported)
        if (node.children.length) expanded.add(node.id);
      render();
      const message = `${plural(countBookmarks(imported), 'bookmark')} imported. Save to apply them to the PDF.`;
      feedback.replaceChildren(inlineAlert({ tone: 'positive', message }));
    } catch (error) {
      importField.setError(
        error instanceof Error ? error.message : 'The text could not be read.'
      );
    }
  }

  function exportAs(format: 'json' | 'csv') {
    if (!nodes.length) return;
    const base = (source?.name ?? 'document.pdf').replace(/\.pdf$/i, '');
    const file =
      format === 'json'
        ? new File([exportBookmarksJson(nodes)], `${base}-bookmarks.json`, {
            type: 'application/json',
          })
        : new File([exportBookmarksCsv(nodes)], `${base}-bookmarks.csv`, {
            type: 'text/csv',
          });
    download(file);
    announce(`${file.name} is downloading`);
  }

  // ---------- Load and save ----------
  function showLoadError(error: unknown) {
    const description = describeWorkspaceError(error, 'open');
    loadFailed = true;
    surfaceState = 'error';
    surface.replaceChildren(
      inlineAlert({
        tone: 'negative',
        title: 'Bookmarks could not be read',
        message: description.message,
        details: description.details,
        actions: [{ label: 'Try again', onClick: () => void load(true) }],
      })
    );
  }

  async function load(force = false) {
    if (disposed || busy) return;
    if (!host.hasPdf(id)) {
      source = null;
      nodes = [];
      saved = [];
      baseline = bookmarkSignature([]);
      loadedRevision = -1;
      loadFailed = false;
      render();
      return;
    }
    const revision = host.revision(id);
    if (!force && (loading || (source && revision === loadedRevision))) return;
    const token = ++loadToken;
    loading = true;
    loadFailed = false;
    update();
    try {
      const file = await host.snapshot(id);
      const result = await inspectBookmarks(file);
      if (token !== loadToken || disposed) return;
      source = file;
      pageCount = result.pageCount;
      saved = result.bookmarks;
      nodes = cloneBookmarks(saved);
      baseline = bookmarkSignature(saved);
      loadedRevision = revision;
      editingId = null;
      // Keep the reader's place: path ids survive a reload of the same outline.
      if (!expanded.size)
        for (const node of nodes) if (node.open) expanded.add(node.id);
    } catch (error) {
      if (token !== loadToken || disposed) return;
      loading = false;
      showLoadError(error);
    } finally {
      if (token === loadToken && !disposed) {
        loading = false;
        if (!loadFailed) render();
        else update();
      }
    }
  }

  async function save() {
    if (busy || !source) return;
    if (editingId) {
      const input = tree.querySelector<HTMLInputElement>(
        '.ds-bookmark-tree__rename'
      );
      finishRename(input?.value ?? null, false);
    }
    busy = true;
    setBusy(primary, true, 'Saving…');
    feedback.replaceChildren();
    update();
    let ok = false;
    try {
      const file = await host.snapshot(id);
      const output = await writeBookmarks(file, nodes);
      if (disposed) return;
      await host.commit(id, output, DONE);
      ok = true;
      toast(DONE, {
        action: {
          label: 'Undo',
          onClick: () =>
            void host
              .undoCommit(id)
              .then((label) => label && toast(`Undid: ${label}`))
              .finally(() => {
                refresh();
                void load(true);
              }),
        },
      });
    } catch (error) {
      if (disposed) return;
      const description = describeWorkspaceError(error, 'apply');
      feedback.replaceChildren(
        inlineAlert({
          tone: 'negative',
          message: description.message,
          details: description.details,
          actions: [
            { label: description.actionLabel, onClick: () => void save() },
          ],
        })
      );
    } finally {
      busy = false;
      if (!disposed) {
        setBusy(primary, false, 'Save bookmarks');
        update();
        refresh();
      }
    }
    if (ok && !disposed) {
      announce(`${DONE}. You can undo.`);
      await load(true);
    }
  }

  function sync() {
    if (disposed) return;
    if (active && !busy) void load();
    update();
  }

  render();
  return {
    root,
    sync,
    setActive(value: boolean) {
      active = value;
      if (value) void load();
    },
    /** Current working tree (tests and diagnostics). */
    getBookmarks: () => cloneBookmarks(nodes),
    dispose() {
      disposed = true;
      loadToken++;
      root.remove();
    },
  };
}
