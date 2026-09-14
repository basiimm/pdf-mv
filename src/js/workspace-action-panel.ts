import { renderWorkspaceError } from './workspace-errors.js';
import type { ToolHost } from './workspace-tools.js';
import {
  nativeActions,
  runNativeAction,
  imagesToPdf,
} from './workspace-actions.js';
export function createActionPanel(
  host: ToolHost,
  id: string,
  action: string,
  refresh: () => void
) {
  const config = nativeActions[action],
    root = document.createElement('div');
  root.className = 'native-mark-panel';
  const intro = document.createElement('p');
  intro.textContent = config.description;
  const upload = document.createElement('input');
  upload.type = 'file';
  upload.accept = config.accept ?? 'application/pdf,.pdf';
  upload.hidden = true;
  upload.multiple = !!config.accept;
  const open = document.createElement('button');
  open.className = 'button button-secondary';
  open.textContent = config.accept ? 'Choose image' : 'Open PDF';
  open.onclick = () => {
    upload.value = '';
    upload.click();
  };
  const form = document.createElement('form'),
    fields = new Map<string, HTMLInputElement | HTMLSelectElement>();
  for (const field of config.fields) {
    const label = document.createElement('label');
    label.textContent = field.label;
    const input = field.options
      ? document.createElement('select')
      : document.createElement('input');
    if (input instanceof HTMLSelectElement)
      for (const [value, name] of field.options!)
        input.add(new Option(name, value));
    else {
      input.type = field.type ?? 'text';
      if (field.min) input.min = field.min;
      if (field.max) input.max = field.max;
      if (field.key === 'pages') input.placeholder = 'e.g. 1, 3-5';
    }
    input.value = field.value;
    fields.set(field.key, input);
    label.append(input);
    form.append(label);
  }
  const source = document.createElement('div'),
    status = document.createElement('p');
  status.setAttribute('role', 'status');
  const apply = document.createElement('button');
  apply.type = 'submit';
  apply.className = 'button button-primary';
  apply.textContent =
    config.button ?? (config.accept ? 'Create PDF' : 'Apply to a copy');
  const note = document.createElement('p');
  note.textContent = config.button
    ? 'Your file is converted on this device.'
    : 'The result opens in a new app tab. Your original stays available.';
  form.append(apply, note);
  root.append(intro, open, upload, source, form, status);
  const imageUrls = new Map<File, string>();
  let images: File[] = [],
    busy = false,
    disposed = false;
  function sync() {
    const ready = config.accept ? images.length > 0 : host.hasPdf(id);
    form.hidden = !ready;
    open.hidden = !config.accept && ready;
    open.textContent = config.accept
      ? images.length
        ? 'Add images'
        : 'Choose images'
      : 'Open PDF';
    source.replaceChildren();
    for (const [file, url] of imageUrls)
      if (!images.includes(file)) {
        URL.revokeObjectURL(url);
        imageUrls.delete(file);
      }
    images.forEach((image, index) => {
      const row = document.createElement('div');
      row.className = 'native-source-row';
      if (!imageUrls.has(image))
        imageUrls.set(image, URL.createObjectURL(image));
      const thumbnail = document.createElement('img');
      thumbnail.src = imageUrls.get(image)!;
      thumbnail.alt = '';
      row.append(thumbnail);
      const name = document.createElement('span');
      name.textContent = `${index + 1}. ${image.name}`;
      row.append(name);
      for (const [label, offset] of [
        ['Move up', -1],
        ['Move down', 1],
        ['Remove', 0],
      ] as const) {
        const button = document.createElement('button');
        button.textContent = offset === -1 ? '↑' : offset === 1 ? '↓' : '×';
        button.setAttribute('aria-label', `${label} ${image.name}`);
        button.disabled =
          busy ||
          (offset !== 0 &&
            (index + offset < 0 || index + offset >= images.length));
        button.onclick = () => {
          if (offset === 0) images.splice(index, 1);
          else
            [images[index], images[index + offset]] = [
              images[index + offset],
              images[index],
            ];
          sync();
        };
        row.append(button);
      }
      source.append(row);
    });
  }
  upload.onchange = async () => {
    const file = upload.files?.[0];
    if (!file) return;
    open.disabled = true;
    try {
      if (config.accept) images.push(...Array.from(upload.files!));
      else await host.attach(id, file);
      refresh();
    } catch (error) {
      if (!disposed)
        renderWorkspaceError(status, error, 'open', () => open.click());
    } finally {
      open.disabled = false;
      sync();
    }
  };
  async function run() {
    if (busy || !form.reportValidity()) return;
    busy = true;
    apply.disabled = open.disabled = true;
    for (const field of fields.values()) field.disabled = true;
    status.textContent = 'Processing…';
    try {
      sync();
      const result = config.accept
        ? await imagesToPdf([...images], action)
        : await runNativeAction(
            await host.snapshot(id),
            action,
            Object.fromEntries(
              [...fields].map(([key, field]) => [key, field.value])
            )
          );
      if (!disposed) {
        await host.result(result);
        status.textContent =
          result.type === 'application/pdf'
            ? 'Edited copy opened.'
            : 'Download ready.';
      }
    } catch (error) {
      if (!disposed)
        renderWorkspaceError(status, error, 'apply', (recovery) => {
          if (recovery === 'choose-file') open.click();
          else if (recovery === 'fix-settings')
            (fields.get('pages') ?? fields.values().next().value)?.focus();
          else void run();
        });
    } finally {
      busy = false;
      apply.disabled = open.disabled = false;
      for (const field of fields.values()) field.disabled = false;
      sync();
    }
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    void run();
  };
  sync();
  return {
    root,
    sync,
    sourceFiles: () => [...images],
    setFiles(files: File[]) {
      if (config.accept) {
        images = [...files];
        sync();
      }
    },
    dispose() {
      disposed = true;
      images = [];
      for (const url of imageUrls.values()) URL.revokeObjectURL(url);
      imageUrls.clear();
      root.remove();
    },
  };
}
