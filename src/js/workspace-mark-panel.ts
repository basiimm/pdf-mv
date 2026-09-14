import type { ToolHost } from './workspace-tools.js';
import { applyPageMarks, type PageMarks } from './workspace-page-marks.js';

export function createMarkPanel(
  host: ToolHost,
  id: string,
  kind: PageMarks['kind'],
  refresh: () => void
) {
  const root = document.createElement('div');
  root.className = 'native-mark-panel';
  const intro = document.createElement('p');
  intro.textContent =
    kind === 'add-watermark'
      ? 'Add a text watermark to your document.'
      : 'Add text and page numbers in the page margins.';
  const upload = document.createElement('input');
  upload.type = 'file';
  upload.accept = '.pdf,application/pdf';
  upload.hidden = true;
  const open = document.createElement('button');
  open.className = 'button button-primary';
  open.textContent = 'Open PDF';
  open.onclick = () => {
    upload.value = '';
    upload.click();
  };
  const form = document.createElement('form');
  const inputs = new Map<string, HTMLInputElement | HTMLSelectElement>();
  function field(
    name: string,
    labelText: string,
    value: string,
    type = 'text',
    min?: string,
    max?: string
  ) {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = type;
    input.value = value;
    if (min) input.min = min;
    if (max) input.max = max;
    label.append(input);
    form.append(label);
    inputs.set(name, input);
    return input;
  }
  if (kind === 'add-watermark') {
    field('text', 'Watermark text', 'CONFIDENTIAL');
    field('opacity', 'Opacity (%)', '25', 'number', '1', '100');
    field('angle', 'Angle (degrees)', '45', 'number', '-180', '180');
  } else {
    field('header', 'Header', '');
    field('footer', 'Footer', 'Page {page} of {total}');
    const hint = document.createElement('p');
    hint.textContent =
      'Use {page} for the page number and {total} for the page count.';
    form.append(hint);
    const label = document.createElement('label');
    label.textContent = 'Alignment';
    const select = document.createElement('select');
    for (const value of ['left', 'center', 'right']) {
      const option = new Option(value[0].toUpperCase() + value.slice(1), value);
      select.add(option);
    }
    select.value = 'center';
    label.append(select);
    form.append(label);
    inputs.set('align', select);
  }
  field(
    'size',
    'Font size (pt)',
    kind === 'add-watermark' ? '48' : '10',
    'number',
    '6',
    '144'
  );
  field('color', 'Text color', '#555555', 'color');
  field('pages', 'Pages (blank means all)', '').placeholder = 'e.g. 1, 3-5';
  const previewPage = field('previewPage', 'Preview page', '1', 'number', '1');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const preview = document.createElement('canvas');
  preview.hidden = true;
  preview.setAttribute('aria-label', 'PDF preview with changes');
  const show = document.createElement('button');
  show.type = 'submit';
  show.className = 'button button-secondary';
  show.textContent = 'Preview changes';
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.className = 'button button-primary';
  apply.textContent = 'Apply to a copy';
  const note = document.createElement('p');
  note.textContent =
    'An edited copy opens in a new app tab. Your original stays available.';
  form.append(show, status, preview, apply, note);
  root.append(intro, open, upload, form);
  let disposed = false,
    busy = false;
  const sync = () => {
    open.hidden = host.hasPdf(id);
    form.hidden = !host.hasPdf(id);
  };
  const value = (key: string, fallback = '') =>
    inputs.get(key)?.value ?? fallback;
  const options = (): PageMarks => ({
    kind,
    text: value('text'),
    header: value('header'),
    footer: value('footer'),
    size: Number(value('size')),
    opacity: Number(value('opacity', '100')),
    angle: Number(value('angle', '0')),
    color: value('color'),
    pages: value('pages'),
    align: value('align', 'center') as PageMarks['align'],
  });
  async function run(isPreview: boolean) {
    if (busy || !form.reportValidity()) return;
    busy = true;
    for (const input of inputs.values()) input.disabled = true;
    show.disabled = apply.disabled = true;
    status.textContent = isPreview ? 'Preparing preview…' : 'Applying changes…';
    preview.hidden = true;
    try {
      const file = await host.snapshot(id);
      const bytes = await applyPageMarks(await file.arrayBuffer(), options());
      if (disposed) return;
      if (isPreview) {
        const pdfjs = await import('pdfjs-dist');
        await import('./utils/setup-pdf-worker.js');
        const task = pdfjs.getDocument({ data: bytes });
        try {
          const pdf = await task.promise;
          const n = Number(previewPage.value);
          if (!Number.isInteger(n) || n < 1 || n > pdf.numPages)
            throw new Error(
              `Preview page must be between 1 and ${pdf.numPages}.`
            );
          const page = await pdf.getPage(n);
          const viewport = page.getViewport({
            scale: 560 / page.getViewport({ scale: 1 }).width,
          });
          const output = document.createElement('canvas');
          output.width = viewport.width;
          output.height = viewport.height;
          await page.render({
            canvas: output,
            canvasContext: output.getContext('2d')!,
            viewport,
          }).promise;
          if (!disposed) {
            preview.width = output.width;
            preview.height = output.height;
            preview.getContext('2d')!.drawImage(output, 0, 0);
            preview.hidden = false;
            status.textContent = `Preview · Page ${n} of ${pdf.numPages}`;
          }
        } finally {
          await task.destroy();
        }
      } else {
        await host.result(
          new File(
            [bytes],
            file.name.replace(/\.pdf$/i, '') +
              (kind === 'add-watermark'
                ? ' - watermarked.pdf'
                : ' - header-footer.pdf'),
            { type: 'application/pdf' }
          )
        );
        status.textContent = 'Edited copy opened.';
      }
    } catch (error) {
      if (!disposed)
        status.textContent =
          error instanceof Error ? error.message : 'Could not update this PDF.';
    } finally {
      busy = false;
      for (const input of inputs.values()) input.disabled = false;
      show.disabled = apply.disabled = false;
    }
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    void run(true);
  };
  apply.onclick = () => void run(false);
  form.oninput = () => {
    preview.hidden = true;
    status.textContent = 'Settings changed. Preview to check the result.';
  };
  upload.onchange = async () => {
    const file = upload.files?.[0];
    if (!file) return;
    open.disabled = true;
    try {
      await host.attach(id, file);
      refresh();
    } catch {
      host.status('Could not open this PDF.');
    } finally {
      open.disabled = false;
      sync();
    }
  };
  sync();
  return {
    root,
    sync,
    dispose() {
      disposed = true;
      root.remove();
    },
  };
}
