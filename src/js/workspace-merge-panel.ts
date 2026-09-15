import type { ToolHost } from './workspace-tools.js';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { MergeJob, MergeResponse } from './types/merge-worker-type.js';
import { WasmProvider } from './utils/wasm-provider.js';
import '../css/workspace-merge-panel.css';

export interface MergePage {
  source: string;
  index: number;
  selected: boolean;
}
/** Preserve contiguous runs so the existing CPDF merge engine retains document structure. */
export function mergePageJobs(pages: MergePage[]): MergeJob[] {
  const jobs: MergeJob[] = [];
  const selected = pages.filter((p) => p.selected);
  for (let i = 0; i < selected.length; i++) {
    const first = selected[i];
    let end = first.index;
    while (
      i + 1 < selected.length &&
      selected[i + 1].source === first.source &&
      selected[i + 1].index === end + 1
    )
      end = selected[++i].index;
    jobs.push(
      end === first.index
        ? {
            fileName: first.source,
            rangeType: 'single',
            pageIndex: first.index,
          }
        : {
            fileName: first.source,
            rangeType: 'range',
            startPage: first.index + 1,
            endPage: end + 1,
          }
    );
  }
  return jobs;
}
export function moveMergeItem<T>(
  items: T[],
  index: number,
  delta: number
): boolean {
  const to = index + delta;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length)
    return false;
  [items[index], items[to]] = [items[to], items[index]];
  return true;
}
interface Source {
  key: string;
  file: File;
  bytes: ArrayBuffer;
  pdf: PDFDocumentProxy;
}
export function createMergePanel(
  host: ToolHost,
  id: string,
  refresh: () => void
) {
  const root = document.createElement('div');
  root.className = 'native-merge-panel';
  const canvasRoot = document.createElement('section');
  canvasRoot.className = 'native-merge-canvas';
  canvasRoot.setAttribute('aria-label', 'Merge page order');
  const intro = document.createElement('p');
  intro.textContent =
    'Combine PDFs and images. Choose pages and arrange their output order.';
  const upload = document.createElement('input');
  upload.type = 'file';
  upload.multiple = true;
  upload.accept =
    '.pdf,.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp,application/pdf';
  upload.hidden = true;
  const button = (label: string, action: () => void, primary = false) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `button ${primary ? 'button-primary' : 'button-secondary'}`;
    b.textContent = label;
    b.onclick = action;
    return b;
  };
  const choose = () => {
    upload.value = '';
    upload.click();
  };
  const add = button('Add files', choose);
  const current = button('Use current PDF', () => void useCurrent());
  const clear = button('Clear files', () => {
    if (busy) return;
    for (const s of sources) void s.pdf.destroy();
    sources = [];
    pages = [];
    cache.clear();
    initialized = true;
    status.textContent = 'Files cleared. Add files to start again.';
    render();
  });
  const sourceList = document.createElement('div');
  sourceList.className = 'merge-source-list';
  const view = document.createElement('div');
  view.className = 'merge-view-toggle';
  const pagesView = button('Pages', () => {
    mode = 'pages';
    render();
  });
  const filesView = button('Files', () => {
    mode = 'files';
    render();
  });
  view.append(pagesView, filesView);
  const advanced = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Advanced options';
  const check = (text: string) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    label.append(input, document.createTextNode(text));
    advanced.append(label);
    return input;
  };
  advanced.append(summary);
  const labels = check('Retain page labels');
  const fonts = check('Remove duplicate fonts');
  const footer = document.createElement('div');
  footer.className = 'merge-action-footer';
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Output filename';
  const name = document.createElement('input');
  name.value = 'merged.pdf';
  nameLabel.append(name);
  const count = document.createElement('p');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const error = document.createElement('details');
  error.hidden = true;
  const errorTitle = document.createElement('summary');
  errorTitle.textContent = 'Technical details';
  const errorText = document.createElement('pre');
  error.append(errorTitle, errorText);
  const merge = button('Merge PDF', () => void run(), true);
  const cancel = button('Cancel merge', () => {
    worker?.terminate();
    worker = undefined;
    rejectWorker?.(new Error('cancelled'));
  });
  cancel.hidden = true;
  footer.append(nameLabel, count, merge, cancel, status, error);
  root.append(
    intro,
    add,
    current,
    clear,
    upload,
    sourceList,
    view,
    advanced,
    footer
  );
  let sources: Source[] = [],
    pages: MergePage[] = [],
    mode: 'pages' | 'files' = 'pages',
    busy = false,
    disposed = false,
    initialized = false,
    sequence = 0;
  let dragged: MergePage | undefined;
  let worker: Worker | undefined,
    rejectWorker: ((reason: Error) => void) | undefined;
  const observer =
    typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries)
              if (entry.isIntersecting) {
                observer!.unobserve(entry.target);
                void thumbnail(entry.target as HTMLCanvasElement);
              }
          },
          { rootMargin: '250px' }
        )
      : undefined;
  const cache = new Map<string, HTMLCanvasElement>();
  async function thumbnail(canvas: HTMLCanvasElement) {
    const key = canvas.dataset.source!,
      index = Number(canvas.dataset.page);
    const cacheKey = `${key}:${index}`;
    const saved = cache.get(cacheKey);
    if (saved) {
      canvas.width = saved.width;
      canvas.height = saved.height;
      canvas.getContext('2d')?.drawImage(saved, 0, 0);
      return;
    }
    try {
      const source = sources.find((s) => s.key === key);
      if (!source || disposed) return;
      const page = await source.pdf.getPage(index + 1);
      const viewport = page.getViewport({
        scale: 128 / page.getViewport({ scale: 1 }).width,
      });
      const output = document.createElement('canvas');
      output.width = viewport.width;
      output.height = viewport.height;
      await page.render({
        canvas: output,
        canvasContext: output.getContext('2d')!,
        viewport,
      }).promise;
      if (disposed || !sources.includes(source)) return;
      if (cache.size >= 60) cache.delete(cache.keys().next().value!);
      cache.set(cacheKey, output);
      canvas.width = output.width;
      canvas.height = output.height;
      canvas.getContext('2d')?.drawImage(output, 0, 0);
    } catch {
      canvas.setAttribute(
        'aria-label',
        'Thumbnail unavailable. Page remains available to merge.'
      );
    }
  }
  function failure(message: string, reason: unknown) {
    status.textContent = message;
    errorText.textContent =
      reason instanceof Error ? reason.message : String(reason);
    error.hidden = false;
  }
  function setBusy(value: boolean) {
    busy = value;
    root
      .querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button')
      .forEach((el) => (el.disabled = value));
    cancel.disabled = false;
    cancel.hidden = !value || !worker;
    canvasRoot
      .querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button')
      .forEach((el) => (el.disabled = value));
    if (!value) render();
  }
  async function addFiles(files: File[]) {
    if (busy || disposed) return;
    setBusy(true);
    error.hidden = true;
    status.textContent = 'Reading files…';
    let failed = 0;
    try {
      const pdfjs = await import('pdfjs-dist');
      await import('./utils/setup-pdf-worker.js');
      for (const file of files) {
        let pdf: PDFDocumentProxy | undefined;
        try {
          const isPdf =
            file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
          if (
            !isPdf &&
            !/\.(png|jpe?g|webp)$/i.test(file.name) &&
            !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
          )
            throw new Error('Choose a PDF, PNG, JPEG or WebP image.');
          const prepared = isPdf
            ? file
            : await (
                await import('./utils/images-to-pdf-lib.js')
              ).convertImagesToPdfFile([file]);
          const bytes = await prepared.arrayBuffer();
          pdf = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
          if (disposed) {
            await pdf.destroy();
            return;
          }
          const key = `source-${++sequence}.pdf`;
          sources.push({ key, file, bytes, pdf });
          for (let index = 0; index < pdf.numPages; index++)
            pages.push({ source: key, index, selected: true });
        } catch (reason) {
          failed++;
          failure(
            `Could not add ${file.name}. Choose another file or an unlocked PDF.`,
            reason
          );
        }
      }
      initialized = true;
      if (!failed)
        status.textContent = 'Files added. Arrange pages, then merge.';
    } catch (reason) {
      failure('Could not load the PDF reader. Try Add files again.', reason);
    } finally {
      setBusy(false);
      refresh();
    }
  }
  async function useCurrent() {
    if (busy || disposed || !host.hasPdf(id)) return;
    initialized = true;
    try {
      const file = await host.snapshot(id);
      await addFiles([file]);
    } catch (reason) {
      failure(
        'Could not read the current PDF. Try Use current PDF again.',
        reason
      );
    }
  }
  function reorderSource(key: string, delta: number) {
    const index = sources.findIndex((s) => s.key === key);
    if (moveMergeItem(sources, index, delta)) {
      pages = sources.flatMap((s) => pages.filter((p) => p.source === s.key));
      render();
    }
  }
  function render() {
    observer?.disconnect();
    sourceList.replaceChildren();
    canvasRoot.replaceChildren();
    current.hidden = !host.hasPdf(id);
    clear.hidden = !sources.length;
    pagesView.setAttribute('aria-pressed', String(mode === 'pages'));
    filesView.setAttribute('aria-pressed', String(mode === 'files'));
    count.textContent = `${pages.filter((p) => p.selected).length} of ${pages.length} pages · ${sources.length} files`;
    merge.disabled = busy || !pages.some((p) => p.selected);
    for (const source of sources) {
      const row = document.createElement('div');
      row.className = 'merge-source-row';
      const text = document.createElement('span');
      text.textContent = `${source.file.name} · ${source.pdf.numPages} pages`;
      text.title = source.file.name;
      const remove = button('Remove', () => {
        if (busy) return;
        sources = sources.filter((s) => s !== source);
        pages = pages.filter((p) => p.source !== source.key);
        void source.pdf.destroy();
        for (const key of cache.keys())
          if (key.startsWith(source.key + ':')) cache.delete(key);
        render();
      });
      remove.setAttribute('aria-label', `Remove ${source.file.name}`);
      row.append(text, remove);
      sourceList.append(row);
    }
    if (!sources.length) {
      const empty = document.createElement('div');
      empty.className = 'merge-empty';
      const hint = document.createElement('p');
      hint.textContent = 'Add PDFs or images to see and arrange their pages.';
      empty.append(hint, button('Choose files', choose, true));
      canvasRoot.append(empty);
      return;
    }
    if (mode === 'files') {
      for (const source of sources) {
        const row = document.createElement('div');
        row.className = 'merge-file-card';
        const title = document.createElement('h3');
        title.textContent = `${source.file.name} · ${source.pdf.numPages} pages`;
        row.append(title);
        for (const delta of [-1, 1]) {
          const b = button(delta < 0 ? 'Move earlier' : 'Move later', () => {
            reorderSource(source.key, delta);
            canvasRoot
              .querySelector<HTMLButtonElement>(
                `[data-focus^="${source.key}-"]:not(:disabled)`
              )
              ?.focus();
          });
          b.dataset.focus = `${source.key}-${delta}`;
          b.disabled =
            busy ||
            (delta < 0 ? sources[0] === source : sources.at(-1) === source);
          b.setAttribute('aria-label', `${b.textContent}: ${source.file.name}`);
          row.append(b);
        }
        canvasRoot.append(row);
      }
      return;
    }
    let previous = '';
    let grid: HTMLDivElement;
    for (const page of pages) {
      const source = sources.find((s) => s.key === page.source)!;
      if (previous !== page.source) {
        const group = document.createElement('section');
        const heading = document.createElement('h3');
        heading.textContent = source.file.name;
        grid = document.createElement('div');
        grid.className = 'merge-page-grid';
        group.append(heading, grid);
        canvasRoot.append(group);
        previous = page.source;
      }
      const card = document.createElement('div');
      card.className = 'merge-page-card';
      card.draggable = !busy;
      card.ondragstart = (event) => {
        dragged = page;
        event.dataTransfer?.setData(
          'text/plain',
          `${page.source}:${page.index}`
        );
      };
      card.ondragover = (event) => {
        if (dragged && !busy) event.preventDefault();
      };
      card.ondrop = (event) => {
        event.preventDefault();
        if (!dragged || dragged === page || busy) return;
        const from = pages.indexOf(dragged),
          to = pages.indexOf(page);
        pages.splice(from, 1);
        pages.splice(to, 0, dragged);
        dragged = undefined;
        render();
      };
      card.ondragend = () => {
        dragged = undefined;
      };
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 174;
      canvas.dataset.source = page.source;
      canvas.dataset.page = String(page.index);
      canvas.setAttribute(
        'aria-label',
        `${source.file.name}, page ${page.index + 1}`
      );
      const label = document.createElement('label');
      const selected = document.createElement('input');
      selected.type = 'checkbox';
      selected.checked = page.selected;
      selected.disabled = busy;
      selected.onchange = () => {
        page.selected = selected.checked;
        count.textContent = `${pages.filter((p) => p.selected).length} of ${pages.length} pages · ${sources.length} files`;
        merge.disabled = !pages.some((p) => p.selected);
      };
      label.append(selected, document.createTextNode(`Page ${page.index + 1}`));
      card.append(canvas, label);
      const actions = document.createElement('div');
      for (const delta of [-1, 1]) {
        const b = button(delta < 0 ? '←' : '→', () => {
          if (moveMergeItem(pages, pages.indexOf(page), delta)) {
            render();
            canvasRoot
              .querySelector<HTMLButtonElement>(
                `[data-focus^="${page.source}-${page.index}-"]:not(:disabled)`
              )
              ?.focus();
          }
        });
        b.dataset.focus = `${page.source}-${page.index}-${delta}`;
        b.setAttribute(
          'aria-label',
          `Move ${delta < 0 ? 'earlier' : 'later'}: ${source.file.name}, page ${page.index + 1}`
        );
        b.disabled =
          busy || (delta < 0 ? pages[0] === page : pages.at(-1) === page);
        actions.append(b);
      }
      card.append(actions);
      grid!.append(card);
      if (observer) observer.observe(canvas);
      else if (pages.indexOf(page) < 12) void thumbnail(canvas);
    }
  }
  async function run() {
    if (busy || !pages.some((p) => p.selected)) return;
    error.hidden = true;
    const base = WasmProvider.getUrl('cpdf');
    if (!base) {
      failure(
        'The merge engine is unavailable. Configure CoherentPDF in WASM Settings, then retry. Your files are still here.',
        new Error('CoherentPDF is not configured.')
      );
      return;
    }
    setBusy(true);
    status.textContent = 'Loading merge engine and combining pages…';
    try {
      const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        rejectWorker = reject;
        worker = new Worker(
          import.meta.env.BASE_URL + 'workers/merge.worker.js'
        );
        cancel.hidden = false;
        worker.onmessage = (event: MessageEvent<MergeResponse>) =>
          event.data.status === 'success'
            ? resolve(event.data.pdfBytes)
            : reject(new Error(event.data.message));
        worker.onerror = () =>
          reject(
            new Error('Merge worker failed to load or process the document.')
          );
        const jobs = mergePageJobs(pages);
        const used = new Set(jobs.map((j) => j.fileName));
        const files = sources
          .filter((s) => used.has(s.key))
          .map((s) => ({ name: s.key, data: s.bytes.slice(0) }));
        worker.postMessage(
          {
            command: 'merge',
            files,
            jobs,
            cpdfUrl: base + 'coherentpdf.browser.min.js',
            retainPageLabels: labels.checked,
            removeDuplicateFonts: fonts.checked,
          },
          files.map((f) => f.data)
        );
      });
      if (disposed) return;
      const filename = name.value.trim() || 'merged.pdf';
      await host.result(
        new File(
          [bytes],
          /\.pdf$/i.test(filename) ? filename : filename + '.pdf',
          { type: 'application/pdf' }
        )
      );
      status.textContent =
        'Merged PDF opened. Your source files remain available.';
    } catch (reason) {
      if (!disposed) {
        if (reason instanceof Error && reason.message === 'cancelled')
          status.textContent =
            'Merge cancelled. Your files and page order are ready to continue.';
        else
          failure(
            'Could not merge these pages. Retry, or remove an unreadable file. Your files and page order are still here.',
            reason
          );
      }
    } finally {
      worker?.terminate();
      worker = undefined;
      rejectWorker = undefined;
      setBusy(false);
    }
  }
  upload.onchange = () => void addFiles(Array.from(upload.files ?? []));
  let panelActive = true;
  function sync() {
    current.hidden = !host.hasPdf(id);
    if (panelActive && !initialized && host.hasPdf(id) && !busy)
      void useCurrent();
  }
  render();
  sync();
  return {
    root,
    canvasRoot,
    sync,
    setActive(active: boolean) {
      panelActive = active;
      if (!active && worker) {
        worker.terminate();
        worker = undefined;
        rejectWorker?.(new Error('cancelled'));
      }
    },
    sourceFiles: () => sources.map((s) => s.file),
    addFiles,
    dispose() {
      disposed = true;
      worker?.terminate();
      rejectWorker?.(new Error('cancelled'));
      observer?.disconnect();
      for (const s of sources) void s.pdf.destroy();
      cache.clear();
      root.remove();
      canvasRoot.remove();
    },
  };
}
