import {
  button,
  checkbox,
  disclosure,
  el,
  fileRow,
  inlineAlert,
  progress as progressBar,
  resultCard,
  segmented,
  selectField,
  setBusy,
  textArea,
  textField,
  toast,
  dropZone,
} from '../../design-system/ui/index.js';
import { describeWorkspaceError } from '../workspace-errors.js';
import type { ToolHost } from '../workspace-tools.js';
import type { ToolDefinition, ToolField } from './types.js';

type Control = {
  value: string;
  setValue(value: string): void;
  element: HTMLElement;
  focus(): void;
  setDisabled(v: boolean): void;
};

function control(field: ToolField): Control {
  if (field.type === 'checkbox') {
    const c = checkbox({ label: field.label, checked: field.value === 'true' });
    return {
      element: c.root,
      get value() {
        return String(c.control.checked);
      },
      setValue: (v: string) => (c.control.checked = v === 'true'),
      focus: () => c.control.focus(),
      setDisabled: (v) => (c.control.disabled = v),
    };
  }
  if (field.type === 'segmented' && field.options) {
    const s = segmented({
      label: field.label,
      options: field.options,
      value: field.value,
      block: true,
    });
    const wrap = el('div', { className: 'ds-field' }, [
      el('span', { className: 'ds-field__label', text: field.label }),
      s.root,
    ]);
    return {
      element: wrap,
      get value() {
        return s.value;
      },
      setValue: (v: string) => s.set(v),
      focus: () =>
        s.root
          .querySelector<HTMLButtonElement>('[aria-checked="true"]')
          ?.focus(),
      setDisabled: (v) =>
        s.root.querySelectorAll('button').forEach((b) => (b.disabled = v)),
    };
  }
  if (field.type === 'textarea') {
    const t = textArea({ label: field.label, value: field.value, help: field.help, rows: 8 });
    return {
      element: t.root,
      get value() {
        return t.control.value;
      },
      setValue: (v: string) => (t.control.value = v),
      focus: () => t.control.focus(),
      setDisabled: (v) => (t.control.disabled = v),
    };
  }
  const f =
    field.type === 'select' && field.options
      ? selectField({
          label: field.label,
          options: field.options,
          value: field.value,
          help: field.help,
        })
      : textField({
          label: field.label,
          value: field.value,
          type:
            field.type === 'number' ||
            field.type === 'color' ||
            field.type === 'password'
              ? field.type
              : 'text',
          min: field.min,
          max: field.max,
          step: field.step,
          placeholder: field.placeholder,
          help: field.help,
        });
  return {
    element: f.root,
    get value() {
      return f.control.value;
    },
    setValue: (v: string) => (f.control.value = v),
    focus: () => f.control.focus(),
    setDisabled: (v) => (f.control.disabled = v),
  };
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = el('a', { attrs: { href: url, download: file.name } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/**
 * The one panel every in-view tool uses: source (when the tool needs its own
 * input), essential fields, Advanced, sticky primary action, inline progress,
 * result and recoverable errors.
 */
export function createToolPanel(
  host: ToolHost,
  id: string,
  tool: ToolDefinition,
  refresh: () => void
) {
  const root = el('div', {
    className: 'ds-tool-panel',
    dataset: { tool: tool.id },
  });
  const body = el('div', { className: 'ds-tool-panel__body' });
  const footer = el('div', { className: 'ds-tool-panel__footer' });
  root.append(body, footer);

  const intro = el('p', {
    className: 'ds-tool-panel__description',
    text: tool.description,
  });
  const source = el('div');
  const essentials = el('div', {
    className: 'ds-tool-panel__body',
    attrs: { style: 'padding:0' },
  });
  const advancedFields = tool.fields.filter((f) => f.advanced);
  const advanced = advancedFields.length
    ? disclosure({ summary: 'Advanced' })
    : null;
  const controls = new Map<string, Control>();
  for (const field of tool.fields) {
    const c = control(field);
    controls.set(field.key, c);
    (field.advanced ? advanced!.body : essentials).append(c.element);
  }
  // Fields that depend on the open document (form fields, layers), from inspect().
  const dynamicFields = el('div', {
    className: 'ds-tool-panel__body',
    attrs: { style: 'padding:0' },
  });
  let dynamicKeys: string[] = [];
  function setDynamicFields(fields: ToolField[]) {
    for (const key of dynamicKeys) controls.delete(key);
    dynamicKeys = [];
    const visible: HTMLElement[] = [];
    const hidden = disclosure({ summary: 'More fields' });
    for (const field of fields) {
      const c = control(field);
      controls.set(field.key, c);
      dynamicKeys.push(field.key);
      (field.advanced
        ? hidden.body
        : { append: (e: HTMLElement) => visible.push(e) }
      ).append(c.element);
    }
    dynamicFields.replaceChildren(...visible);
    if (hidden.body.childElementCount) dynamicFields.append(hidden.root);
  }
  const feedback = el('div', { attrs: { 'aria-live': 'polite' } });
  const primary = button({
    label: tool.primaryLabel,
    variant: 'accent',
    size: 'l',
    block: true,
    type: 'button',
  });
  const note = el('p', {
    className: 'ds-tool-panel__note',
    text:
      tool.output === 'revision'
        ? 'Changes apply to this document. You can undo.'
        : tool.output === 'new-document'
          ? 'The result opens in a new tab. Your original stays open.'
          : 'Runs on this device. The file downloads when ready.',
  });
  footer.append(primary, note);
  const details = el('dl', { className: 'ds-details' });
  details.hidden = true;
  body.append(intro, details, source, essentials, dynamicFields);
  if (advanced) body.append(advanced.root);
  body.append(feedback);

  let inputs: File[] = [];
  let busy = false;
  let controller: AbortController | null = null;
  let disposed = false;

  // Tools either replace the open PDF as their source (input) or add files to it (extraInput).
  const fileSource = tool.input ?? tool.extraInput;
  const picker = fileSource
    ? dropZone({
        accept: fileSource.accept,
        multiple: fileSource.multiple,
        title: fileSource.label,
        hint: 'Files stay on this device',
        onFiles(files) {
          inputs = fileSource!.multiple
            ? [...inputs, ...files]
            : files.slice(0, 1);
          sync();
        },
      })
    : null;

  let inspectedRevision = -1;
  async function inspect() {
    if (!tool.inspect || !host.hasPdf(id) || disposed) return;
    const revision = host.revision(id);
    if (revision === inspectedRevision) return;
    inspectedRevision = revision;
    try {
      const result = await tool.inspect(
        await host.snapshot(id, tool.preserveOriginal)
      );
      if (disposed) return;
      if (result.fields) setDynamicFields(result.fields);
      for (const [key, value] of Object.entries(result.values ?? {}))
        controls.get(key)?.setValue(value);
      details.replaceChildren(
        ...(result.details ?? []).flatMap(([label, value]) => [
          el('dt', { text: label }),
          el('dd', { text: value }),
        ])
      );
      details.hidden = !result.details?.length;
    } catch (error) {
      inspectedRevision = -1;
      const description = describeWorkspaceError(error, 'open');
      feedback.replaceChildren(
        inlineAlert({
          tone: 'negative',
          message: description.message,
          details: description.details,
        })
      );
    }
  }
  function sync() {
    void inspect();
    const ready = tool.input
      ? inputs.length > 0
      : tool.document === 'none'
        ? true
        : host.hasPdf(id) &&
        (!tool.extraInput || tool.extraInput.optional || inputs.length > 0);
    primary.disabled = busy || !ready;
    essentials.hidden = !ready;
    dynamicFields.hidden = !ready;
    if (advanced) advanced.root.hidden = !ready;
    source.replaceChildren();
    if (fileSource && picker) {
      if (inputs.length) {
        source.append(
          el(
            'ul',
            { className: 'ds-file-list' },
            inputs.map((file, index) =>
              fileRow({
                file,
                index,
                total: inputs.length,
                onMove: (offset) => {
                  const target = index + offset;
                  [inputs[index], inputs[target]] = [
                    inputs[target],
                    inputs[index],
                  ];
                  sync();
                },
                onRemove: () => {
                  inputs.splice(index, 1);
                  sync();
                },
              })
            )
          )
        );
      }
      picker.root.toggleAttribute('data-compact', inputs.length > 0);
      source.append(picker.root);
    }
  }

  function values() {
    return Object.fromEntries([...controls].map(([key, c]) => [key, c.value]));
  }

  async function run() {
    if (busy) return;
    busy = true;
    controller = new AbortController();
    const signal = controller.signal;
    setBusy(primary, true);
    controls.forEach((c) => c.setDisabled(true));
    const bar = progressBar({
      label: 'Preparing…',
      onCancel: () => controller?.abort(),
    });
    feedback.replaceChildren(bar.root);
    try {
      const files = tool.input
        ? [...inputs]
        : tool.document === 'none'
          ? []
        : [await host.snapshot(id, tool.preserveOriginal), ...inputs];
      const output = await tool.run({
        files,
        values: values(),
        signal,
        progress: (p) => bar.update(p),
      });
      if (signal.aborted || disposed) return;
      const results = Array.isArray(output) ? output : [output];
      if (
        tool.output === 'revision' &&
        results.length === 1 &&
        host.hasPdf(id)
      ) {
        bar.update({ label: 'Applying…', value: 1 });
        await host.commit(id, results[0], tool.doneLabel);
        feedback.replaceChildren();
        toast(tool.doneLabel, {
          action: {
            label: 'Undo',
            onClick: () =>
              void host
                .undoCommit(id)
                .then((label) => label && toast(`Undid: ${label}`)),
          },
        });
      } else if (tool.output === 'download') {
        results.forEach(download);
        feedback.replaceChildren(
          resultCard({
            file: results[0],
            name:
              results.length > 1 ? `${results.length} files` : results[0].name,
            primary: {
              label: 'Download again',
              onClick: () => results.forEach(download),
            },
          })
        );
      } else {
        for (const file of results) await host.result(file);
        feedback.replaceChildren(
          inlineAlert({
            tone: 'positive',
            message: `${tool.doneLabel}. The result opened in a new tab.`,
          })
        );
      }
    } catch (error) {
      if (signal.aborted || disposed) {
        feedback.replaceChildren(
          inlineAlert({
            message: 'Cancelled. Your document and settings are unchanged.',
          })
        );
        return;
      }
      const description = describeWorkspaceError(error, 'apply');
      feedback.replaceChildren(
        inlineAlert({
          tone: 'negative',
          message: description.message,
          details: description.details,
          actions: [
            {
              label: description.actionLabel,
              onClick: () => {
                if (description.action === 'fix-settings')
                  (
                    controls.get('pages') ?? controls.values().next().value
                  )?.focus();
                else if (description.action === 'choose-file' && picker)
                  picker.open();
                else void run();
              },
            },
          ],
        })
      );
    } finally {
      busy = false;
      controller = null;
      if (!disposed) {
        setBusy(primary, false, tool.primaryLabel);
        controls.forEach((c) => c.setDisabled(false));
        sync();
        refresh();
      }
    }
  }

  // Live preview: regenerate into the PDF view after settings settle.
  const livePreview = !!tool.preview && tool.output === 'revision';
  let previewFresh = false;
  let previewToken = 0;
  let previewTimer = 0;
  let active = true;
  async function refreshPreview() {
    if (!livePreview || busy || disposed || !active || !host.hasPdf(id)) return;
    const token = ++previewToken;
    previewFresh = false;
    feedback.replaceChildren(progressBar({ label: 'Updating preview…' }).root);
    try {
      const output = await tool.run({
        files: [await host.snapshot(id, tool.preserveOriginal)],
        values: values(),
        signal: new AbortController().signal,
        progress: () => {},
      });
      if (token !== previewToken || disposed || !active) return;
      await host.showPreview(id, Array.isArray(output) ? output[0] : output);
      if (token !== previewToken || disposed) return;
      previewFresh = true;
      feedback.replaceChildren(
        inlineAlert({
          message: 'Previewing in the document. Apply to keep these changes.',
          actions: [
            {
              label: 'Discard preview',
              variant: 'quiet',
              onClick: () => void discardPreview(),
            },
          ],
        })
      );
    } catch (error) {
      if (token !== previewToken || disposed) return;
      const description = describeWorkspaceError(error, 'preview');
      feedback.replaceChildren(
        inlineAlert({
          tone: 'negative',
          message: description.message,
          details: description.details,
          actions: [
            {
              label:
                description.action === 'fix-settings'
                  ? 'Keep editing'
                  : 'Try again',
              onClick: () =>
                description.action === 'fix-settings'
                  ? (
                      controls.get('pages') ?? controls.values().next().value
                    )?.focus()
                  : void refreshPreview(),
            },
          ],
        })
      );
    }
  }
  async function discardPreview() {
    previewToken++;
    previewFresh = false;
    clearTimeout(previewTimer);
    if (host.isPreviewing(id)) await host.cancelPreview(id);
    if (!disposed) feedback.replaceChildren();
  }
  function schedulePreview() {
    if (!livePreview) return;
    previewFresh = false;
    clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => {
      void refreshPreview();
    }, 350);
  }
  if (livePreview) {
    body.addEventListener('input', schedulePreview);
    body.addEventListener('change', schedulePreview);
    body.addEventListener('click', (event) => {
      if ((event.target as Element).closest('.ds-segmented button'))
        schedulePreview();
    });
  }

  primary.addEventListener('click', () => {
    if (livePreview && previewFresh && host.isPreviewing(id))
      void applyPreview();
    else {
      void (async () => {
        if (livePreview) await discardPreview();
        await run();
      })();
    }
  });
  async function applyPreview() {
    busy = true;
    setBusy(primary, true, 'Applying…');
    try {
      await host.applyPreview(id, tool.doneLabel);
      previewFresh = false;
      feedback.replaceChildren();
      toast(tool.doneLabel, {
        action: {
          label: 'Undo',
          onClick: () =>
            void host
              .undoCommit(id)
              .then((label) => label && toast(`Undid: ${label}`)),
        },
      });
    } catch (error) {
      const description = describeWorkspaceError(error, 'apply');
      feedback.replaceChildren(
        inlineAlert({
          tone: 'negative',
          message: description.message,
          details: description.details,
        })
      );
    } finally {
      busy = false;
      if (!disposed) {
        setBusy(primary, false, tool.primaryLabel);
        refresh();
      }
    }
  }
  sync();
  if (livePreview) schedulePreview();
  return {
    root,
    sync,
    setActive(value: boolean) {
      if (value === active) return;
      active = value;
      if (!value) void discardPreview();
      else schedulePreview();
    },
    sourceFiles: () => [...inputs],
    setFiles(files: File[]) {
      if (fileSource) {
        inputs = [...files];
        sync();
      }
    },
    dispose() {
      disposed = true;
      controller?.abort();
      clearTimeout(previewTimer);
      if (livePreview && host.isPreviewing(id)) void host.cancelPreview(id);
      root.remove();
    },
  };
}
