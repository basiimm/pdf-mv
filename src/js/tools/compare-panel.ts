import {
  button,
  checkbox,
  dropZone,
  el,
  emptyState,
  fileRow,
  iconButton,
  inlineAlert,
  panelSkeleton,
  progress as progressBar,
  segmented,
  slider,
} from '../../design-system/ui/index.js';
import '../../design-system/compare.css';
import {
  compareDocuments,
  formatReportJson,
  formatReportText,
  pageLabel,
  summaryLine,
  type CompareChangeKind,
  type CompareInput,
  type CompareProgress,
  type CompareRect,
  type CompareReport,
  type PageComparison,
} from '../engines/compare-pdfs.js';
import { describeWorkspaceError } from '../workspace-errors.js';
import type { ToolHost } from '../workspace-tools.js';
import type { GridPdfDocument } from './page-grid.js';

export type CompareMode = 'side-by-side' | 'overlay';
export type CompareZoom = 'fit' | 'actual';

export interface CompareDocument {
  name: string;
  document: GridPdfDocument;
}

export interface ComparePanelOptions {
  /** Test hook: replaces pdf.js loading. */
  loadDocument?: (bytes: ArrayBuffer) => Promise<GridPdfDocument>;
  /** Test hook: replaces the comparison engine. */
  compare?: (
    left: CompareDocument,
    right: CompareDocument,
    context: { signal: AbortSignal; progress(update: CompareProgress): void }
  ) => Promise<CompareReport>;
  /** Maximum concurrent page renders across both columns. */
  concurrency?: number;
}

const svg = (d: string) =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const icons = {
  previous: svg('<path d="m18 15-6-6-6 6"/>'),
  next: svg('<path d="m6 9 6 6 6-6"/>'),
  compare: svg(
    '<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/>'
  ),
};

