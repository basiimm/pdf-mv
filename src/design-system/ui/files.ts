import { iconButton } from './controls.js';
import { el } from './dom.js';
import { formatBytes } from './layout.js';

const icons = {
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m18 15-6-6-6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>',
  remove:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  retry:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  upload:
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0-5 5m5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
};

export interface DropZoneOptions {
  accept?: string;
  multiple?: boolean;
  title?: string;
  hint?: string;
  compact?: boolean;
  onFiles: (files: File[]) => void;
}

/** Click or drop to choose files. The same picker is used everywhere. */
export function dropZone(options: DropZoneOptions) {
  const input = el('input', {
    className: 'ds-visually-hidden',
    attrs: {
      type: 'file',
      accept: options.accept,
      multiple: !!options.multiple,
      tabindex: -1,
      'aria-hidden': 'true',
    },
  });
  const root = el('div', {
    className: 'ds-drop-zone',
    attrs: { role: 'button', tabindex: 0 },
    dataset: { compact: options.compact ? '' : undefined },
  });
  const icon = document.createElement('template');
  icon.innerHTML = icons.upload;
  root.append(
    icon.content,
    el('strong', {
      text:
        options.title ?? (options.multiple ? 'Choose files' : 'Choose a file'),
    })
  );
  if (options.hint && !options.compact)
    root.append(el('span', { text: options.hint }));
  root.append(input);
  root.setAttribute('aria-label', options.title ?? 'Choose files');
  const open = () => {
    input.value = '';
    input.click();
  };
  root.addEventListener('click', (event) => {
    if (event.target !== input) open();
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });
  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    if (files.length) options.onFiles(files);
  });
  root.addEventListener('dragover', (event) => {
    event.preventDefault();
    root.dataset.dragging = '';
  });
  root.addEventListener('dragleave', () => delete root.dataset.dragging);
  root.addEventListener('drop', (event) => {
    event.preventDefault();
    delete root.dataset.dragging;
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length)
      options.onFiles(options.multiple ? files : files.slice(0, 1));
  });
  return { root, input, open };
}

export type FileState = 'ready' | 'processing' | 'done' | 'failed';

export interface FileRowOptions {
  file: File;
  index?: number;
  total?: number;
  state?: FileState;
  meta?: string;
  thumbnail?: string;
  onMove?: (offset: -1 | 1) => void;
  onRemove?: () => void;
  onRetry?: () => void;
}

/** One file in a source list, with per-file recovery (retry/remove) instead of halting the batch. */
export function fileRow(options: FileRowOptions): HTMLLIElement {
  const state = options.state ?? 'ready';
  const thumb = options.thumbnail
    ? el('img', {
        className: 'ds-file-row__thumb',
        attrs: { src: options.thumbnail, alt: '' },
      })
    : el('span', {
        className: 'ds-file-row__thumb',
        attrs: { 'aria-hidden': 'true' },
      });
  const actions = el('div', { className: 'ds-file-row__actions' });
  const name = options.file.name;
  if (state === 'failed' && options.onRetry)
    actions.append(
      iconButton({
        label: `Retry ${name}`,
        icon: icons.retry,
        size: 's',
        onClick: options.onRetry,
      })
    );
  if (options.onMove && options.total && options.total > 1) {
    const up = iconButton({
      label: `Move ${name} earlier`,
      icon: icons.up,
      size: 's',
      onClick: () => options.onMove!(-1),
    });
    const down = iconButton({
      label: `Move ${name} later`,
      icon: icons.down,
      size: 's',
      onClick: () => options.onMove!(1),
    });
    up.disabled = options.index === 0;
    down.disabled = options.index === options.total - 1;
    actions.append(up, down);
  }
  if (options.onRemove)
    actions.append(
      iconButton({
        label: `Remove ${name}`,
        icon: icons.remove,
        size: 's',
        onClick: options.onRemove,
      })
    );
  const meta =
    options.meta ??
    (state === 'failed'
      ? 'Could not be processed'
      : state === 'processing'
        ? 'Processing…'
        : formatBytes(options.file.size));
  return el('li', { className: 'ds-file-row', dataset: { state } }, [
    thumb,
    el('div', { className: 'ds-file-row__text' }, [
      el('span', {
        className: 'ds-file-row__name',
        text: name,
        attrs: { title: name },
      }),
      el('span', { className: 'ds-file-row__meta', text: meta }),
    ]),
    actions,
  ]);
}

export interface PageThumbOptions {
  pageNumber: number;
  /** Canvas or image of the rendered page. */
  preview?: HTMLCanvasElement | HTMLImageElement;
  selected?: boolean;
  badge?: string;
  onToggle?: (selected: boolean) => void;
}

export function pageThumb(options: PageThumbOptions): HTMLButtonElement {
  const paper = el('span', { className: 'ds-page-thumb__paper' });
  if (options.preview) paper.append(options.preview);
  const root = el(
    'button',
    {
      className: 'ds-page-thumb',
      attrs: {
        type: 'button',
        'aria-pressed': String(!!options.selected),
        'aria-label': `Page ${options.pageNumber}`,
      },
    },
    [
      paper,
      el('span', {
        className: 'ds-page-thumb__label',
        text: String(options.pageNumber),
      }),
    ]
  );
  if (options.badge)
    root.append(
      el('span', { className: 'ds-page-thumb__badge', text: options.badge })
    );
  root.addEventListener('click', () => {
    const next = root.getAttribute('aria-pressed') !== 'true';
    root.setAttribute('aria-pressed', String(next));
    options.onToggle?.(next);
  });
  return root;
}
