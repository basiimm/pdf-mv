import {
  badge,
  button,
  el,
  iconButton,
  pageThumb,
} from '../../design-system/ui/index.js';
import { uniqueId } from '../../design-system/ui/dom.js';
import '../../design-system/page-grid.css';
import {
  deleteItems,
  duplicateItems,
  identityPlan,
  insertItem,
  isBlank,
  moveItems,
  moveItemsBy,
  normalizeRotation,
  plansEqual,
  type PagePlanItem,
} from './page-plan.js';

/** Minimal pdf.js surface the grid uses, so tests can supply a fake. */
export interface GridPdfPage {
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }): { promise: Promise<unknown> };
  cleanup?(): void;
}
export interface GridPdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<GridPdfPage>;
  destroy(): unknown;
}

export interface PageGridSource {
  name: string;
  bytes: ArrayBuffer;
}

export interface PageGridOptions {
  sources: PageGridSource[];
  mode?: 'organize' | 'split';
  /** Accessible name of the page list. */
  label?: string;
  /** Override for tests; defaults to pdf.js. */
  loadDocument?: (bytes: ArrayBuffer) => Promise<GridPdfDocument>;
  /** CSS pixel width of rendered thumbnails. */
  thumbnailWidth?: number;
  /** Maximum concurrent thumbnail renders. */
  concurrency?: number;
}

export interface PageGrid {
  root: HTMLElement;
  /** Resolves when every source has loaded (rejects if one cannot be read). */
  ready: Promise<void>;
  getPlan(): PagePlanItem[];
  /** Plan positions after which a split marker is shown. */
  getSplitAfter(): Set<number>;
  getSelection(): number[];
  pageCount(): number;
  /** Number of edits since load or reset (0 when the plan is unchanged). */
  changeCount(): number;
  onChange(callback: () => void): () => void;
  selectAll(): void;
  clearSelection(): void;
  reset(): void;
  undo(): boolean;
  /** Show computed markers (e.g. every N pages) instead of the user's own. */
  setMarkerPreview(positions: Set<number> | null): void;
  setDisabled(disabled: boolean): void;
  focus(): void;
  destroy(): void;
}

interface Entry {
  key: string;
  item: PagePlanItem;
}
interface Card {
  node: HTMLButtonElement;
  paper: HTMLElement;
  label: HTMLElement;
  thumbKey: string | null;
  /** Unbounded visual angle so rotation animates the short way. */
  angle: number;
}

const svg = (d: string) =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const icons = {
  rotateLeft: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  rotateRight: svg(
    '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'
  ),
  duplicate: svg(
    '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'
  ),
  delete: svg(
    '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'
  ),
  blank: svg(
    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M12 11v6M9 14h6"/>'
  ),
  split: svg(
    '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>'
  ),
};

async function defaultLoader(bytes: ArrayBuffer): Promise<GridPdfDocument> {
  const pdfjs = await import('pdfjs-dist');
  await import('../utils/setup-pdf-worker.js');
  return (await pdfjs.getDocument({ data: bytes.slice(0) })
    .promise) as unknown as GridPdfDocument;
}

const sourceLetter = (index: number) =>
  index < 26 ? String.fromCharCode(65 + index) : String(index + 1);

/**
 * Page organizer surface: selectable, reorderable page thumbnails with a
 * toolbar. Knows nothing about the workspace; the caller reads `getPlan()`.
 */