const kinds: [CompareChangeKind, string][] = [
  ['added', 'Added'],
  ['removed', 'Removed'],
  ['changed', 'Changed'],
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** CSS pixels per PDF point at 100%. */
const CSS_PER_POINT = 96 / 72;

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = el('a', { attrs: { href: url, download: file.name } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

async function defaultLoader(bytes: ArrayBuffer): Promise<GridPdfDocument> {
  const pdfjs = await import('pdfjs-dist');
  await import('../utils/setup-pdf-worker.js');
  try {
    return (await pdfjs.getDocument({ data: bytes.slice(0) })
      .promise) as unknown as GridPdfDocument;
  } catch (error) {
    if ((error as { name?: string })?.name === 'PasswordException')
      throw new Error(
        'This PDF is password-protected. Remove the password, then compare again.',
        { cause: error }
      );
    throw error;
  }
}

const describeCounts = (page: PageComparison) =>
  [
    page.added && `${page.added} added`,
    page.removed && `${page.removed} removed`,
    page.changed && `${page.changed} changed`,
  ]
    .filter(Boolean)
    .join(', ');

// ---------------------------------------------------------------------------
// Canvas surface: synced page columns (or one overlay column) with highlights
// ---------------------------------------------------------------------------

interface ViewOptions {
  report: CompareReport;
  left: CompareDocument;
  right: CompareDocument;
  mode: CompareMode;
  zoom: CompareZoom;
  sync: boolean;
  opacity: number;
  hidden: Set<CompareChangeKind>;
  concurrency: number;
  onZoom(zoom: CompareZoom): void;
  onSync(sync: boolean): void;
  onNavigate(index: number): void;
}

interface Layer {
  side: 'left' | 'right';
  page: number;
  canvas: HTMLCanvasElement;
  paper: HTMLElement;
  slot: HTMLElement;
  /** Scale the current bitmap was rendered at (0 = not rendered). */
  renderedWidth: number;
}

interface Column {
  scroller: HTMLElement;
  slots: HTMLElement[];
}

export interface CompareView {
  root: HTMLElement;
  scrollToPage(index: number): void;
  setZoom(zoom: CompareZoom): void;
  setOpacity(opacity: number): void;
  setHidden(hidden: Set<CompareChangeKind>): void;
  setCurrent(index: number): void;
  destroy(): void;
}

function createCompareView(options: ViewOptions): CompareView {
  const { report, left, right, mode } = options;
  const docs = { left: left.document, right: right.document };
  const names = { left: left.name, right: right.name };
  let zoom = options.zoom;
  let syncing = options.sync;
  let destroyed = false;
  let current = -1;

  const root = el('section', {
    className: 'ds-compare',
    attrs: { 'aria-label': 'Comparison' },
    dataset: { mode, zoom },
  });
  root.style.setProperty('--_overlay-opacity', String(options.opacity));

  // ---------- Toolbar ----------
  const zoomControl = segmented({
    label: 'Zoom',
    options: [
      ['fit', 'Fit width'],
      ['actual', '100%'],
    ],
    value: zoom,
    onChange: (value) => {
      setZoom(value as CompareZoom);
      options.onZoom(value as CompareZoom);
    },
  });
  const syncToggle = checkbox({
    label: 'Sync scrolling',
    checked: syncing,
    switch: true,
  });
  syncToggle.control.addEventListener('change', () => {
    syncing = syncToggle.control.checked;
    options.onSync(syncing);
  });
  const changed = report.pages.filter((p) => p.changes.length);
  const previous = iconButton({
    label: 'Previous change',
    icon: icons.previous,
    size: 's',
    onClick: () => step(-1),
  });
  const next = iconButton({
    label: 'Next change',
    icon: icons.next,
    size: 's',
    onClick: () => step(1),
  });
  const position = el('span', {
    className: 'ds-compare__position',
    attrs: { 'aria-live': 'polite' },
  });
  const toolbar = el(
    'div',
    {
      className: 'ds-toolbar ds-compare__toolbar',
      attrs: { role: 'toolbar', 'aria-label': 'Comparison view' },
    },
    [
      zoomControl.root,
      mode === 'side-by-side' ? syncToggle.root : null,
      el('span', { className: 'ds-compare__spacer' }),
      position,
      previous,
      next,
    ]
  );
  root.append(toolbar);

  function step(offset: -1 | 1) {
    if (!changed.length) return;
    const at = changed.findIndex((p) => p.index === current);
    const target =
      at < 0
        ? offset > 0
          ? changed[0]
          : changed[changed.length - 1]
        : changed[Math.min(changed.length - 1, Math.max(0, at + offset))];
    options.onNavigate(target.index);
  }

  function updatePosition() {
    const at = changed.findIndex((p) => p.index === current);
    previous.disabled = !changed.length || at === 0;
    next.disabled = !changed.length || at === changed.length - 1;
    position.textContent = !changed.length
      ? 'No changes'
      : at < 0
        ? plural(changed.length, 'page') + ' with changes'
        : `Page ${at + 1} of ${changed.length} with changes`;
  }

  // ---------- Pages ----------
  const layers: Layer[] = [];
  const baseSize = { width: 612, height: 792 };

  function marks(rects: CompareRect[], kind: CompareChangeKind) {
    return rects.map((rect) => {
      const mark = el('span', {
        className: 'ds-compare__mark',
        attrs: { 'aria-hidden': 'true' },
        dataset: { kind },
      });
      mark.style.left = `${rect.x * 100}%`;
      mark.style.top = `${rect.y * 100}%`;
      mark.style.width = `${rect.width * 100}%`;
      mark.style.height = `${rect.height * 100}%`;
      return mark;
    });
  }

  function slot(label: string, pairIndexes: number[]) {
    const node = el('div', {
      className: 'ds-compare__page',
      dataset: { pairs: pairIndexes.join(' ') },
    });
    const paper = el('div', {
      className: 'ds-compare__paper',
      attrs: { role: 'img', 'aria-label': label },
    });
    const caption = el('div', {
      className: 'ds-compare__caption',
      attrs: { 'aria-hidden': 'true' },
    });
    node.append(paper, caption);
    return { node, paper, caption };
  }

  function addLayer(
    side: 'left' | 'right',
    page: number,
    paper: HTMLElement,
    slotNode: HTMLElement
  ) {
    const canvas = el('canvas', {
      className: 'ds-compare__canvas',
      attrs: { 'aria-hidden': 'true' },
      dataset: { side },
    });
    paper.append(canvas);
    const layer: Layer = {
      side,
      page,
      canvas,
      paper,
      slot: slotNode,
      renderedWidth: 0,
    };
    layers.push(layer);
    return layer;
  }

  const pairsForSide = (side: 'left' | 'right', page: number) =>
    report.pages.filter(
      (p) => (side === 'left' ? p.leftPage : p.rightPage) === page
    );

  function sideColumn(side: 'left' | 'right'): Column & { root: HTMLElement } {
    const count =
      side === 'left' ? report.leftPageCount : report.rightPageCount;
    const pages = el('div', { className: 'ds-compare__pages' });
    const scroller = el(
      'div',
      {
        className: 'ds-compare__scroll',
        attrs: {
          tabindex: 0,
          role: 'region',
          'aria-label': `${names[side]} pages`,
        },
      },
      [pages]
    );
    const slots: HTMLElement[] = [];
    const total = Math.max(count, docs[side].numPages);
    for (let page = 1; page <= total; page++) {
      const pairs = pairsForSide(side, page);
      const changes = pairs.flatMap((p) => p.changes);
      const visibleChanges = changes.filter((c) =>
        side === 'left' ? c.kind !== 'added' : c.kind !== 'removed'
      );
      const whole = pairs.find((p) =>
        side === 'left' ? p.rightPage === null : p.leftPage === null
      );
      const label = `${names[side]}, page ${page}${
        whole
          ? side === 'left'
            ? ', removed in the second PDF'
            : ', added in the second PDF'
          : visibleChanges.length
            ? `, ${plural(visibleChanges.length, 'change')}`
            : ''
      }`;
      const s = slot(
        label,
        pairs.map((p) => p.index)
      );
      s.caption.textContent = whole
        ? side === 'left'
          ? `Page ${page} · Removed`
          : `Page ${page} · Added`
        : `Page ${page}`;
      if (whole) s.node.dataset.whole = side === 'left' ? 'removed' : 'added';
      addLayer(side, page, s.paper, s.node);
      for (const change of changes) {
        const rects = side === 'left' ? change.leftRects : change.rightRects;
        if (rects.length) s.paper.append(...marks(rects, change.kind));
      }
      slots.push(s.node);
      pages.append(s.node);
    }
    const header = el('header', { className: 'ds-compare__header' }, [
      el('span', {
        className: 'ds-compare__role',
        text: side === 'left' ? 'This PDF' : 'Compared with',
      }),
      el('span', {
        className: 'ds-compare__name',
        text: names[side],
        attrs: { title: names[side] },
      }),
      el('span', { className: 'ds-badge', text: plural(count, 'page') }),
    ]);
    const columnRoot = el('div', { className: 'ds-compare__column' }, [
      header,
      scroller,
    ]);
    return { root: columnRoot, scroller, slots };
  }

  const columns: Column[] = [];
  const pairSlots = new Map<number, HTMLElement>();
  if (mode === 'side-by-side') {
    const l = sideColumn('left');
    const r = sideColumn('right');
    columns.push(l, r);
    root.append(
      el('div', { className: 'ds-compare__columns' }, [l.root, r.root])
    );
  } else {
    const pages = el('div', { className: 'ds-compare__pages' });
    const scroller = el(
      'div',
      {
        className: 'ds-compare__scroll',
        attrs: { tabindex: 0, role: 'region', 'aria-label': 'Overlaid pages' },
      },
      [pages]
    );
    const slots: HTMLElement[] = [];
    for (const pair of report.pages) {
      const label = `${pageLabel(pair)}${
        pair.changes.length ? `, ${describeCounts(pair)}` : ', no changes'
      }`;
      const s = slot(label, [pair.index]);
      s.caption.textContent = pageLabel(pair);
      if (pair.leftPage === null) s.node.dataset.whole = 'added';
      if (pair.rightPage === null) s.node.dataset.whole = 'removed';
      if (pair.leftPage !== null)
        addLayer('left', pair.leftPage, s.paper, s.node);
      if (pair.rightPage !== null) {
        const top = addLayer('right', pair.rightPage, s.paper, s.node);
        if (pair.leftPage !== null) top.canvas.dataset.top = '';
      }
      for (const change of pair.changes) {
        if (change.leftRects.length && change.kind !== 'added')
          s.paper.append(...marks(change.leftRects, change.kind));
        if (change.rightRects.length && change.kind !== 'removed')
          s.paper.append(...marks(change.rightRects, change.kind));
      }
      pairSlots.set(pair.index, s.node);
      slots.push(s.node);
      pages.append(s.node);
    }
    columns.push({ scroller, slots });
    const header = el('header', { className: 'ds-compare__header' }, [
      el('span', { className: 'ds-compare__role', text: 'Overlay' }),
      el('span', {
        className: 'ds-compare__name',
        text: `${names.left} under ${names.right}`,
        attrs: { title: `${names.left} under ${names.right}` },
      }),
    ]);
    root.append(
      el('div', { className: 'ds-compare__columns', dataset: { single: '' } }, [
        el('div', { className: 'ds-compare__column' }, [header, scroller]),
      ])
    );
  }
  setHidden(options.hidden);

  // ---------- Sizes ----------
  const sizes = {
    left: new Map<number, { width: number; height: number }>(),
    right: new Map<number, { width: number; height: number }>(),
  };
  function applySize(layer: Layer) {
    const size = sizes[layer.side].get(layer.page) ?? baseSize;
    // In overlay the base (first) layer defines the slot size.
    if (layer.paper.querySelector('canvas') !== layer.canvas) return;
    layer.slot.style.setProperty('--_ratio', `${size.width} / ${size.height}`);
    layer.slot.style.setProperty(
      '--_actual-width',
      `${Math.round(size.width * CSS_PER_POINT)}px`
    );
  }
  void (async () => {
    for (const side of ['left', 'right'] as const) {
      if (!docs[side].numPages) continue;
      try {
        const page = await docs[side].getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        if (side === 'left' || !docs.left.numPages) {
          baseSize.width = viewport.width;
          baseSize.height = viewport.height;
        }
        sizes[side].set(1, { width: viewport.width, height: viewport.height });
      } catch {
        // Fall back to Letter proportions until pages render.
      }
    }
    if (!destroyed) for (const layer of layers) applySize(layer);
  })();
  for (const layer of layers) applySize(layer);

  // ---------- Lazy rendering (IntersectionObserver, capped concurrency) ----------
  const queue: Layer[] = [];
  const visible = new Set<Layer>();
  let running = 0;
  const layersBySlot = new Map<Element, Layer[]>();
  for (const layer of layers) {
    const list = layersBySlot.get(layer.slot) ?? [];
    list.push(layer);
    layersBySlot.set(layer.slot, list);
  }
  const observers: IntersectionObserver[] = [];
  const hasObserver = typeof IntersectionObserver !== 'undefined';
  for (const column of columns) {
    if (!hasObserver) break;
    const observer = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          for (const layer of layersBySlot.get(record.target) ?? []) {
            if (record.isIntersecting) {
              visible.add(layer);
              request(layer);
            } else {
              visible.delete(layer);
              const at = queue.indexOf(layer);
              if (at >= 0) queue.splice(at, 1);
            }
          }
        }
      },
      { root: column.scroller, rootMargin: '600px 0px' }
    );
    for (const s of column.slots) observer.observe(s);
    observers.push(observer);
  }

  const targetWidth = (layer: Layer) => {
    const size = sizes[layer.side].get(layer.page) ?? baseSize;
    const css =
      zoom === 'actual'
        ? size.width * CSS_PER_POINT
        : layer.slot.clientWidth || 600;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    return Math.round(Math.min(css * ratio, 4096));
  };

  function request(layer: Layer) {
    if (destroyed || queue.includes(layer)) return;
    if (
      layer.renderedWidth &&
      Math.abs(layer.renderedWidth - targetWidth(layer)) < 2
    )
      return;
    queue.push(layer);
    pump();
  }

  function pump() {
    while (running < options.concurrency && queue.length && !destroyed) {
      const layer = queue.shift()!;
      running++;
      void renderLayer(layer).finally(() => {
        running--;
        pump();
      });
    }
  }

  async function renderLayer(layer: Layer) {
    const doc = docs[layer.side];
    if (layer.page > doc.numPages) return;
    try {
      const page = await doc.getPage(layer.page);
      if (destroyed) return;
      const base = page.getViewport({ scale: 1 });
      sizes[layer.side].set(layer.page, {
        width: base.width,
        height: base.height,
      });
      applySize(layer);
      const width = targetWidth(layer);
      const viewport = page.getViewport({ scale: width / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext('2d');
      if (context)
        await page.render({ canvas, canvasContext: context, viewport }).promise;
      page.cleanup?.();
      if (destroyed) return;
      // Swap in the finished bitmap so zoom changes never flash blank.
      layer.canvas.width = canvas.width;
      layer.canvas.height = canvas.height;
      layer.canvas.getContext('2d')?.drawImage(canvas, 0, 0);
      layer.renderedWidth = width;
      layer.slot.dataset.loaded = '';
    } catch {
      layer.slot.dataset.failed = '';
    }
  }

  // ---------- Scrolling ----------
  let suppressUntil = 0;
  const locked = new Set<HTMLElement>();
  const now = () =>
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (columns.length === 2) {
    const [a, b] = columns.map((c) => c.scroller);
    const follow = (from: HTMLElement, to: HTMLElement) => {
      if (locked.delete(from)) return;
      if (!syncing || now() < suppressUntil) return;
      const ratio =
        from.scrollTop / Math.max(1, from.scrollHeight - from.clientHeight);
      const top = ratio * Math.max(0, to.scrollHeight - to.clientHeight);
      if (Math.abs(to.scrollTop - top) < 1) return;
      locked.add(to);
      to.scrollTop = top;
    };
    a.addEventListener('scroll', () => follow(a, b), { passive: true });
    b.addEventListener('scroll', () => follow(b, a), { passive: true });
  }

  function scrollInto(
    scroller: HTMLElement,
    target: HTMLElement | undefined,
    rects: CompareRect[]
  ) {
    if (!target) return;
    const firstY = rects.length ? Math.min(...rects.map((r) => r.y)) : 0;
    const top = Math.max(
      0,
      target.offsetTop +
        firstY * target.offsetHeight -
        (rects.length ? scroller.clientHeight / 3 : 16)
    );
    const behavior = reducedMotion() ? ('auto' as const) : ('smooth' as const);
    if (typeof scroller.scrollTo === 'function')
      scroller.scrollTo({ top, behavior });
    else scroller.scrollTop = top;
  }

  function nearestSlot(side: 'left' | 'right', pair: PageComparison) {
    const column = columns[side === 'left' ? 0 : 1];
    let page = side === 'left' ? pair.leftPage : pair.rightPage;
    if (page === null) {
      // Added/removed page: land beside where it would sit.
      const before = report.pages
        .slice(0, pair.index)
        .reverse()
        .find((p) => (side === 'left' ? p.leftPage : p.rightPage) !== null);
      page = before
        ? (side === 'left' ? before.leftPage : before.rightPage)!
        : 1;
    }
    return column.slots[Math.min(page, column.slots.length) - 1];
  }

  function scrollToPage(index: number) {
    const pair = report.pages[index];
    if (!pair) return;
    setCurrent(index);
    suppressUntil = now() + 800;
    if (columns.length === 2) {
      scrollInto(
        columns[0].scroller,
        nearestSlot('left', pair),
        pair.changes.flatMap((c) => c.leftRects)
      );
      scrollInto(
        columns[1].scroller,
        nearestSlot('right', pair),
        pair.changes.flatMap((c) => c.rightRects)
      );
    } else {
      scrollInto(
        columns[0].scroller,
        pairSlots.get(index),
        pair.changes.flatMap((c) => [...c.leftRects, ...c.rightRects])
      );
    }
  }

  function setCurrent(index: number) {
    current = index;
    for (const column of columns)
      for (const s of column.slots) {
        const on = (s.dataset.pairs ?? '').split(' ').includes(String(index));
        if (on) s.dataset.current = '';
        else delete s.dataset.current;
      }
    updatePosition();
  }

  function setZoom(next: CompareZoom) {
    zoom = next;
    root.dataset.zoom = next;
    zoomControl.set(next);
    for (const layer of visible) request(layer);
    if (!hasObserver) for (const layer of layers) request(layer);
  }

  function setHidden(hidden: Set<CompareChangeKind>) {
    for (const [kind] of kinds)
      root.toggleAttribute(`data-hide-${kind}`, hidden.has(kind));
  }

  updatePosition();
  if (!hasObserver) for (const layer of layers) request(layer);

  return {
    root,
    scrollToPage,
    setZoom,
    setOpacity(opacity: number) {
      root.style.setProperty('--_overlay-opacity', String(opacity));
    },
    setHidden,
    setCurrent,
    destroy() {
      destroyed = true;
      queue.length = 0;
      for (const observer of observers) observer.disconnect();
      root.remove();
    },
  };
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

/**
 * Compare the open PDF with another PDF. Returns a NativePanel: `root` goes in
 * the tool panel, `canvasRoot` replaces the viewer with synced page columns.
 * Read-only: nothing is committed.
 */
export function createComparePanel(
  host: ToolHost,
  id: string,
  refresh: () => void,
  panelOptions: ComparePanelOptions = {}
) {
  const load = panelOptions.loadDocument ?? defaultLoader;
  const concurrency = Math.max(1, panelOptions.concurrency ?? 2);
  const compare =
    panelOptions.compare ??
    ((
      l: CompareDocument,
      r: CompareDocument,
      ctx: { signal: AbortSignal; progress(update: CompareProgress): void }
    ) =>
      compareDocuments(
        l as unknown as CompareInput,
        r as unknown as CompareInput,
        ctx
      ));

  // ---------- Panel ----------
  const root = el('div', {
    className: 'ds-tool-panel ds-compare-panel',
    dataset: { tool: 'compare-pdfs' },
  });
  const body = el('div', { className: 'ds-tool-panel__body' });
  const footer = el('div', { className: 'ds-tool-panel__footer' });
  root.append(body, footer);

  const intro = el('p', {
    className: 'ds-tool-panel__description',
    text: 'Compare this PDF with another version. Text changes are highlighted on both.',
  });
  const sources = el('ul', {
    className: 'ds-compare-panel__files',
    attrs: { 'aria-label': 'Documents to compare' },
  });
  const picker = dropZone({
    accept: '.pdf,application/pdf',
    title: 'Choose a PDF to compare',
    hint: 'Files stay on this device',
    onFiles: (files) => choose(files[0]),
  });
  const sourceField = el('div', { className: 'ds-field' }, [
    el('span', { className: 'ds-field__label', text: 'Compare with' }),
    sources,
    picker.root,
  ]);

  let mode: CompareMode = 'side-by-side';
  let zoom: CompareZoom = 'fit';
  let syncScroll = true;
  let opacity = 0.5;
  const hidden = new Set<CompareChangeKind>();

  const modeControl = segmented({
    label: 'View',
    options: [
      ['side-by-side', 'Side by side'],
      ['overlay', 'Overlay'],
    ],
    value: mode,
    block: true,
    onChange(value) {
      mode = value as CompareMode;
      showView();
      update();
    },
  });
  const opacityField = slider({
    label: 'Top page opacity',
    min: 0,
    max: 100,
    step: 5,
    value: opacity * 100,
    format: (v) => `${v}%`,
  });
  opacityField.control.addEventListener('input', () => {
    opacity = Number(opacityField.control.value) / 100;
    view?.setOpacity(opacity);
  });
  const viewField = el('div', { className: 'ds-field' }, [
    el('span', { className: 'ds-field__label', text: 'View' }),
    modeControl.root,
  ]);

  const feedback = el('div', { attrs: { 'aria-live': 'polite' } });
  const summary = el('h3', { className: 'ds-compare-panel__summary' });
  const legend = el('div', {
    className: 'ds-compare-legend',
    attrs: { role: 'group', 'aria-label': 'Show highlights' },
  });
  const list = el('ul', {
    className: 'ds-compare-results',
    attrs: { 'aria-label': 'Pages with changes' },
  });
  const results = el(
    'section',
    {
      className: 'ds-compare-panel__results',
      attrs: { 'aria-label': 'Comparison results' },
    },
    [summary, legend, list]
  );

  body.append(
    intro,
    sourceField,
    viewField,
    opacityField.root,
    feedback,
    results
  );

  const primary = button({
    label: 'Export report',
    variant: 'accent',
    size: 'l',
    block: true,
    onClick: () => exportReport('text'),
  });
  const exportJson = button({
    label: 'Export JSON',
    variant: 'quiet',
    size: 's',
    onClick: () => exportReport('json'),
  });
  footer.append(
    primary,
    el('div', { className: 'ds-tool-panel__footer-row' }, [
      el('p', {
        className: 'ds-tool-panel__note',
        text: 'Read-only. Neither PDF is changed.',
      }),
      exportJson,
    ])
  );

  // ---------- Canvas ----------
  const canvasRoot = el('section', {
    className: 'ds-compare-host',
    attrs: { 'aria-label': 'Compare PDFs' },
  });

  // ---------- State ----------
  let second: File | null = null;
  let first: File | null = null;
  let report: CompareReport | null = null;
  let docs: { left: GridPdfDocument; right: GridPdfDocument } | null = null;
  let view: CompareView | null = null;
  let current = -1;
  let comparedRevision = -1;
  let token = 0;
  let busy = false;
  let active = true;
  let disposed = false;
  let failed = false;
  let controller: AbortController | null = null;

  function canvasEmpty() {
    const hasPdf = host.hasPdf(id);
    const empty = emptyState({
      icon: icons.compare,
      title: hasPdf ? 'Choose a PDF to compare' : 'Open a PDF to compare',
      message: hasPdf
        ? 'Pick the other version. Both appear here side by side with changes highlighted.'
        : 'Open the first version, then choose the PDF to compare it with.',
    });
    const zone = dropZone({
      accept: '.pdf,application/pdf',
      title: hasPdf ? 'Choose a PDF to compare' : 'Choose a PDF',
      hint: 'Files stay on this device',
      onFiles: (files) =>
        hasPdf
          ? choose(files[0])
          : void host
              .attach(id, files[0])
              .then(() => refresh())
              .catch((error) => showError(error, 'open')),
    });
    empty.append(zone.root);
    canvasRoot.replaceChildren(empty);
  }

  function renderSources() {
    const rows: HTMLLIElement[] = [];
    if (first || host.hasPdf(id))
      rows.push(
        fileRow({
          file: first ?? new File([], 'Open PDF'),
          meta: 'This PDF',
        })
      );
    if (second)
      rows.push(
        fileRow({
          file: second,
          meta: report
            ? plural(report.rightPageCount, 'page')
            : busy
              ? 'Comparing…'
              : 'Ready',
          state: busy ? 'processing' : failed ? 'failed' : 'ready',
          onRemove: busy ? undefined : () => clear(),
          onRetry: () => void run(),
        })
      );
    sources.replaceChildren(...rows);
    picker.root.hidden = !!second || !host.hasPdf(id);
  }

  function renderResults() {
    results.hidden = !report || busy;
    if (!report) return;
    summary.textContent = summaryLine(report);
    legend.replaceChildren(
      ...kinds.map(([kind, label]) => {
        const count = report!.totals[kind];
        const chip = el(
          'button',
          {
            className: 'ds-compare-chip',
            attrs: {
              type: 'button',
              'aria-pressed': String(!hidden.has(kind)),
              title: `${hidden.has(kind) ? 'Show' : 'Hide'} ${label.toLowerCase()} highlights`,
            },
            dataset: { kind },
          },
          [
            el('span', {
              className: 'ds-compare-chip__swatch',
              attrs: { 'aria-hidden': 'true' },
            }),
            el('span', { text: label }),
            el('span', {
              className: 'ds-compare-chip__count',
              text: String(count),
            }),
          ]
        );
        chip.addEventListener('click', () => {
          if (hidden.has(kind)) hidden.delete(kind);
          else hidden.add(kind);
          view?.setHidden(hidden);
          renderResults();
          legend.querySelector<HTMLElement>(`[data-kind="${kind}"]`)?.focus();
        });
        return chip;
      })
    );
    const pages = report.pages.filter((p) => p.changes.length);
    const notes: HTMLElement[] = [];
    if (report.pagesWithoutText)
      notes.push(
        inlineAlert({
          tone: 'notice',
          message: `${plural(report.pagesWithoutText, 'page')} had no readable text, so changes there are not listed. Check them visually.`,
        })
      );
    if (!pages.length) {
      list.replaceChildren();
      legend.hidden = true;
      feedback.replaceChildren(
        ...notes,
        inlineAlert({
          tone: 'positive',
          message: 'The text in both PDFs matches.',
        })
      );
      return;
    }
    legend.hidden = false;
    if (notes.length) feedback.replaceChildren(...notes);
    list.replaceChildren(
      ...pages.map((page) => {
        const row = el(
          'button',
          {
            className: 'ds-compare-results__row',
            attrs: {
              type: 'button',
              'aria-current': page.index === current ? 'true' : undefined,
              'aria-label': `${pageLabel(page)}: ${describeCounts(page)}`,
            },
            dataset: { index: String(page.index) },
          },
          [
            el('span', {
              className: 'ds-compare-results__label',
              text: pageLabel(page),
            }),
            el(
              'span',
              {
                className: 'ds-compare-results__counts',
                attrs: { 'aria-hidden': 'true' },
              },
              kinds
                .filter(([kind]) => page[kind])
                .map(([kind]) =>
                  el('span', {
                    className: 'ds-compare-results__count',
                    text: String(page[kind]),
                    dataset: { kind },
                  })
                )
            ),
            el('span', {
              className: 'ds-compare-results__detail',
              text: page.changes[0]?.description ?? '',
              attrs: { 'aria-hidden': 'true' },
            }),
          ]
        );
        row.addEventListener('click', () => goTo(page.index));
        return el('li', {}, [row]);
      })
    );
  }

  function goTo(index: number) {
    current = index;
    view?.scrollToPage(index);
    for (const row of list.querySelectorAll<HTMLElement>(
      '.ds-compare-results__row'
    )) {
      if (row.dataset.index === String(index)) {
        row.setAttribute('aria-current', 'true');
        row.scrollIntoView?.({ block: 'nearest' });
      } else row.removeAttribute('aria-current');
    }
  }

  function showView() {
    view?.destroy();
    view = null;
    if (!report || !docs || !first || !second) return;
    view = createCompareView({
      report,
      left: { name: first.name, document: docs.left },
      right: { name: second.name, document: docs.right },
      mode,
      zoom,
      sync: syncScroll,
      opacity,
      hidden,
      concurrency,
      onZoom: (next) => (zoom = next),
      onSync: (next) => (syncScroll = next),
      onNavigate: (index) => goTo(index),
    });
    canvasRoot.replaceChildren(view.root);
    if (current >= 0) {
      view.setCurrent(current);
      const index = current;
      requestAnimationFrame?.(() => view?.scrollToPage(index));
    }
  }

  let sourcesKey = '';
  let resultsKey = '';
  function update() {
    if (disposed) return;
    // Rebuild lists only when their content changes, so focus survives sync().
    const nextSources = [
      host.hasPdf(id),
      first?.name,
      second?.name,
      busy,
      failed,
      !!report,
    ].join('|');
    if (nextSources !== sourcesKey) {
      sourcesKey = nextSources;
      renderSources();
    }
    const nextResults = [report ? 'report' : '', busy].join('|');
    if (nextResults !== resultsKey) {
      resultsKey = nextResults;
      renderResults();
    }
    viewField.hidden = !report;
    opacityField.root.hidden = !report || mode !== 'overlay';
    primary.disabled = busy || !report;
    exportJson.disabled = busy || !report;
  }

  function showError(error: unknown, context: 'open' | 'apply' = 'apply') {
    const description = describeWorkspaceError(error, context);
    feedback.replaceChildren(
      inlineAlert({
        tone: 'negative',
        title: 'The PDFs could not be compared',
        message: description.message,
        details: description.details,
        actions: [
          { label: 'Try again', onClick: () => void run() },
          {
            label: 'Choose another PDF',
            variant: 'quiet',
            onClick: () => picker.open(),
          },
        ],
      })
    );
    canvasRoot.replaceChildren(
      el('div', { className: 'ds-compare-host__message' }, [
        inlineAlert({
          tone: 'negative',
          message: 'Nothing to show yet. Your documents are unchanged.',
        }),
      ])
    );
  }

  function releaseDocs() {
    view?.destroy();
    view = null;
    if (docs) {
      void docs.left.destroy();
      void docs.right.destroy();
    }
    docs = null;
  }

  function clear() {
    token++;
    controller?.abort();
    controller = null;
    busy = false;
    failed = false;
    second = null;
    report = null;
    current = -1;
    releaseDocs();
    feedback.replaceChildren();
    canvasEmpty();
    update();
  }

  function choose(file: File | undefined) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      feedback.replaceChildren(
        inlineAlert({
          tone: 'negative',
          message: `${file.name} is not a PDF. Choose a PDF to compare.`,
        })
      );
      return;
    }
    second = file;
    void run();
  }

  async function run() {
    if (disposed || !second || !host.hasPdf(id)) return;
    controller?.abort();
    const mine = ++token;
    const abort = new AbortController();
    controller = abort;
    busy = true;
    failed = false;
    report = null;
    releaseDocs();
    const bar = progressBar({
      label: 'Opening PDFs…',
      onCancel: () => abort.abort(),
    });
    feedback.replaceChildren(bar.root);
    canvasRoot.replaceChildren(panelSkeleton('Comparing PDFs'));
    update();
    let loaded: { left: GridPdfDocument; right: GridPdfDocument } | null = null;
    try {
      const revision = host.revision(id);
      const file = await host.snapshot(id);
      const [leftBytes, rightBytes] = await Promise.all([
        file.arrayBuffer(),
        second.arrayBuffer(),
      ]);
      const [leftDoc, rightDoc] = await Promise.all([
        load(leftBytes),
        load(rightBytes),
      ]);
      loaded = { left: leftDoc, right: rightDoc };
      if (mine !== token || disposed)
        throw new DOMException('Stale', 'AbortError');
      const result = await compare(
        { name: file.name, document: leftDoc },
        { name: second.name, document: rightDoc },
        {
          signal: abort.signal,
          progress: (next) =>
            mine === token &&
            bar.update({
              label: next.label,
              value: next.value,
              detail: next.detail,
            }),
        }
      );
      if (mine !== token || disposed || abort.signal.aborted)
        throw new DOMException('Stale', 'AbortError');
      first = file;
      docs = loaded;
      loaded = null;
      report = result;
      comparedRevision = revision;
      busy = false;
      feedback.replaceChildren();
      current = -1;
      update();
      showView();
      host.status(`${summaryLine(result)}.`);
    } catch (error) {
      if (loaded) {
        void loaded.left.destroy();
        void loaded.right.destroy();
      }
      if (mine !== token || disposed) return;
      busy = false;
      if (abort.signal.aborted) {
        feedback.replaceChildren(
          inlineAlert({
            message: 'Comparison cancelled. Your documents are unchanged.',
            actions: [{ label: 'Compare again', onClick: () => void run() }],
          })
        );
        canvasEmpty();
      } else {
        failed = true;
        showError(error);
      }
      update();
    } finally {
      if (mine === token) controller = null;
    }
  }

  function exportReport(format: 'text' | 'json') {
    if (!report) return;
    const base = `${report.leftName.replace(/\.pdf$/i, '')}-vs-${report.rightName.replace(/\.pdf$/i, '')}`;
    const file =
      format === 'text'
        ? new File([formatReportText(report)], `${base}-comparison.txt`, {
            type: 'text/plain',
          })
        : new File([formatReportJson(report)], `${base}-comparison.json`, {
            type: 'application/json',
          });
    download(file);
    host.status(`${file.name} is downloading.`);
  }

  function sync() {
    if (disposed) return;
    if (!host.hasPdf(id)) {
      if (second || report) clear();
      else if (!canvasRoot.querySelector('.ds-empty')) canvasEmpty();
      update();
      return;
    }
    // Refresh the empty state once a PDF is open.
    if (
      !second &&
      (!canvasRoot.firstElementChild ||
        canvasRoot.querySelector('.ds-empty__title')?.textContent ===
          'Open a PDF to compare')
    )
      canvasEmpty();
    // The open PDF changed (edit, undo): compare the new revision.
    if (
      active &&
      second &&
      !busy &&
      report &&
      host.revision(id) !== comparedRevision
    )
      void run();
    update();
  }

  canvasEmpty();
  update();
  return {
    root,
    canvasRoot,
    sync,
    setActive(value: boolean) {
      active = value;
      if (value) sync();
    },
    /** Test and diagnostics hooks. */
    report: () => report,
    choose,
    goTo,
    dispose() {
      disposed = true;
      token++;
      controller?.abort();
      releaseDocs();
      root.remove();
      canvasRoot.remove();
    },
  };
}
