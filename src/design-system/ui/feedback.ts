import { button } from './controls.js';
import { el, uniqueId } from './dom.js';

export type Tone = 'informative' | 'positive' | 'notice' | 'negative';

export interface AlertAction {
  label: string;
  onClick: () => void;
  variant?: 'secondary' | 'quiet';
}

export interface InlineAlertOptions {
  tone?: Tone;
  title?: string;
  message: string;
  actions?: AlertAction[];
  /** Technical details, collapsed by default. */
  details?: string;
}

/** What happened · whether the document is safe · one recovery action · details. */
export function inlineAlert(options: InlineAlertOptions): HTMLDivElement {
  const tone = options.tone ?? 'informative';
  const root = el('div', {
    className: 'ds-alert',
    attrs: { role: tone === 'negative' ? 'alert' : 'status' },
    dataset: { tone },
  });
  if (options.title)
    root.append(el('p', { className: 'ds-alert__title', text: options.title }));
  root.append(
    el('p', { className: 'ds-alert__message', text: options.message })
  );
  if (options.actions?.length)
    root.append(
      el(
        'div',
        { className: 'ds-alert__actions' },
        options.actions.map((action) =>
          button({
            label: action.label,
            size: 's',
            variant: action.variant ?? 'secondary',
            onClick: action.onClick,
          })
        )
      )
    );
  if (options.details)
    root.append(
      el('details', {}, [
        el('summary', { text: 'Technical details' }),
        el('pre', { text: options.details }),
      ])
    );
  return root;
}

export interface ProgressOptions {
  label: string;
  /** 0–1; omit for indeterminate. */
  value?: number;
  detail?: string;
  onCancel?: () => void;
}

export interface Progress {
  root: HTMLDivElement;
  update(next: Partial<ProgressOptions>): void;
}

/** Honest progress: a phase label, units where known, cancel only if it really stops work. */
export function progress(options: ProgressOptions): Progress {
  const id = uniqueId('progress');
  const label = el('span', { attrs: { id } });
  const value = el('span', { className: 'ds-progress__value' });
  const bar = el('div', { className: 'ds-progress__bar' });
  const track = el(
    'div',
    {
      className: 'ds-progress__track',
      attrs: {
        role: 'progressbar',
        'aria-labelledby': id,
        'aria-valuemin': 0,
        'aria-valuemax': 100,
      },
    },
    [bar]
  );
  const root = el('div', { className: 'ds-progress' }, [
    el('div', { className: 'ds-progress__head' }, [label, value]),
    track,
  ]);
  let cancel: HTMLButtonElement | null = null;
  let state: ProgressOptions = options;
  function render() {
    label.textContent = state.label;
    const known = typeof state.value === 'number';
    root.toggleAttribute('data-indeterminate', !known);
    if (known) {
      const pct = Math.round(Math.min(1, Math.max(0, state.value!)) * 100);
      bar.style.setProperty('--_value', `${pct}%`);
      track.setAttribute('aria-valuenow', String(pct));
      value.textContent = state.detail ?? `${pct}%`;
    } else {
      track.removeAttribute('aria-valuenow');
      value.textContent = state.detail ?? '';
    }
    if (state.onCancel && !cancel) {
      cancel = button({
        label: 'Cancel',
        size: 's',
        variant: 'quiet',
        onClick: () => state.onCancel?.(),
      });
      root.append(el('div', { className: 'ds-progress__actions' }, [cancel]));
    }
  }
  render();
  return {
    root,
    update(next) {
      state = { ...state, ...next };
      render();
    },
  };
}

let toastRegion: HTMLDivElement | null = null;

/** Non-blocking confirmation. Errors that need action belong in inlineAlert instead. */
export function toast(
  message: string,
  options: {
    tone?: 'neutral' | 'negative';
    action?: AlertAction;
    duration?: number;
  } = {}
) {
  if (!toastRegion?.isConnected) {
    toastRegion = el('div', {
      className: 'ds-toast-region',
      attrs: { 'aria-live': 'polite' },
    });
    document.body.append(toastRegion);
  }
  const node = el(
    'div',
    {
      className: 'ds-toast',
      dataset: { tone: options.tone === 'negative' ? 'negative' : undefined },
    },
    [el('span', { text: message })]
  );
  if (options.action)
    node.append(
      button({
        label: options.action.label,
        size: 's',
        variant: 'quiet',
        onClick: () => {
          options.action!.onClick();
          node.remove();
        },
      })
    );
  toastRegion.append(node);
  const timer = window.setTimeout(
    () => node.remove(),
    options.duration ?? 5000
  );
  node.addEventListener('pointerenter', () => clearTimeout(timer), {
    once: true,
  });
  node.addEventListener(
    'pointerleave',
    () => window.setTimeout(() => node.remove(), 2000),
    { once: true }
  );
  return node;
}

export interface DialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string | null;
  tone?: 'default' | 'negative';
}

/**
 * Modal alert/confirm on the native <dialog> (focus trap, Escape, inert page).
 * Resolves true for confirm, false for cancel/dismiss. Name the consequence in
 * confirmLabel for destructive actions, e.g. "Discard edits".
 */
export function dialog(options: DialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const titleId = uniqueId('dialog-title');
    const node = el('dialog', {
      className: 'ds-dialog',
      attrs: { 'aria-labelledby': titleId },
    });
    const confirm = button({
      label: options.confirmLabel ?? 'OK',
      variant: options.tone === 'negative' ? 'negative' : 'accent',
      onClick: () => close(true),
    });
    const actions = el('div', { className: 'ds-dialog__actions' });
    if (options.cancelLabel !== null)
      actions.append(
        button({
          label: options.cancelLabel ?? 'Cancel',
          variant: 'secondary',
          onClick: () => close(false),
        })
      );
    actions.append(confirm);
    node.append(
      el('div', { className: 'ds-dialog__content' }, [
        el('h2', {
          className: 'ds-dialog__title',
          text: options.title,
          attrs: { id: titleId },
        }),
        el('p', { className: 'ds-dialog__message', text: options.message }),
        actions,
      ])
    );
    let settled = false;
    function close(result: boolean) {
      if (settled) return;
      settled = true;
      if (node.open && typeof node.close === 'function') node.close();
      node.remove();
      resolve(result);
    }
    node.addEventListener('cancel', (event) => {
      event.preventDefault();
      close(false);
    });
    document.body.append(node);
    if (typeof node.showModal === 'function') node.showModal();
    else node.setAttribute('open', '');
    confirm.focus();
  });
}
