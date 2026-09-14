import {
  button,
  dropZone,
  el,
  emptyState,
  inlineAlert,
  panelSkeleton,
  progress as progressBar,
  segmented,
  setBusy,
  textField,
  toast,
} from '../../design-system/ui/index.js';
import '../../design-system/page-grid.css';
import { describeWorkspaceError } from '../workspace-errors.js';
import type { ToolHost } from '../workspace-tools.js';
import {
  createPageGrid,
  type PageGrid,
  type PageGridOptions,
} from './page-grid.js';
import {
  applyPagePlan,
  splitEvery,
  splitPlan,
  type PagePlanItem,
} from './page-plan.js';

export type OrganizeMode = 'organize' | 'split';
type SplitStrategy = 'markers' | 'every' | 'selected';

export interface OrganizePanelOptions {
  /** Test hook: forwarded to the page grid instead of pdf.js. */
  loadDocument?: PageGridOptions['loadDocument'];
  /** Parts at or below this count open as tabs; above it they download as a ZIP. */
  maxTabs?: number;
}

const copy = {
  organize: {
    description:
      'Drag pages to reorder them. Select pages to rotate, duplicate or delete them.',
    primary: 'Apply changes',
    done: 'Pages reorganized',
    note: 'Changes apply to this document. You can undo.',
  },
  split: {
    description:
      'Choose where to split. Each part becomes its own PDF; your original stays open.',
    primary: 'Split PDF',
    done: 'PDF split',
    note: 'Up to 5 parts open in new tabs. More download as a ZIP.',
  },
};

