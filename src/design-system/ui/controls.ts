import { el, uniqueId } from './dom.js';

export type ButtonVariant = 'accent' | 'secondary' | 'quiet' | 'negative';
export type ButtonSize = 's' | 'm' | 'l';

export interface ButtonOptions {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Trusted inline SVG markup (icons from our own code only). */
  icon?: string;
  type?: 'button' | 'submit' | 'reset';
  block?: boolean;
  onClick?: (event: MouseEvent) => void;
}

function iconNode(svg: string): Element | null {
  const template = document.createElement('template');
  template.innerHTML = svg.trim();
  const node = template.content.firstElementChild;
  node?.setAttribute('aria-hidden', 'true');
  return node;
}

/** One accent button per surface; everything else is secondary or quiet. */
export function button(options: ButtonOptions): HTMLButtonElement {
  const node = el('button', {
    className: 'ds-button',
    attrs: { type: options.type ?? 'button' },
    dataset: {
      variant: options.variant ?? 'secondary',
      size: options.size ?? 'm',
      block: options.block ? '' : undefined,
    },
  });
  if (options.icon) {
    const icon = iconNode(options.icon);
    if (icon) node.append(icon);
  }
  node.append(el('span', { text: options.label }));
  if (options.onClick) node.addEventListener('click', options.onClick);
  return node;
}

export interface IconButtonOptions extends Omit<
  ButtonOptions,
  'icon' | 'block'
> {
  icon: string;
}

/** Icon-only button; the label becomes its accessible name and tooltip. */
export function iconButton(options: IconButtonOptions): HTMLButtonElement {
  const node = button({ ...options, variant: options.variant ?? 'quiet' });
  node.classList.add('ds-icon-button');
  node.setAttribute('aria-label', options.label);
  node.title = options.label;
  node.querySelector('span')?.remove();
  return node;
}

/** Toggle the busy state: disables the button and shows a spinner. */
export function setBusy(
  node: HTMLButtonElement,
  busy: boolean,
  label?: string
) {
  node.disabled = busy;
  node.dataset.busy = String(busy);
  node.setAttribute('aria-busy', String(busy));
  const text = node.querySelector('span');
  if (text && label) text.textContent = label;
}

interface FieldBase {
  label: string;
  name?: string;
  help?: string;
  required?: boolean;
}

export interface Field<T extends HTMLElement> {
  root: HTMLDivElement;
  control: T;
  setError(message: string): void;
}

function field<
  T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
>(base: FieldBase, control: T): Field<T> {
  const id = uniqueId('field');
  control.id = id;
  if (base.name) control.name = base.name;
  if (base.required) control.required = true;
  const help = base.help
    ? el('p', {
        className: 'ds-field__help',
        text: base.help,
        attrs: { id: `${id}-help` },
      })
    : null;
  const error = el('p', {
    className: 'ds-field__error',
    attrs: { id: `${id}-error`, 'aria-live': 'polite' },
  });
  control.setAttribute(
    'aria-describedby',
    [help && `${id}-help`, `${id}-error`].filter(Boolean).join(' ')
  );
  const root = el('div', { className: 'ds-field' }, [
    el('label', {
      className: 'ds-field__label',
      text: base.label,
      attrs: { for: id },
    }),
    control,
    help,
    error,
  ]);
  return {
    root,
    control,
    setError(message: string) {
      error.textContent = message;
      control.setAttribute('aria-invalid', String(!!message));
    },
  };
}

export interface TextFieldOptions extends FieldBase {
  value?: string;
  type?: 'text' | 'number' | 'email' | 'password' | 'color';
  placeholder?: string;
  min?: string;
  max?: string;
  step?: string;
}

export function textField(options: TextFieldOptions): Field<HTMLInputElement> {
  const input = el('input', {
    className: 'ds-input',
    attrs: {
      type: options.type ?? 'text',
      placeholder: options.placeholder,
      min: options.min,
      max: options.max,
      step: options.step,
    },
  });
  input.value = options.value ?? '';
  return field(options, input);
}