export function createPageGrid(options: PageGridOptions): PageGrid {
  const mode = options.mode ?? 'organize';
  const multiSource = options.sources.length > 1;
  const thumbWidth = options.thumbnailWidth ?? 128;
  const concurrency = Math.max(1, options.concurrency ?? 2);
  const load = options.loadDocument ?? defaultLoader;

  let seq = 0;
  const nextKey = () => `p${++seq}`;
  let entries: Entry[] = [];
  let original: PagePlanItem[] = [];
  let selected = new Set<string>();
  let markers = new Set<string>();
  let markerPreview: Set<number> | null = null;
  let focusKey: string | null = null;
  let anchorKey: string | null = null;
  let edits = 0;
  let disabled = false;
  let destroyed = false;
  const history: {
    entries: Entry[];
    markers: Set<string>;
    selected: Set<string>;
    edits: number;
  }[] = [];
  const listeners = new Set<() => void>();
  const docs: (GridPdfDocument | null)[] = options.sources.map(
    (): GridPdfDocument | null => null
  );
  /** Page sizes (points, with inherent rotation) by "source:page". */
  const sizes = new Map<string, { width: number; height: number }>();
  const thumbs = new Map<string, HTMLCanvasElement>();
  const cards = new Map<string, Card>();

  // ---------- DOM ----------
  const root = el('div', {
    className: 'ds-page-organizer',
    dataset: { mode },
  });
  const live = el('div', {
    className: 'ds-visually-hidden',
    attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' },
  });
  const count = badge('0 pages');
  const selectAllButton = button({
    label: 'Select all',
    size: 's',
    variant: 'quiet',
    onClick: () => selectAll(),
  });
  const clearButton = button({
    label: 'Clear',
    size: 's',
    variant: 'quiet',
    onClick: () => clearSelection(),
  });
  const tool = (label: string, icon: string, action: () => void) =>
    iconButton({ label, icon, size: 's', onClick: action });
  const rotateLeft = tool('Rotate left', icons.rotateLeft, () => rotate(-90));
  const rotateRight = tool('Rotate right', icons.rotateRight, () => rotate(90));
  const duplicate = tool('Duplicate', icons.duplicate, () => duplicatePages());
  const remove = tool('Delete', icons.delete, () => deletePages());
  const insertBlank = tool('Insert blank page', icons.blank, () =>
    insertBlankPage()
  );
  const splitToggle = button({
    label: 'Split after',
    size: 's',
    variant: 'quiet',
    icon: icons.split,
    onClick: () => toggleMarker(),
  });
  splitToggle.setAttribute('aria-pressed', 'false');
  const divider = () =>
    el('span', {
      className: 'ds-toolbar__divider',
      attrs: { 'aria-hidden': 'true' },
    });
  const toolbar = el(
    'div',
    {
      className: 'ds-toolbar ds-page-organizer__toolbar',
      attrs: { role: 'toolbar', 'aria-label': 'Page actions' },
    },
    [
      count,
      selectAllButton,
      clearButton,
      divider(),
      rotateLeft,
      rotateRight,
      duplicate,
      remove,
      insertBlank,
      ...(mode === 'split' ? [divider(), splitToggle] : []),
    ]
  );
  const grid = el('div', {
    className: 'ds-page-grid ds-page-organizer__grid',
    attrs: {
      role: 'listbox',
      'aria-multiselectable': 'true',
      'aria-label': options.label ?? 'Pages',
    },
  });
  const hint = el('p', {
    className: 'ds-visually-hidden',
    text: 'Arrow keys move focus. Space selects. Shift with arrows extends the selection. Alt with arrows moves selected pages. Delete removes them.',
    attrs: { id: uniqueId('page-grid-hint') },
  });
  grid.setAttribute('aria-describedby', hint.id);
  const scroller = el('div', { className: 'ds-page-organizer__scroll' }, [
    grid,
  ]);
  root.append(toolbar, scroller, hint, live);

  // ---------- Helpers ----------
  const plan = () => entries.map((e) => e.item);
  const indexOf = (key: string | null) =>
    key ? entries.findIndex((e) => e.key === key) : -1;
  const selectedIndices = () =>
    entries.flatMap((e, i) => (selected.has(e.key) ? [i] : []));
  const thumbKeyOf = (item: PagePlanItem) =>
    isBlank(item) ? null : `${item.source}:${item.page}`;
  const announce = (message: string) => {
    live.textContent = message;
  };
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? '' : 's'}`;
  function emit() {
    for (const callback of listeners) callback();
  }
  function remember() {
    history.push({
      entries: [...entries],
      markers: new Set(markers),
      selected: new Set(selected),
      edits,
    });
    if (history.length > 100) history.shift();
  }
  function commitEdit(message: string) {
    edits++;
    render();
    announce(message);
    emit();
  }

  // ---------- Thumbnails ----------
  const queue: string[] = [];
  const queued = new Set<string>();
  let running = 0;
  const visible = new Map<Element, string>();
  const observer =
    typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(
          (records) => {
            for (const record of records) {
              const key = (record.target as HTMLElement).dataset.thumb;
              if (!key) continue;
              if (record.isIntersecting) {
                visible.set(record.target, key);
                request(key);
              } else {
                visible.delete(record.target);
                if (![...visible.values()].includes(key) && queued.has(key)) {
                  queued.delete(key);
                  queue.splice(queue.indexOf(key), 1);
                }
              }
            }
          },
          { root: null, rootMargin: '400px 0px' }
        )
      : null;

  function request(key: string) {
    if (thumbs.has(key) || queued.has(key) || destroyed) return;
    queued.add(key);
    queue.push(key);
    pump();
  }
  function pump() {
    while (running < concurrency && queue.length && !destroyed) {
      const key = queue.shift()!;
      running++;
      void renderThumb(key).finally(() => {
        running--;
        queued.delete(key);
        pump();
      });
    }
  }
  async function renderThumb(key: string) {
    const [source, page] = key.split(':').map(Number);
    const doc = docs[source];
    if (!doc) return;
    try {
      const pdfPage = await doc.getPage(page + 1);
      if (destroyed) return;
      const base = pdfPage.getViewport({ scale: 1 });
      sizes.set(key, { width: base.width, height: base.height });
      const ratio = Math.min(
        2,
        typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
      );
      const viewport = pdfPage.getViewport({
        scale: (thumbWidth * ratio) / base.width,
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext('2d');
      if (context)
        await pdfPage.render({ canvas, canvasContext: context, viewport })
          .promise;
      pdfPage.cleanup?.();
      if (destroyed) return;
      if (thumbs.size >= 240) thumbs.delete(thumbs.keys().next().value!);
      thumbs.set(key, canvas);
      for (const card of cards.values()) if (card.thumbKey === key) paint(card);
    } catch {
      for (const card of cards.values())
        if (card.thumbKey === key) card.paper.dataset.failed = '';
    }
  }
  function paint(card: Card) {
    const key = card.thumbKey;
    if (!key) return;
    const size = sizes.get(key);
    if (size)
      card.paper.style.setProperty(
        '--_ratio',
        `${size.width} / ${size.height}`
      );
    const saved = thumbs.get(key);
    if (!saved) return;
    let canvas = card.paper.querySelector('canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      card.paper.append(canvas);
    }
    canvas.width = saved.width;
    canvas.height = saved.height;
    canvas.getContext('2d')?.drawImage(saved, 0, 0);
    card.paper.dataset.loaded = '';
  }

  // ---------- Cards ----------
  function sourceName(item: PagePlanItem) {
    return isBlank(item) ? '' : (options.sources[item.source]?.name ?? '');
  }
  function neighborSize(index: number) {
    for (let d = 0; d < entries.length; d++) {
      for (const i of [index - d, index + d]) {
        const item = entries[i]?.item;
        if (!item || isBlank(item)) continue;
        const size = sizes.get(thumbKeyOf(item)!);
        if (size)
          return item.rotate % 180 === 0
            ? size
            : { width: size.height, height: size.width };
      }
    }
    return null;
  }

  function createCard(entry: Entry): Card {
    const node = pageThumb({ pageNumber: 1 });
    node.removeAttribute('aria-pressed');
    node.setAttribute('role', 'option');
    node.tabIndex = -1;
    node.draggable = true;
    node.dataset.key = entry.key;
    const paper = node.querySelector<HTMLElement>('.ds-page-thumb__paper')!;
    const label = node.querySelector<HTMLElement>('.ds-page-thumb__label')!;
    const card: Card = { node, paper, label, thumbKey: null, angle: 0 };
    cards.set(entry.key, card);
    return card;
  }

  function updateCard(card: Card, entry: Entry, index: number) {
    const { item } = entry;
    const node = card.node;
    const thumbKey = thumbKeyOf(item);
    if (card.thumbKey !== thumbKey) {
      if (card.thumbKey) observer?.unobserve(node);
      card.thumbKey = thumbKey;
      node.dataset.thumb = thumbKey ?? '';
      if (thumbKey) {
        paint(card);
        if (observer) observer.observe(node);
        else if (index < 24) request(thumbKey);
      }
    }
    const rotation = isBlank(item) ? 0 : item.rotate;
    const current = normalizeRotation(card.angle);
    if (current !== rotation) {
      let delta = rotation - current;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      card.angle += delta;
    }
    card.paper.style.setProperty('--_angle', `${card.angle}deg`);
    node.toggleAttribute('data-blank', isBlank(item));
    const size = isBlank(item) ? neighborSize(index) : sizes.get(thumbKey!);
    if (size && isBlank(item))
      card.paper.style.setProperty(
        '--_ratio',
        `${size.width} / ${size.height}`
      );
    const r = size ? size.width / size.height : 1 / 1.414;
    card.paper.style.setProperty(
      '--_fit',
      String(rotation % 180 ? Math.min(r, 1 / r) : 1)
    );
    const isSelected = selected.has(entry.key);
    node.setAttribute('aria-selected', String(isSelected));
    node.tabIndex = entry.key === focusKey ? 0 : -1;
    node.setAttribute('aria-disabled', String(disabled));
    node.draggable = !disabled;
    const position = index + 1;
    card.label.textContent = String(position);
    const marker =
      mode === 'split' &&
      index < entries.length - 1 &&
      (markerPreview ? markerPreview.has(index) : markers.has(entry.key));
    node.toggleAttribute('data-split-after', marker);

    let badgeNode = node.querySelector<HTMLElement>('.ds-page-thumb__badge');
    const badgeText = isBlank(item)
      ? 'Blank'
      : multiSource
        ? `${sourceLetter(item.source)}${item.page + 1}`
        : item.page !== index
          ? `p${item.page + 1}`
          : '';
    if (badgeText) {
      if (!badgeNode) {
        badgeNode = el('span', { className: 'ds-page-thumb__badge' });
        node.append(badgeNode);
      }
      badgeNode.textContent = badgeText;
      badgeNode.title = isBlank(item)
        ? 'Blank page'
        : `${sourceName(item)}, page ${item.page + 1}`;
      badgeNode.setAttribute('aria-hidden', 'true');
    } else badgeNode?.remove();

    const parts = [`Page ${position} of ${entries.length}`];
    if (isBlank(item)) parts.push('blank page');
    else {
      if (multiSource || item.page !== index)
        parts.push(
          multiSource
            ? `${sourceName(item)} page ${item.page + 1}`
            : `originally page ${item.page + 1}`
        );
      if (item.rotate) parts.push(`rotated ${item.rotate} degrees`);
    }
    if (marker) parts.push('split after this page');
    node.setAttribute('aria-label', parts.join(', '));
  }

  function render() {
    if (destroyed) return;
    const hadFocus = grid.contains(document.activeElement);
    if (focusKey && indexOf(focusKey) < 0) focusKey = null;
    if (!focusKey && entries.length) focusKey = entries[0].key;
    const present = new Set(entries.map((e) => e.key));
    for (const key of [...selected])
      if (!present.has(key)) selected.delete(key);
    for (const key of [...markers]) if (!present.has(key)) markers.delete(key);
    for (const [key, card] of cards)
      if (!present.has(key)) {
        observer?.unobserve(card.node);
        visible.delete(card.node);
        card.node.remove();
        cards.delete(key);
      }
    let previous: Element | null = null;
    entries.forEach((entry, index) => {
      const card = cards.get(entry.key) ?? createCard(entry);
      updateCard(card, entry, index);
      const expected: ChildNode | null = previous
        ? previous.nextSibling
        : grid.firstChild;
      if (expected !== card.node) grid.insertBefore(card.node, expected);
      previous = card.node;
    });
    if (hadFocus && focusKey) cards.get(focusKey)?.node.focus();
    updateToolbar();
  }

  function updateToolbar() {
    const n = selected.size;
    count.textContent = n ? `${n} selected` : plural(entries.length, 'page');
    count.dataset.tone = n ? 'accent' : '';
    if (!n) delete count.dataset.tone;
    const none = disabled || !n;
    selectAllButton.disabled = disabled || n === entries.length;
    clearButton.hidden = !n;
    clearButton.disabled = disabled;
    rotateLeft.disabled = none;
    rotateRight.disabled = none;
    duplicate.disabled = none;
    remove.disabled = none || n >= entries.length;
    remove.title =
      n && n >= entries.length ? 'Keep at least one page' : 'Delete';
    insertBlank.disabled = disabled || !entries.length;
    const target = markerTarget();
    splitToggle.disabled =
      disabled || !!markerPreview || target < 0 || target >= entries.length - 1;
    splitToggle.setAttribute(
      'aria-pressed',
      String(target >= 0 && markers.has(entries[target].key))
    );
  }

  // ---------- Selection ----------
  function setFocus(index: number, scroll = true) {
    const entry = entries[Math.max(0, Math.min(entries.length - 1, index))];
    if (!entry) return;
    focusKey = entry.key;
    for (const [key, card] of cards)
      card.node.tabIndex = key === focusKey ? 0 : -1;
    const node = cards.get(entry.key)!.node;
    node.focus({ preventScroll: !scroll });
    if (scroll) node.scrollIntoView?.({ block: 'nearest' });
    updateToolbar();
  }
  function selectRange(from: number, to: number, additive: boolean) {
    if (!additive) selected.clear();
    const [a, b] = from < to ? [from, to] : [to, from];
    for (let i = a; i <= b; i++) if (entries[i]) selected.add(entries[i].key);
  }
  function selectionChanged() {
    render();
    emit();
  }
  function selectAll() {
    if (disabled) return;
    selected = new Set(entries.map((e) => e.key));
    selectionChanged();
    announce(`${plural(entries.length, 'page')} selected`);
  }
  function clearSelection() {
    if (!selected.size) return;
    selected.clear();
    selectionChanged();
    announce('Selection cleared');
  }
  /** Selected positions, or the focused page when nothing is selected. */
  function targets() {
    const chosen = selectedIndices();
    if (chosen.length) return chosen;
    const focus = indexOf(focusKey);
    return focus >= 0 ? [focus] : [];
  }
  function markerTarget() {
    const focus = indexOf(focusKey);
    if (selected.size === 1 || focus < 0) {
      const chosen = selectedIndices();
      if (chosen.length) return chosen[chosen.length - 1];
    }
    return focus;
  }

  // ---------- Edits ----------
  function rotate(delta: number) {
    const chosen = selectedIndices();
    if (disabled || !chosen.length) return;
    remember();
    const set = new Set(chosen);
    entries = entries.map((entry, i) =>
      set.has(i) && !isBlank(entry.item)
        ? {
            ...entry,
            item: {
              ...entry.item,
              rotate: normalizeRotation(entry.item.rotate + delta),
            },
          }
        : entry
    );
    commitEdit(
      `${plural(chosen.length, 'page')} rotated ${delta < 0 ? 'left' : 'right'}`
    );
  }
  function duplicatePages() {
    const chosen = selectedIndices();
    if (disabled || !chosen.length) return;
    remember();
    const result = duplicateItems(entries, chosen, (entry) => ({
      key: nextKey(),
      item: { ...entry.item },
    }));
    entries = result.items;
    selected = new Set(result.indices.map((i) => entries[i].key));
    focusKey = entries[result.indices[result.indices.length - 1]].key;
    commitEdit(`${plural(chosen.length, 'page')} duplicated`);
  }
  function deletePages() {
    const chosen = selectedIndices();
    if (disabled || !chosen.length) return;
    if (chosen.length >= entries.length) {
      announce('Keep at least one page');
      return;
    }
    remember();
    const first = chosen[0];
    entries = deleteItems(entries, chosen);
    selected.clear();
    focusKey = entries[Math.min(first, entries.length - 1)]?.key ?? null;
    commitEdit(`${plural(chosen.length, 'page')} deleted`);
  }
  function insertBlankPage() {
    if (disabled || !entries.length) return;
    remember();
    const chosen = selectedIndices();
    const focus = indexOf(focusKey);
    const after = chosen.length
      ? chosen[chosen.length - 1]
      : focus >= 0
        ? focus
        : entries.length - 1;
    const size = neighborSize(after);
    const entry: Entry = {
      key: nextKey(),
      item: {
        blank: true,
        width: size?.width ?? 0,
        height: size?.height ?? 0,
      },
    };
    entries = insertItem(entries, after + 1, entry);
    selected = new Set([entry.key]);
    anchorKey = focusKey = entry.key;
    commitEdit(`Blank page inserted at position ${after + 2}`);
  }
  function toggleMarker() {
    const target = markerTarget();
    if (disabled || markerPreview || target < 0 || target >= entries.length - 1)
      return;
    remember();
    const key = entries[target].key;
    const adding = !markers.has(key);
    if (adding) markers.add(key);
    else markers.delete(key);
    commitEdit(
      adding
        ? `Split marker added after page ${target + 1}`
        : `Split marker removed after page ${target + 1}`
    );
  }
  function move(
    indices: number[],
    result: { items: Entry[]; indices: number[] }
  ) {
    const before = indices.map((i) => entries[i].key).join();
    const after = result.indices.map((i) => result.items[i].key).join();
    const unchanged =
      before === after &&
      indices.every((value, i) => value === result.indices[i]);
    if (unchanged) return false;
    remember();
    entries = result.items;
    const first = result.indices[0] + 1;
    commitEdit(
      indices.length === 1
        ? `Page ${indices[0] + 1} moved to position ${first}`
        : `${plural(indices.length, 'page')} moved to position ${first}`
    );
    return true;
  }

  // ---------- Pointer ----------
  grid.addEventListener('click', (event) => {
    const node = (event.target as Element).closest<HTMLElement>(
      '.ds-page-thumb'
    );
    if (!node || disabled) return;
    const key = node.dataset.key!;
    const index = indexOf(key);
    const toggle = event.metaKey || event.ctrlKey;
    if (event.shiftKey && anchorKey && indexOf(anchorKey) >= 0) {
      selectRange(indexOf(anchorKey), index, toggle);
    } else if (toggle) {
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
      anchorKey = key;
    } else {
      selected = new Set([key]);
      anchorKey = key;
    }
    focusKey = key;
    selectionChanged();
  });

  let dragKeys: string[] | null = null;
  let dropIndex = -1;
  const clearDropIndicator = () =>
    grid
      .querySelectorAll('[data-drop]')
      .forEach((node) => node.removeAttribute('data-drop'));
  grid.addEventListener('dragstart', (event) => {
    const node = (event.target as Element).closest<HTMLElement>(
      '.ds-page-thumb'
    );
    if (!node || disabled) {
      event.preventDefault();
      return;
    }
    const key = node.dataset.key!;
    if (!selected.has(key)) {
      selected = new Set([key]);
      anchorKey = focusKey = key;
      render();
      emit();
    }
    dragKeys = entries.filter((e) => selected.has(e.key)).map((e) => e.key);
    event.dataTransfer?.setData('text/plain', `${dragKeys.length} pages`);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    root.dataset.dragging = '';
  });
  grid.addEventListener('dragover', (event) => {
    if (!dragKeys) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const node = (event.target as Element).closest<HTMLElement>(
      '.ds-page-thumb'
    );
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const after = event.clientX > rect.left + rect.width / 2;
    const index = indexOf(node.dataset.key!);
    dropIndex = after ? index + 1 : index;
    clearDropIndicator();
    node.dataset.drop = after ? 'after' : 'before';
  });
  grid.addEventListener('dragleave', (event) => {
    if (!grid.contains(event.relatedTarget as Node | null))
      clearDropIndicator();
  });
  grid.addEventListener('drop', (event) => {
    event.preventDefault();
    const keys = dragKeys;
    const to = dropIndex;
    endDrag();
    if (!keys || to < 0) return;
    const indices = keys.map((k) => indexOf(k)).filter((i) => i >= 0);
    move(indices, moveItems(entries, indices, to));
  });
  function endDrag() {
    dragKeys = null;
    dropIndex = -1;
    delete root.dataset.dragging;
    clearDropIndicator();
  }
  grid.addEventListener('dragend', endDrag);

  // ---------- Keyboard ----------
  function columns() {
    const nodes = [...grid.children] as HTMLElement[];
    if (nodes.length < 2) return 1;
    const top = nodes[0].offsetTop;
    const perRow = nodes.findIndex((n) => n.offsetTop !== top);
    return perRow <= 0 ? nodes.length : perRow;
  }
  grid.addEventListener('keydown', (event) => {
    if (disabled || !entries.length) return;
    const focus = Math.max(0, indexOf(focusKey));
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key;
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -columns(),
      ArrowDown: columns(),
    };
    if (key in steps) {
      event.preventDefault();
      const delta = steps[key];
      if (event.altKey) {
        const chosen = targets();
        const result = moveItemsBy(entries, chosen, delta);
        if (!selected.size && chosen.length)
          selected = new Set([entries[chosen[0]].key]);
        move(chosen, result);
        const moved = cards.get(focusKey!);
        moved?.node.focus();
        return;
      }
      const target = Math.max(0, Math.min(entries.length - 1, focus + delta));
      if (event.shiftKey) {
        if (!anchorKey || indexOf(anchorKey) < 0)
          anchorKey = entries[focus].key;
        selectRange(indexOf(anchorKey), target, mod);
        focusKey = entries[target].key;
        selectionChanged();
        setFocus(target);
        return;
      }
      setFocus(target);
      return;
    }
    if (key === 'Home' || key === 'End') {
      event.preventDefault();
      setFocus(key === 'Home' ? 0 : entries.length - 1);
      return;
    }
    if (key === ' ' || key === 'Enter') {
      event.preventDefault();
      const k = entries[focus].key;
      if (key === 'Enter' && !mod) selected = new Set([k]);
      else if (selected.has(k)) selected.delete(k);
      else selected.add(k);
      anchorKey = k;
      selectionChanged();
      announce(
        `Page ${focus + 1} ${selected.has(k) ? 'selected' : 'not selected'}`
      );
      return;
    }
    if (key === 'Escape') {
      if (selected.size) {
        event.preventDefault();
        clearSelection();
      }
      return;
    }
    if (mod && key.toLowerCase() === 'a') {
      event.preventDefault();
      selectAll();
      return;
    }
    if (mod && key.toLowerCase() === 'z' && !event.shiftKey) {
      event.preventDefault();
      if (!undo()) announce('Nothing to undo');
      return;
    }
    if (key === 'Delete' || key === 'Backspace') {
      event.preventDefault();
      if (!selected.size) selected.add(entries[focus].key);
      deletePages();
    }
  });
  grid.addEventListener('focusin', (event) => {
    const node = (event.target as Element).closest<HTMLElement>(
      '.ds-page-thumb'
    );
    if (node?.dataset.key && node.dataset.key !== focusKey) {
      focusKey = node.dataset.key;
      for (const [k, card] of cards)
        card.node.tabIndex = k === focusKey ? 0 : -1;
      updateToolbar();
    }
  });

  function undo() {
    const last = history.pop();
    if (!last || disabled) return false;
    entries = last.entries;
    markers = last.markers;
    selected = last.selected;
    edits = last.edits;
    render();
    announce('Last change undone');
    emit();
    return true;
  }

  // ---------- Load ----------
  const ready = (async () => {
    const counts: number[] = [];
    for (let i = 0; i < options.sources.length; i++) {
      const doc = await load(options.sources[i].bytes);
      if (destroyed) {
        void doc.destroy();
        return;
      }
      docs[i] = doc;
      counts.push(doc.numPages);
    }
    original = identityPlan(counts);
    entries = original.map((item) => ({ key: nextKey(), item }));
    // Size the paper from the first page before thumbnails arrive.
    if (docs[0] && counts[0]) {
      try {
        const first = await docs[0].getPage(1);
        const v = first.getViewport({ scale: 1 });
        grid.style.setProperty('--_default-ratio', `${v.width} / ${v.height}`);
      } catch {
        /* Thumbnails report their own failures. */
      }
    }
    render();
    announce(`${plural(entries.length, 'page')} loaded`);
    emit();
  })();
  ready.catch(() => {});

  return {
    root,
    ready,
    getPlan: () => plan().map((item) => ({ ...item })),
    getSplitAfter() {
      if (markerPreview) return new Set(markerPreview);
      return new Set(
        entries.flatMap((e, i) =>
          markers.has(e.key) && i < entries.length - 1 ? [i] : []
        )
      );
    },
    getSelection: selectedIndices,
    pageCount: () => entries.length,
    changeCount: () =>
      plansEqual(plan(), original) && !markers.size ? 0 : Math.max(1, edits),
    onChange(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    selectAll,
    clearSelection,
    reset() {
      if (disabled) return;
      if (!edits && plansEqual(plan(), original) && !markers.size) return;
      remember();
      entries = original.map((item) => ({ key: nextKey(), item }));
      markers.clear();
      selected.clear();
      edits = 0;
      render();
      announce('Original page order restored');
      emit();
    },
    undo,
    setMarkerPreview(positions) {
      markerPreview = positions ? new Set(positions) : null;
      render();
    },
    setDisabled(value) {
      disabled = value;
      root.toggleAttribute('data-disabled', value);
      grid.setAttribute('aria-disabled', String(value));
      render();
    },
    focus() {
      const index = indexOf(focusKey);
      if (index >= 0) setFocus(index);
    },
    destroy() {
      destroyed = true;
      observer?.disconnect();
      queue.length = 0;
      queued.clear();
      listeners.clear();
      for (const doc of docs) if (doc) void doc.destroy();
      thumbs.clear();
      cards.clear();
      root.remove();
    },
  };
}