const splitHelp: Record<SplitStrategy, string> = {
  markers: 'Select a page, then choose Split after in the page toolbar.',
  every:
    'Every part has the same number of pages; the last part may be shorter.',
  selected: 'Each selected page becomes its own PDF.',
};

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = el('a', { attrs: { href: url, download: file.name } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

const pdfFile = (bytes: Uint8Array, name: string) =>
  new File([bytes as BlobPart], name, { type: 'application/pdf' });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Organize or split the open PDF in a page grid shown in the document area.
 * Returns a NativePanel: `root` goes in the tool panel, `canvasRoot` replaces the viewer.
 */
export function createOrganizePanel(
  host: ToolHost,
  id: string,
  mode: OrganizeMode,
  refresh: () => void,
  panelOptions: OrganizePanelOptions = {}
) {
  const text = copy[mode];
  const maxTabs = panelOptions.maxTabs ?? 5;

  // ---------- Panel ----------
  const root = el('div', {
    className: 'ds-tool-panel',
    dataset: { tool: mode === 'split' ? 'split-pdf' : 'organize-pdf' },
  });
  const body = el('div', { className: 'ds-tool-panel__body' });
  const footer = el('div', { className: 'ds-tool-panel__footer' });
  root.append(body, footer);
  const summary = el('p', {
    className: 'ds-tool-panel__description',
    attrs: { 'data-summary': '' },
  });
  const feedback = el('div', { attrs: { 'aria-live': 'polite' } });
  body.append(
    el('p', {
      className: 'ds-tool-panel__description',
      text: text.description,
    }),
    summary
  );

  let strategy: SplitStrategy = 'markers';
  const everyField = textField({
    label: 'Pages per part',
    type: 'number',
    value: '2',
    min: '1',
    step: '1',
  });
  const strategyHelp = el('p', {
    className: 'ds-tool-panel__note',
    text: splitHelp.markers,
  });
  const strategyControl = segmented({
    label: 'Split into',
    options: [
      ['markers', 'At markers'],
      ['every', 'Every N pages'],
      ['selected', 'Selected pages'],
    ],
    value: strategy,
    block: true,
    onChange(value) {
      strategy = value as SplitStrategy;
      update();
    },
  });
  if (mode === 'split') {
    body.append(
      el('div', { className: 'ds-field' }, [
        el('span', { className: 'ds-field__label', text: 'Split into' }),
        strategyControl.root,
        strategyHelp,
      ]),
      everyField.root
    );
    everyField.control.addEventListener('input', update);
  }
  body.append(feedback);

  const primary = button({
    label: text.primary,
    variant: 'accent',
    size: 'l',
    block: true,
    onClick: () => void (mode === 'split' ? split() : apply()),
  });
  const extract = button({
    label: 'Extract selected pages',
    block: true,
    onClick: () => void extractSelected(),
  });
  const reset = button({
    label: 'Reset',
    variant: 'quiet',
    size: 's',
    onClick: () => grid?.reset(),
  });
  const note = el('p', { className: 'ds-tool-panel__note', text: text.note });
  footer.append(
    primary,
    ...(mode === 'organize' ? [extract] : []),
    el('div', { className: 'ds-tool-panel__footer-row' }, [note, reset])
  );

  // ---------- Canvas ----------
  const canvasRoot = el('section', {
    className: 'ds-page-organizer-host',
    attrs: {
      'aria-label': mode === 'split' ? 'Split pages' : 'Organize pages',
    },
  });

  let grid: PageGrid | null = null;
  let source: { file: File; bytes: ArrayBuffer } | null = null;
  let loadedRevision = -1;
  let loading = false;
  let loadToken = 0;
  let busy = false;
  let active = true;
  let disposed = false;
  let controller: AbortController | null = null;

  function every() {
    const n = Math.floor(Number(everyField.control.value));
    return Number.isFinite(n) && n >= 1 ? n : 0;
  }

  /** Output groups for the current split strategy. */
  function parts(): PagePlanItem[][] {
    if (!grid) return [];
    const plan = grid.getPlan();
    if (strategy === 'every')
      return splitPlan(plan, splitEvery(plan.length, every()));
    if (strategy === 'selected')
      return grid.getSelection().map((i) => [plan[i]]);
    return splitPlan(plan, grid.getSplitAfter());
  }

  function update() {
    if (disposed) return;
    if (!busy) setBusy(primary, false, text.primary);
    everyField.root.hidden = mode !== 'split' || strategy !== 'every';
    strategyHelp.textContent = splitHelp[strategy];
    if (grid && mode === 'split')
      grid.setMarkerPreview(
        strategy === 'every' ? splitEvery(grid.pageCount(), every()) : null
      );
    const ready = !!grid && !loading && host.hasPdf(id);
    const pages = grid?.pageCount() ?? 0;
    const chosen = grid?.getSelection().length ?? 0;
    const bits = ready ? [plural(pages, 'page'), `${chosen} selected`] : [];
    if (ready && mode === 'organize') {
      const changes = grid!.changeCount();
      bits.push(changes ? plural(changes, 'change') : 'No changes');
      primary.disabled = busy || !changes;
      extract.disabled = busy || !chosen;
      reset.disabled = busy || !changes;
    } else if (ready) {
      const count = parts().length;
      bits.push(plural(count, 'part'));
      primary.disabled = busy || count < 2;
      reset.disabled = busy || !grid!.changeCount();
    } else {
      primary.disabled = true;
      extract.disabled = true;
      reset.disabled = true;
    }
    summary.textContent = ready
      ? bits.join(' · ')
      : host.hasPdf(id)
        ? 'Loading pages…'
        : 'Open a PDF to see its pages.';
    summary.hidden = !summary.textContent;
  }

  function showEmpty() {
    const picker = dropZone({
      accept: '.pdf,application/pdf',
      title: 'Choose a PDF',
      hint: 'Files stay on this device',
      onFiles: (files) =>
        void host
          .attach(id, files[0])
          .then(() => refresh())
          .catch((error) => showLoadError(error)),
    });
    const empty = emptyState({
      title:
        mode === 'split' ? 'Open a PDF to split' : 'Open a PDF to organize',
      message: 'Its pages appear here, ready to arrange.',
    });
    empty.append(picker.root);
    canvasRoot.replaceChildren(empty);
  }

  function showLoadError(error: unknown) {
    const description = describeWorkspaceError(error, 'open');
    canvasRoot.replaceChildren(
      el('div', { className: 'ds-page-organizer-host__message' }, [
        inlineAlert({
          tone: 'negative',
          title: 'Pages could not be shown',
          message: description.message,
          details: description.details,
          actions: [{ label: 'Try again', onClick: () => void load(true) }],
        }),
      ])
    );
  }

  async function load(force = false) {
    if (disposed || busy) return;
    if (!host.hasPdf(id)) {
      grid?.destroy();
      grid = null;
      source = null;
      loadedRevision = -1;
      if (!canvasRoot.querySelector('.ds-empty')) showEmpty();
      update();
      return;
    }
    const revision = host.revision(id);
    if (!force && (loading || (grid && revision === loadedRevision))) return;
    const token = ++loadToken;
    loading = true;
    grid?.destroy();
    grid = null;
    canvasRoot.replaceChildren(panelSkeleton('Loading pages'));
    update();
    try {
      const file = await host.snapshot(id);
      const bytes = await file.arrayBuffer();
      if (token !== loadToken || disposed) return;
      const next = createPageGrid({
        sources: [{ name: file.name, bytes }],
        mode,
        label: mode === 'split' ? 'Pages to split' : 'Pages to organize',
        loadDocument: panelOptions.loadDocument,
      });
      await next.ready;
      if (token !== loadToken || disposed) {
        next.destroy();
        return;
      }
      grid = next;
      source = { file, bytes };
      loadedRevision = revision;
      grid.onChange(update);
      canvasRoot.replaceChildren(grid.root);
    } catch (error) {
      if (token !== loadToken || disposed) return;
      showLoadError(error);
    } finally {
      if (token === loadToken) {
        loading = false;
        update();
      }
    }
  }

  function showError(error: unknown, retry: () => void) {
    const description = describeWorkspaceError(error, 'apply');
    feedback.replaceChildren(
      inlineAlert({
        tone: 'negative',
        message: description.message,
        details: description.details,
        actions: [{ label: description.actionLabel, onClick: retry }],
      })
    );
  }

  async function run(
    label: string,
    work: (signal: AbortSignal) => Promise<void>
  ) {
    if (busy || !grid || !source) return;
    busy = true;
    controller = new AbortController();
    const signal = controller.signal;
    setBusy(primary, true, label);
    grid.setDisabled(true);
    feedback.replaceChildren();
    try {
      await work(signal);
    } finally {
      busy = false;
      controller = null;
      if (!disposed) {
        grid?.setDisabled(false);
        setBusy(primary, false, text.primary);
        update();
        refresh();
      }
    }
  }

  const baseName = () =>
    (source?.file.name ?? 'document.pdf').replace(/\.pdf$/i, '');

  async function apply() {
    await run('Applying…', async () => {
      try {
        const bytes = await applyPagePlan([source!.bytes], grid!.getPlan());
        if (disposed) return;
        await host.commit(id, pdfFile(bytes, source!.file.name), text.done);
        toast(text.done, {
          action: {
            label: 'Undo',
            onClick: () =>
              void host
                .undoCommit(id)
                .then((label) => label && toast(`Undid: ${label}`))
                .finally(() => void load()),
          },
        });
      } catch (error) {
        if (!disposed) showError(error, () => void apply());
        return;
      }
      busy = false;
      if (!disposed) await load(true);
    });
  }

  async function extractSelected() {
    await run('Extracting…', async () => {
      try {
        const plan = grid!.getPlan();
        const chosen = grid!.getSelection().map((i) => plan[i]);
        if (!chosen.length) return;
        const bytes = await applyPagePlan([source!.bytes], chosen);
        if (disposed) return;
        await host.result(pdfFile(bytes, `${baseName()}-pages.pdf`));
        feedback.replaceChildren(
          inlineAlert({
            tone: 'positive',
            message: `${plural(chosen.length, 'page')} extracted. The new PDF opened in a new tab.`,
          })
        );
      } catch (error) {
        if (!disposed) showError(error, () => void extractSelected());
      }
    });
  }

  async function split() {
    const groups = parts();
    if (groups.length < 2) return;
    await run('Splitting…', async (signal) => {
      const bar = progressBar({
        label: 'Creating parts…',
        value: 0,
        detail: `0 of ${groups.length}`,
        onCancel: () => controller?.abort(),
      });
      feedback.replaceChildren(bar.root);
      try {
        const files: File[] = [];
        const width = String(groups.length).length;
        for (const [index, group] of groups.entries()) {
          if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
          const bytes = await applyPagePlan([source!.bytes], group);
          files.push(
            pdfFile(
              bytes,
              `${baseName()}-part-${String(index + 1).padStart(width, '0')}.pdf`
            )
          );
          bar.update({
            value: (index + 1) / groups.length,
            detail: `${index + 1} of ${groups.length}`,
          });
        }
        if (signal.aborted || disposed)
          throw new DOMException('Cancelled', 'AbortError');
        if (files.length <= maxTabs) {
          bar.update({ label: 'Opening parts…' });
          for (const file of files) await host.result(file);
          feedback.replaceChildren(
            inlineAlert({
              tone: 'positive',
              message: `PDF split into ${plural(files.length, 'part')}. Each part opened in a new tab.`,
            })
          );
        } else {
          bar.update({ label: 'Creating ZIP…', detail: '' });
          const { default: JSZip } = await import('jszip');
          const zip = new JSZip();
          for (const file of files) zip.file(file.name, file);
          const blob = await zip.generateAsync({ type: 'blob' });
          const archive = new File([blob], `${baseName()}-split.zip`, {
            type: 'application/zip',
          });
          download(archive);
          feedback.replaceChildren(
            inlineAlert({
              tone: 'positive',
              message: `PDF split into ${files.length} parts. The ZIP is downloading.`,
              actions: [
                {
                  label: 'Download again',
                  variant: 'quiet',
                  onClick: () => download(archive),
                },
              ],
            })
          );
        }
      } catch (error) {
        if (disposed) return;
        if (signal.aborted)
          feedback.replaceChildren(
            inlineAlert({
              message:
                'Split cancelled. Your document and markers are unchanged.',
            })
          );
        else showError(error, () => void split());
      }
    });
  }

  function sync() {
    if (disposed) return;
    if (active && !busy) void load();
    update();
  }

  update();
  return {
    root,
    canvasRoot,
    sync,
    setActive(value: boolean) {
      active = value;
      if (value) void load();
    },
    /** Exposed for tests and routing diagnostics. */
    grid: () => grid,
    dispose() {
      disposed = true;
      controller?.abort();
      grid?.destroy();
      grid = null;
      root.remove();
      canvasRoot.remove();
    },
  };
}
