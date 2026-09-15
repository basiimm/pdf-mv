import { button } from './controls.js';
import { el } from './dom.js';

export interface ToolPanelOptions {
  title: string;
  description?: string;
  /** Shown as "Back to tools"; omit to hide. */
  onBack?: () => void;
}

export interface ToolPanel {
  root: HTMLElement;
  body: HTMLDivElement;
  footer: HTMLDivElement;
  /** Replace the body content (options, progress, result). */
  setBody(...nodes: Node[]): void;
  setFooter(...nodes: Node[]): void;
}

/**
 * The one scaffold every tool uses: header (title, back), scrollable body
 * (source, essential options, Advanced disclosure, result/errors), sticky
 * footer (primary action + note).
 */
export function toolPanel(options: ToolPanelOptions): ToolPanel {
  const header = el('header', { className: 'ds-tool-panel__header' });
  if (options.onBack) {
    const back = el('button', {
      className: 'ds-tool-panel__back',
      text: '← Tools',
      attrs: { type: 'button' },
    });
    back.addEventListener('click', options.onBack);
    header.append(back);
  }
  header.append(
    el('h2', { className: 'ds-tool-panel__title', text: options.title })
  );
  if (options.description)
    header.append(
      el('p', {
        className: 'ds-tool-panel__description',
        text: options.description,
      })
    );
  const body = el('div', { className: 'ds-tool-panel__body' });
  const footer = el('div', { className: 'ds-tool-panel__footer' });
  const root = el(
    'section',
    { className: 'ds-tool-panel', attrs: { 'aria-label': options.title } },
    [header, body, footer]
  );
  return {
    root,
    body,
    footer,
    setBody: (...nodes) => body.replaceChildren(...nodes),
    setFooter: (...nodes) => footer.replaceChildren(...nodes),
  };
}

export interface EmptyStateOptions {
  title: string;
  message?: string;
  /** Trusted inline SVG from our own code. */
  icon?: string;
  primary?: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
}

export function emptyState(options: EmptyStateOptions): HTMLDivElement {
  const root = el('div', { className: 'ds-empty' });
  if (options.icon) {
    const icon = el('div', {
      className: 'ds-empty__icon',
      attrs: { 'aria-hidden': 'true' },
    });
    const template = document.createElement('template');
    template.innerHTML = options.icon.trim();
    icon.append(template.content);
    root.append(icon);
  }
  root.append(el('h2', { className: 'ds-empty__title', text: options.title }));
  if (options.message)
    root.append(
      el('p', { className: 'ds-empty__message', text: options.message })
    );
  const actions = el('div', { className: 'ds-empty__actions' });
  if (options.primary)
    actions.append(
      button({
        label: options.primary.label,
        variant: 'accent',
        size: 'l',
        onClick: options.primary.onClick,
      })
    );
  if (options.secondary)
    actions.append(
      button({
        label: options.secondary.label,
        variant: 'secondary',
        size: 'l',
        onClick: options.secondary.onClick,
      })
    );
  if (actions.childElementCount) root.append(actions);
  return root;
}

/** Placeholder matching a tool panel's layout while it loads. */
export function panelSkeleton(label = 'Loading tool'): HTMLDivElement {
  return el(
    'div',
    {
      className: 'ds-skeleton',
      attrs: { role: 'status', 'aria-label': label },
    },
    [
      el('span'),
      el('span'),
      el('span'),
      el('span'),
      el('span', { dataset: { tall: '' } }),
    ]
  );
}

export interface ResultOptions {
  file: File | Blob;
  name: string;
  detail?: string;
  /** Primary action, e.g. "Open in new tab" for PDFs. */
  primary: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Inline result: name, type, size; no blocking success dialog. */
export function resultCard(options: ResultOptions): HTMLDivElement {
  const extension = options.name.split('.').pop()?.slice(0, 4) ?? 'file';
  return el('div', { className: 'ds-result', attrs: { role: 'status' } }, [
    el('div', { className: 'ds-result__file' }, [
      el('span', {
        className: 'ds-result__icon',
        text: extension,
        attrs: { 'aria-hidden': 'true' },
      }),
      el('div', { className: 'ds-file-row__text' }, [
        el('span', {
          className: 'ds-file-row__name',
          text: options.name,
          attrs: { title: options.name },
        }),
        el('span', {
          className: 'ds-file-row__meta',
          text: [formatBytes(options.file.size), options.detail]
            .filter(Boolean)
            .join(' · '),
        }),
      ]),
    ]),
    el('div', { className: 'ds-result__actions' }, [
      button({
        label: options.primary.label,
        variant: 'accent',
        onClick: options.primary.onClick,
      }),
      options.secondary &&
        button({
          label: options.secondary.label,
          variant: 'secondary',
          onClick: options.secondary.onClick,
        }),
    ]),
  ]);
}
