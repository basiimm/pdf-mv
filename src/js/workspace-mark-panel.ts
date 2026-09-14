import type { ToolHost } from './workspace-tools.js';
import { applyPageMarks, type PageMarks } from './workspace-page-marks.js';
import { renderWorkspaceError } from './workspace-errors.js';
import '../css/workspace-mark-preview.css';

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
  const advanced = document.createElement('details');
  const advancedTitle = document.createElement('summary');
  advancedTitle.textContent = 'Appearance';
  advanced.append(advancedTitle);
  let fieldTarget: HTMLElement = form;
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
    fieldTarget.append(label);
    inputs.set(name, input);
    return input;
  }
  if (kind === 'add-watermark') {
    field('text', 'Watermark text', 'CONFIDENTIAL');
    fieldTarget = advanced;
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
    fieldTarget.append(label);
    inputs.set('align', select);
  }
  fieldTarget = advanced;
  field(
    'size',
    'Font size (pt)',
    kind === 'add-watermark' ? '48' : '10',
    'number',
    '6',
    '144'
  );
  field('color', 'Text color', '#555555', 'color');
  form.append(advanced);
  fieldTarget = form;
  field('pages', 'Page scope', '').placeholder = 'All pages · or enter 1, 3-5';
  const scopeHint = document.createElement('p');
  scopeHint.textContent = 'Leave blank to use all pages.';
  form.append(scopeHint);
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const preview = document.createElement('canvas');
  preview.hidden = true;
  preview.setAttribute('aria-label', 'PDF preview with changes');
  const canvasRoot = document.createElement('div');
  canvasRoot.className = 'mark-central-preview';
  canvasRoot.hidden = true;
  const previewBar = document.createElement('div');
  previewBar.className = 'mark-preview-bar';
  const previewLabel = document.createElement('span');
  previewLabel.textContent = 'Temporary preview';
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'button button-secondary';
  previous.textContent = 'Previous page';
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'button button-secondary';
  next.textContent = 'Next page';
  const pageLabel = document.createElement('span');
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'button button-secondary';
  cancel.textContent = 'Back to original';
  previewBar.append(previewLabel, previous, pageLabel, next, cancel);
  canvasRoot.append(previewBar, preview);
  const show = document.createElement('button');
  show.type = 'submit';
  show.className = 'button button-secondary';
  show.textContent = 'Preview changes';
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.className = 'button button-primary';
  apply.textContent = 'Create edited copy';
  const note = document.createElement('p');
  note.textContent =
    'An edited copy opens in a new app tab. Your original stays available.';
  const actions = document.createElement('div');
  actions.className = 'mark-sticky-actions';
  const stop = document.createElement('button');
  stop.type = 'button';
  stop.className = 'button button-secondary';
  stop.textContent = 'Cancel preview';
  stop.hidden = true;
  actions.append(show, stop, apply, note);
  form.append(actions);
  root.append(intro, open, upload, form, status);
  let disposed = false,
    busy = false,
    active = true,
    generation = 0;
  let previewActive = false,
    previewNumber = 1;
  let loadingTask: import('pdfjs-dist').PDFDocumentLoadingTask | undefined;
  let previewPdf: import('pdfjs-dist').PDFDocumentProxy | undefined;
  let renderTask: import('pdfjs-dist').RenderTask | undefined;
  let pageGeneration = 0;
  const clearPreview = () => {
    generation++;
    pageGeneration++;
    previewActive = false;
    canvasRoot.hidden = true;
    preview.hidden = true;
    renderTask?.cancel();
    renderTask = undefined;
    const task = loadingTask;
    loadingTask = undefined;
    previewPdf = undefined;
    if (task) void task.destroy().catch(() => {});
    stop.hidden = true;
    if (!disposed) refresh();
  };
  cancel.onclick = () => {
    clearPreview();
    status.textContent =
      'Original document restored. Your settings are retained.';
  };
  stop.onclick = () => cancel.click();
  const handleEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && (previewActive || busy)) {
      event.preventDefault();
      cancel.click();
      show.focus();
    }
  };
  root.onkeydown = handleEscape;
  canvasRoot.onkeydown = handleEscape;
  const renderPage = async (number: number) => {
    const pdf = previewPdf;
    if (!pdf || number < 1 || number > pdf.numPages) return;
    const token = ++pageGeneration;
    renderTask?.cancel();
    const page = await pdf.getPage(number);
    if (disposed || token !== pageGeneration || pdf !== previewPdf) return;
    const viewport = page.getViewport({
      scale: 1000 / page.getViewport({ scale: 1 }).width,
    });
    const output = document.createElement('canvas');
    output.width = viewport.width;
    output.height = viewport.height;
    const task = page.render({
      canvas: output,
      canvasContext: output.getContext('2d')!,
      viewport,
    });
    renderTask = task;
    await task.promise;
    if (disposed || token !== pageGeneration || pdf !== previewPdf) return;
    preview.width = output.width;
    preview.height = output.height;
    preview.getContext('2d')!.drawImage(output, 0, 0);
    preview.hidden = false;
    previewNumber = number;
    previous.disabled = number <= 1;
    next.disabled = number >= pdf.numPages;
    pageLabel.textContent = `Page ${number} of ${pdf.numPages}`;
  };
  const navigate = (delta: number) => {
    void renderPage(previewNumber + delta).catch((error) => {
      if (
        !disposed &&
        previewActive &&
        !(
          error instanceof Error && error.name === 'RenderingCancelledException'
        )
      )
        renderWorkspaceError(status, error, 'preview', () => void run(true));
    });
  };
  previous.onclick = () => navigate(-1);
  next.onclick = () => navigate(1);
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
    clearPreview();
    const token = generation;
    const marks = options();
    busy = true;
    stop.hidden = !isPreview;
    show.disabled = apply.disabled = true;
    status.textContent = isPreview
      ? 'Preparing preview…'
      : 'Creating edited copy…';
    try {
      const file = await host.snapshot(id);
      const bytes = await applyPageMarks(await file.arrayBuffer(), marks);
      if (disposed || token !== generation) return;
      if (isPreview) {
        const pdfjs = await import('pdfjs-dist');
        await import('./utils/setup-pdf-worker.js');
        if (disposed || token !== generation) return;
        const task = pdfjs.getDocument({ data: bytes });
        loadingTask = task;
        previewPdf = await task.promise;
        if (disposed || token !== generation) return;
        await renderPage(1);
        if (disposed || token !== generation) return;
        previewActive = true;
        stop.hidden = false;
        canvasRoot.hidden = !active;
        status.textContent =
          'Temporary preview shown in the document area. Create an edited copy when ready.';
        refresh();
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
        if (!disposed) status.textContent = 'Edited copy opened.';
      }
    } catch (error) {
      if (!disposed && token === generation) {
        clearPreview();
        renderWorkspaceError(
          status,
          error,
          isPreview ? 'preview' : 'apply',
          (action) => {
            if (action === 'choose-file') open.click();
            else if (action === 'fix-settings') inputs.get('pages')?.focus();
            else void run(isPreview);
          }
        );
      }
    } finally {
      busy = false;
      show.disabled = apply.disabled = false;
    }
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    void run(true);
  };
  apply.onclick = () => void run(false);
  form.oninput = () => {
    clearPreview();
    status.textContent = 'Settings changed. Preview to check the result.';
  };
  upload.onchange = async () => {
    const file = upload.files?.[0];
    if (!file) return;
    clearPreview();
    open.disabled = true;
    try {
      await host.attach(id, file);
      refresh();
    } catch (error) {
      renderWorkspaceError(status, error, 'open', () => open.click());
    } finally {
      open.disabled = false;
      sync();
    }
  };
  sync();
  return {
    root,
    canvasRoot,
    sync,
    setActive(value: boolean) {
      const wasActive = active;
      active = value;
      if (!value && wasActive) clearPreview();
      canvasRoot.hidden = !value || !previewActive;
    },
    isPreviewActive: () => active && previewActive,
    dispose() {
      disposed = true;
      clearPreview();
      root.remove();
      canvasRoot.remove();
    },
  };
}
