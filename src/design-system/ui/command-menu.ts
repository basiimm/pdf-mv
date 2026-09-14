import { button } from './controls.js';
import { el, uniqueId } from './dom.js';

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  /** Short trailing hint, e.g. a shortcut or "Open tab". */
  hint?: string;
}

export interface CommandSection {
  title: string;
  items: CommandItem[];
}

export interface CommandMenuOptions {
  label: string;
  placeholder: string;
  sections(query: string): CommandSection[];
  onSelect(item: CommandItem): void;
  /** Shown when a query has no results; return helpful next steps. */
  empty?(query: string): {
    message: string;
    actions?: { label: string; onClick(): void }[];
  };
}

/**
 * Keyboard-first launcher (⌘K). Combobox + listbox semantics, arrow keys,
 * Enter to run, Escape to close. Built on the native <dialog>.
 */
export function openCommandMenu(options: CommandMenuOptions): () => void {
  const listId = uniqueId('command-list');
  const input = el('input', {
    className: 'ds-command__input',
    attrs: {
      type: 'search',
      placeholder: options.placeholder,
      role: 'combobox',
      'aria-expanded': 'true',
      'aria-controls': listId,
      'aria-autocomplete': 'list',
      autocomplete: 'off',
      spellcheck: 'false',
    },
  });
  const list = el('div', {
    className: 'ds-command__list',
    attrs: { id: listId, role: 'listbox', 'aria-label': options.label },
  });
  const node = el(
    'dialog',
    {
      className: 'ds-dialog ds-command',
      attrs: { 'aria-label': options.label },
    },
    [
      el('div', { className: 'ds-command__search' }, [
        input,
        el('kbd', { className: 'ds-kbd', text: 'Esc' }),
      ]),
      list,
    ]
  );

  let items: { item: CommandItem; element: HTMLElement }[] = [];
  let active = 0;

  function setActive(index: number) {
    if (!items.length) return;
    active = (index + items.length) % items.length;
    items.forEach(({ element }, i) =>
      element.setAttribute('aria-selected', String(i === active))
    );
    const current = items[active].element;
    input.setAttribute('aria-activedescendant', current.id);
    current.scrollIntoView?.({ block: 'nearest' });
  }

  function render() {
    const query = input.value.trim();
    const sections = options
      .sections(query)
      .filter((section) => section.items.length);
    list.replaceChildren();
    items = [];
    for (const section of sections) {
      const groupId = uniqueId('command-group');
      const group = el(
        'div',
        { attrs: { role: 'group', 'aria-labelledby': groupId } },
        [
          el('div', {
            className: 'ds-command__section',
            text: section.title,
            attrs: { id: groupId },
          }),
        ]
      );
      for (const item of section.items) {
        const element = el(
          'div',
          {
            className: 'ds-command__item',
            attrs: {
              role: 'option',
              id: uniqueId('command-item'),
              'aria-selected': 'false',
            },
          },
          [
            el('span', { className: 'ds-command__text' }, [
              el('span', { className: 'ds-command__label', text: item.label }),
              item.description
                ? el('span', {
                    className: 'ds-command__description',
                    text: item.description,
                  })
                : null,
            ]),
            item.hint
              ? el('span', { className: 'ds-command__hint', text: item.hint })
              : null,
          ]
        );
        const index = items.length;
        element.addEventListener(
          'pointermove',
          () => active !== index && setActive(index)
        );
        element.addEventListener('click', () => choose(index));
        items.push({ item, element });
        group.append(element);
      }
      list.append(group);
    }
    if (!items.length) {
      input.removeAttribute('aria-activedescendant');
      const empty = options.empty?.(query) ?? { message: 'No results.' };
      list.append(
        el(
          'div',
          { className: 'ds-command__empty', attrs: { role: 'status' } },
          [
            el('p', { text: empty.message }),
            empty.actions?.length
              ? el(
                  'div',
                  { className: 'ds-empty__actions' },
                  empty.actions.map((action) =>
                    button({
                      label: action.label,
                      size: 's',
                      onClick: () => {
                        close();
                        action.onClick();
                      },
                    })
                  )
                )
              : null,
          ]
        )
      );
      return;
    }
    setActive(0);
  }

  function choose(index: number) {
    const entry = items[index];
    if (!entry) return;
    close();
    options.onSelect(entry.item);
  }

  let closed = false;
  const previousFocus = document.activeElement as HTMLElement | null;
  function close() {
    if (closed) return;
    closed = true;
    if (node.open && typeof node.close === 'function') node.close();
    node.remove();
    previousFocus?.focus?.({ preventScroll: true });
  }

  input.addEventListener('input', render);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(active + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(active - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(active);
    }
  });
  node.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  node.addEventListener('click', (event) => {
    if (event.target === node) close();
  });
  document.body.append(node);
  if (typeof node.showModal === 'function') node.showModal();
  else node.setAttribute('open', '');
  render();
  input.focus();
  return close;
}