export function textArea(
  options: FieldBase & { value?: string; rows?: number }
) {
  const area = el('textarea', {
    className: 'ds-textarea',
    attrs: { rows: options.rows ?? 4 },
  });
  area.value = options.value ?? '';
  return field(options, area);
}

export interface SelectOptions extends FieldBase {
  options: [value: string, label: string][];
  value?: string;
}

export function selectField(options: SelectOptions): Field<HTMLSelectElement> {
  const select = el('select', { className: 'ds-select' });
  for (const [value, label] of options.options)
    select.add(new Option(label, value));
  if (options.value !== undefined) select.value = options.value;
  return field(options, select);
}

export function checkbox(options: {
  label: string;
  checked?: boolean;
  name?: string;
  switch?: boolean;
}): { root: HTMLLabelElement; control: HTMLInputElement } {
  const input = el('input', {
    attrs: {
      type: 'checkbox',
      name: options.name,
      role: options.switch ? 'switch' : undefined,
    },
  });
  input.checked = !!options.checked;
  const root = el(
    'label',
    {
      className: 'ds-check',
      dataset: { switch: options.switch ? '' : undefined },
    },
    [input, el('span', { text: options.label })]
  );
  return { root, control: input };
}

export function slider(
  options: FieldBase & {
    min: number;
    max: number;
    step?: number;
    value: number;
    format?: (v: number) => string;
  }
) {
  const input = el('input', {
    attrs: {
      type: 'range',
      min: options.min,
      max: options.max,
      step: options.step ?? 1,
    },
  });
  input.value = String(options.value);
  const output = el('output');
  const format = options.format ?? String;
  const update = () => (output.textContent = format(Number(input.value)));
  input.addEventListener('input', update);
  update();
  const wrap = el('div', { className: 'ds-slider' }, [input, output]);
  const result = field(options, input as HTMLInputElement);
  result.root.replaceChild(wrap, input);
  wrap.prepend(input);
  output.setAttribute('for', input.id);
  return result;
}

export interface SegmentedOptions {
  label: string;
  options: [value: string, label: string][];
  value: string;
  block?: boolean;
  onChange?: (value: string) => void;
}

/** Single-choice control (radio group semantics, arrow-key navigation). */
export function segmented(options: SegmentedOptions) {
  const root = el('div', {
    className: 'ds-segmented',
    attrs: { role: 'radiogroup', 'aria-label': options.label },
    dataset: { block: options.block ? '' : undefined },
  });
  let value = options.value;
  const buttons = options.options.map(([optionValue, label]) => {
    const node = el('button', {
      text: label,
      attrs: { type: 'button', role: 'radio' },
      dataset: { value: optionValue },
    });
    node.addEventListener('click', () => set(optionValue, true));
    return node;
  });
  root.append(...buttons);
  root.addEventListener('keydown', (event) => {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const index = options.options.findIndex(([v]) => v === value);
    const next =
      options.options[
        (index + step + options.options.length) % options.options.length
      ][0];
    set(next, true);
    buttons.find((b) => b.dataset.value === next)?.focus();
  });
  function set(next: string, notify = false) {
    value = next;
    for (const node of buttons) {
      const checked = node.dataset.value === next;
      node.setAttribute('aria-checked', String(checked));
      node.tabIndex = checked ? 0 : -1;
    }
    if (notify) options.onChange?.(next);
  }
  set(value);
  return {
    root,
    get value() {
      return value;
    },
    set,
  };
}

/** Collapsed-by-default section for rarely changed settings. */
export function disclosure(options: {
  summary: string;
  open?: boolean;
  children?: Node[];
}) {
  const body = el(
    'div',
    { className: 'ds-disclosure__body' },
    options.children ?? []
  );
  const root = el(
    'details',
    { className: 'ds-disclosure', attrs: { open: !!options.open } },
    [el('summary', { text: options.summary }), body]
  );
  return { root, body };
}

export function badge(text: string, tone?: 'accent'): HTMLSpanElement {
  return el('span', { className: 'ds-badge', text, dataset: { tone } });
}
