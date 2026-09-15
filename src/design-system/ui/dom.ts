type Child = Node | string | null | undefined | false;

export interface ElementOptions {
  className?: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | undefined>;
  dataset?: Record<string, string | undefined>;
}

/** Small typed element helper; text is always set as textContent (no HTML injection). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  children: Child[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    if (value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? '' : String(value));
  }
  for (const [name, value] of Object.entries(options.dataset ?? {}))
    if (value !== undefined) node.dataset[name] = value;
  for (const child of children) if (child) node.append(child);
  return node;
}

let uid = 0;
export function uniqueId(prefix = 'ds'): string {
  uid += 1;
  return `${prefix}-${uid}`;
}
