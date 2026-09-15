import { describe, expect, it, vi } from 'vitest';
import {
  button,
  dialog,
  dropZone,
  fileRow,
  iconButton,
  inlineAlert,
  progress,
  segmented,
  selectField,
  setBusy,
  textField,
  toolPanel,
} from './index';

describe('design-system ui', () => {
  it('builds buttons with variant, size and safe text', () => {
    const node = button({
      label: '<b>Merge</b>',
      variant: 'accent',
      size: 'l',
    });
    expect(node.dataset.variant).toBe('accent');
    expect(node.dataset.size).toBe('l');
    expect(node.type).toBe('button');
    expect(node.querySelector('b')).toBeNull();
    expect(node.textContent).toBe('<b>Merge</b>');
    setBusy(node, true, 'Merging…');
    expect(node.disabled).toBe(true);
    expect(node.getAttribute('aria-busy')).toBe('true');
    expect(node.textContent).toBe('Merging…');
  });

  it('names icon buttons for assistive technology', () => {
    const node = iconButton({ label: 'Close tab', icon: '<svg></svg>' });
    expect(node.getAttribute('aria-label')).toBe('Close tab');
    expect(node.dataset.variant).toBe('quiet');
    expect(node.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('associates labels, help and errors with fields', () => {
    const f = textField({ label: 'Pages', help: 'e.g. 1, 3-5' });
    const label = f.root.querySelector('label')!;
    expect(label.htmlFor).toBe(f.control.id);
    f.setError('Check the page range');
    expect(f.control.getAttribute('aria-invalid')).toBe('true');
    expect(f.control.getAttribute('aria-describedby')).toContain('-error');
    const s = selectField({
      label: 'Quality',
      options: [
        ['low', 'Low'],
        ['high', 'High'],
      ],
      value: 'high',
    });
    expect(s.control.value).toBe('high');
  });

  it('segmented control behaves as a radio group with arrow keys', () => {
    const onChange = vi.fn();
    const control = segmented({
      label: 'View',
      options: [
        ['pages', 'Pages'],
        ['files', 'Files'],
      ],
      value: 'pages',
      onChange,
    });
    document.body.append(control.root);
    const [pages, files] = control.root.querySelectorAll('button');
    expect(pages.getAttribute('aria-checked')).toBe('true');
    control.root.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    );
    expect(files.getAttribute('aria-checked')).toBe('true');
    expect(onChange).toHaveBeenCalledWith('files');
    expect(control.value).toBe('files');
  });

  it('reports determinate progress and offers cancel only when provided', () => {
    const p = progress({
      label: 'Compressing',
      value: 0.25,
      detail: 'Page 1 of 4',
    });
    const bar = p.root.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-valuenow')).toBe('25');
    expect(p.root.textContent).toContain('Page 1 of 4');
    expect(p.root.querySelector('button')).toBeNull();
    p.update({ value: undefined, onCancel: () => {} });
    expect(p.root.hasAttribute('data-indeterminate')).toBe(true);
    expect(p.root.querySelector('button')?.textContent).toBe('Cancel');
  });

  it('uses alert semantics only for negative messages and hides details', () => {
    const retry = vi.fn();
    const node = inlineAlert({
      tone: 'negative',
      message: 'Could not read this PDF.',
      details: 'No PDF header',
      actions: [{ label: 'Retry', onClick: retry }],
    });
    expect(node.getAttribute('role')).toBe('alert');
    expect(node.querySelector('details')?.open).toBe(false);
    node.querySelector('button')!.click();
    expect(retry).toHaveBeenCalled();
    expect(inlineAlert({ message: 'Saved' }).getAttribute('role')).toBe(
      'status'
    );
  });

  it('resolves dialogs false on dismiss and true on confirm', async () => {
    const dismissed = dialog({
      title: 'Discard edits?',
      message: 'Unsaved changes will be lost.',
      confirmLabel: 'Discard edits',
      tone: 'negative',
    });
    const node = document.querySelector('dialog')!;
    node.dispatchEvent(new Event('cancel'));
    await expect(dismissed).resolves.toBe(false);
    expect(document.querySelector('dialog')).toBeNull();
    const confirmed = dialog({ title: 'Replace file?', message: '' });
    (
      document.querySelector(
        '.ds-dialog__actions [data-variant="accent"]'
      ) as HTMLButtonElement
    ).click();
    await expect(confirmed).resolves.toBe(true);
  });

  it('drop zone passes dropped files and respects single selection', () => {
    const onFiles = vi.fn();
    const zone = dropZone({ onFiles });
    const a = new File(['a'], 'a.pdf');
    const b = new File(['b'], 'b.pdf');
    const drop = new Event('drop', {
      bubbles: true,
      cancelable: true,
    }) as DragEvent;
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [a, b] } });
    zone.root.dispatchEvent(drop);
    expect(onFiles).toHaveBeenCalledWith([a]);
  });

  it('file rows expose named move, retry and remove actions', () => {
    const onRemove = vi.fn();
    const row = fileRow({
      file: new File(['x'], 'report.pdf'),
      index: 0,
      total: 2,
      state: 'failed',
      onMove: () => {},
      onRemove,
      onRetry: () => {},
    });
    const labels = [...row.querySelectorAll('button')].map((b) =>
      b.getAttribute('aria-label')
    );
    expect(labels).toEqual([
      'Retry report.pdf',
      'Move report.pdf earlier',
      'Move report.pdf later',
      'Remove report.pdf',
    ]);
    expect(
      (
        row.querySelector(
          '[aria-label="Move report.pdf earlier"]'
        ) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    (
      row.querySelector('[aria-label="Remove report.pdf"]') as HTMLButtonElement
    ).click();
    expect(onRemove).toHaveBeenCalled();
  });

  it('tool panel keeps header, scrollable body and sticky footer', () => {
    const onBack = vi.fn();
    const panel = toolPanel({
      title: 'Compress PDF',
      description: 'Reduce file size.',
      onBack,
    });
    panel.setFooter(button({ label: 'Compress', variant: 'accent' }));
    expect(panel.root.querySelector('h2')?.textContent).toBe('Compress PDF');
    expect(
      panel.footer.querySelectorAll('[data-variant="accent"]')
    ).toHaveLength(1);
    panel.root
      .querySelector<HTMLButtonElement>('.ds-tool-panel__back')!
      .click();
    expect(onBack).toHaveBeenCalled();
  });
});
