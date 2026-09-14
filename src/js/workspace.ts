import {
  preferredTools,
  toolVisuals,
  inferToolIcon,
} from './config/workspace-tool-visuals.js';
import { createToolCard } from './workspace-tool-card.js';
import { setupWorkspaceTools } from './workspace-tools.js';
import { viewerTheme } from './studio-theme.js';
import { createIcons, icons } from 'lucide';
import {
  workspaceCategories as categories,
  popularGroups,
  matchesGroup,
} from './config/workspace-catalog.js';
import { editorFontFallback } from './config/editor-fonts.js';
import {
  WorkspaceSession,
  type WorkspaceDocument,
} from './workspace-session.js';
import type { EmbedPdfContainer } from 'bentopdf-viewer';

type Task<T> = { toPromise(): Promise<T> };
type OpenResult = { documentId: string; task: Task<unknown> };
type OpenEvent = {
  id: string;
  name?: string;
  document?: { pageCount?: number };
};
interface DocumentManager {
  openDocumentBuffer(options: {
    documentId: string;
    buffer: ArrayBuffer;
    name: string;
    autoActivate: boolean;
    password?: string;
  }): Task<OpenResult>;
  closeDocument(id: string): Task<void>;
  setActiveDocument(id: string): void;
  getActiveDocumentId(): string | null;
  onDocumentOpened(callback: (event: OpenEvent) => void): void;
  onDocumentClosed(callback: (id: string | { id: string }) => void): void;
  onActiveDocumentChanged(
    callback: (event: { currentDocumentId: string | null }) => void
  ): void;
}
interface ExportCapability {
  forDocument(id: string): { saveAsCopy(): Task<ArrayBuffer> };
}
interface HistoryCapability {
  onHistoryChange(
    callback: (event: { documentId: string; topic: string }) => void
  ): void;
}
interface AnnotationCapability {
  getTool(id: string): {
    id: string;
    defaults: Record<string, unknown>;
    behavior?: Record<string, unknown>;
  };
  addTool(tool: Record<string, unknown>): void;
  setToolDefaults(id: string, values: Record<string, unknown>): void;
  forDocument(id: string): {
    setActiveTool(tool: string | null): void;
    getActiveTool(): { id: string } | null;
  };

  onAnnotationEvent(
    callback: (event: { documentId: string; type: string }) => void
  ): void;
}
interface RedactionCapability {
  onRedactionEvent(
    callback: (event: { documentId: string; type: string }) => void
  ): void;
  onPendingChange(
    callback: (event: { documentId: string; pending: unknown[] }) => void
  ): void;
}

const el = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
const session = new WorkspaceSession();
const input = el<HTMLInputElement>('pdf-input');
let viewer: EmbedPdfContainer | null = null;
let manager: DocumentManager | null = null;
let exporter: ExportCapability | null = null;
let viewerReady: Promise<void> | null = null;
let opening = false;
let exporting = false;
let statusTimer: ReturnType<typeof setTimeout> | undefined;
let filter = 'Popular Tools';
let query = '';
const pendingRedactions = new Map<string, number>();
const originalFiles = new Map<string, File>();
let signatureDocument: string | null = null;
const toolsById = new Map(
  categories
    .flatMap((category) => category.tools)
    .map((tool) => [tool.id, tool])
);
const categoryIcons: Record<string, string> = {
  'Popular Tools': 'sparkles',
  'Edit & Annotate': 'pencil-line',
  'Organize & Manage': 'layers-2',
  'Convert to PDF': 'file-input',
  'Convert from PDF': 'file-output',
  'Optimize & Repair': 'zap',
  'Secure PDF': 'shield-check',
  'PDF Security': 'shield-check',
};
function icon(name: string): string {
  return `<i data-lucide="${name}"></i>`;
}
function refreshIcons(): void {
  createIcons({ icons });
}
function showStatus(message: string, error = false, persistent = false): void {
  clearTimeout(statusTimer);
  const status = el('workspace-status');
  status.textContent = message;
  status.classList.toggle('error', error);
  status.hidden = false;
  if (!persistent)
    statusTimer = setTimeout(
      () => {
        status.hidden = true;
      },
      error ? 9000 : 4500
    );
}
function chooseFiles(): void {
  input.value = '';
  input.click();
}
function formatSize(size: number): string {
  if (!size) return 'PDF document';
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
function renderTabs(): void {
  const tabs = el('document-tabs');
  const focus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement.dataset.focusKey
      : undefined;
  tabs.replaceChildren();
  const entries = [
    { id: 'home', name: 'Home', dirty: false, loading: false },
    ...session.documents.values(),
  ];
  for (const document of entries) {
    const selected = session.activeTab === document.id;
    const wrapper = window.document.createElement('div');
    wrapper.className = `workspace-tab${selected ? ' selected' : ''}`;
    wrapper.setAttribute('role', 'presentation');
    const button = window.document.createElement('button');
    button.className = 'tab-activate';
    button.id = document.id === 'home' ? 'home-tab' : `tab-${document.id}`;
    button.dataset.focusKey = `activate-${document.id}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(selected));
    button.setAttribute(
      'aria-controls',
      document.id === 'home' ? 'home-panel' : 'editor-panel'
    );
    button.tabIndex = selected ? 0 : -1;
    button.title =
      document.id === 'home'
        ? 'Home'
        : `${document.name}${document.dirty ? ' · Changes not downloaded' : ''}`;
    button.innerHTML = icon(
      document.id === 'home'
        ? 'house'
        : document.loading
          ? 'loader-circle'
          : 'file-text'
    );
    const name = window.document.createElement('span');
    name.className = 'tab-name';
    name.textContent = document.name;
    button.append(name);
    if (document.dirty) {
      const dirty = window.document.createElement('span');
      dirty.className = 'tab-dirty';
      dirty.setAttribute('aria-label', 'Changes not downloaded');
      button.append(dirty);
    }
    button.onclick = () => activateTab(document.id);
    button.onkeydown = (event) => {
      const index = entries.findIndex((entry) => entry.id === document.id);
      let next: number | undefined;
      if (event.key === 'ArrowRight') next = (index + 1) % entries.length;
      if (event.key === 'ArrowLeft')
        next = (index - 1 + entries.length) % entries.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = entries.length - 1;
      if (next !== undefined) {
        event.preventDefault();
        activateTab(entries[next].id);
        el(next === 0 ? 'home-tab' : `tab-${entries[next].id}`).focus();
      }
    };
    wrapper.append(button);
    if (document.id !== 'home') {
      const close = window.document.createElement('button');
      close.className = 'tab-close';
      close.innerHTML = icon('x');
      close.setAttribute('aria-label', `Close ${document.name}`);
      close.dataset.focusKey = `close-${document.id}`;
      close.onclick = () => {
        void closeDocument(document.id);
      };
      wrapper.append(close);
    }
    tabs.append(wrapper);
  }
  refreshIcons();
  if (focus)
    tabs
      .querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focus)}"]`)
      ?.focus({ preventScroll: true });
}
function activateTab(id: string): void {
  session.activate(id);
  if (
    id !== 'home' &&
    manager &&
    !session.documents.get(id)?.toolOnly &&
    !session.documents.get(id)?.loading
  )
    manager.setActiveDocument(id);
  renderWorkspace();
  document
    .getElementById(id === 'home' ? 'home-tab' : `tab-${id}`)
    ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function renderWorkspace(): void {
  const home = session.activeTab === 'home';
  el('home-panel').hidden = !home;
  el('editor-panel').hidden = home;
  const document = session.documents.get(session.activeTab);
  el('active-document-name').textContent = document?.name ?? '';
  el('document-state').textContent = document?.loading
    ? 'Opening…'
    : document?.toolOnly
      ? 'Choose a file'
      : document?.dirty
        ? 'Edited'
        : 'PDF document';
  el('download-document').toggleAttribute(
    'disabled',
    !document || document.toolOnly || document.loading || exporting
  );
  el('editor-panel').setAttribute(
    'aria-labelledby',
    document ? `tab-${document.id}` : 'home-tab'
  );
  renderTabs();
  renderOpenDocuments();
  el('pdf-viewer').hidden = !!document?.toolOnly;
  el('tool-empty-canvas').hidden = !document?.toolOnly;
  workspaceTools?.sync();
}
function renderOpenDocuments(): void {
  const section = el('open-documents-section');
  section.hidden = session.documents.size === 0;
  el('open-documents-count').textContent =
    `${session.documents.size} ${session.documents.size === 1 ? 'document' : 'documents'}`;
  const grid = el('open-documents-grid');
  grid.replaceChildren();
  for (const document of session.documents.values()) {
    const card = window.document.createElement('button');
    card.className = 'open-document-card';
    card.innerHTML = `${icon('file-text')}<span class="open-document-details"><span class="open-document-name"></span><span class="open-document-meta"></span></span><i class="card-arrow" data-lucide="arrow-up-right"></i>`;
    card.querySelector('.open-document-name')!.textContent = document.name;
    card.querySelector('.open-document-meta')!.textContent = document.loading
      ? 'Opening…'
      : `${formatSize(document.size)}${document.dirty ? ' · Edited' : ' · Ready to work'}`;
    card.onclick = () => activateTab(document.id);
    grid.append(card);
  }
  refreshIcons();
}
function markDirty(id: string): void {
  session.markDirty(id);
  if (session.documents.has(id)) renderWorkspace();
}
async function initializeViewer(): Promise<void> {
  if (viewerReady) return viewerReady;
  viewerReady = (async () => {
    const { default: EmbedPDF } = await import('bentopdf-viewer');
    viewer =
      EmbedPDF.init({
        type: 'container',
        target: el('pdf-viewer'),
        worker: true,
        wasmUrl: new URL('bentopdf-pdfium/editcore.wasm', import.meta.url).href,
        fontFallback: editorFontFallback,
        tabBar: 'never',
        documentManager: { maxDocuments: 20 },
        theme: viewerTheme(),
        export: { defaultFileName: 'document.pdf' },
      }) ?? null;
    if (!viewer)
      throw new Error(
        'The PDF viewer could not start. Reload the workspace and try again.'
      );
    const registry = await viewer.registry;
    manager = registry
      .getPlugin('document-manager')
      .provides() as unknown as DocumentManager;
    exporter = registry
      .getPlugin('export')
      .provides() as unknown as ExportCapability;
    manager.onDocumentOpened((event) => {
      let document = session.documents.get(event.id);
      if (!document) {
        document = {
          id: event.id,
          name: event.name ?? 'document.pdf',
          size: 0,
          dirty: false,
          revision: 0,
          loading: false,
        };
        session.add(document);
      }
      document.loading = false;
      if (window.innerWidth >= 1000) {
        const ui = registry.getPlugin('ui').provides() as unknown as {
          forDocument(id: string): {
            setActiveSidebar(
              placement: string,
              slot: string,
              panel: string
            ): void;
          };
        };
        ui.forDocument(event.id).setActiveSidebar(
          'left',
          'main',
          'sidebar-panel'
        );
      }
      renderWorkspace();
    });
    manager.onDocumentClosed((event) => {
      const id = typeof event === 'string' ? event : event.id;
      const next = session.remove(id);
      pendingRedactions.delete(id);
      originalFiles.delete(id);
      workspaceTools.remove(id);
      activateTab(next);
    });
    manager.onActiveDocumentChanged((event) => {
      // A Home visit leaves the native active document intact. Changes from the native UI remain reflected on document tabs.
      if (
        session.activeTab !== 'home' &&
        event.currentDocumentId &&
        session.documents.has(event.currentDocumentId)
      ) {
        session.activate(event.currentDocumentId);
        renderWorkspace();
      }
    });
    const history = registry
      .getPlugin('history')
      .provides() as unknown as HistoryCapability;
    history.onHistoryChange((event) => markDirty(event.documentId));
    const annotation = registry
      .getPlugin('annotation')
      .provides() as unknown as AnnotationCapability;
    annotation.onAnnotationEvent((event) => {
      if (['create', 'update', 'delete'].includes(event.type))
        markDirty(event.documentId);
    });
    const redaction = registry
      .getPlugin('redaction')
      .provides() as unknown as RedactionCapability;
    redaction.onRedactionEvent((event) => {
      if (event.type !== 'loaded') markDirty(event.documentId);
    });
    redaction.onPendingChange((event) => {
      const count = event.pending.length;
      if (
        pendingRedactions.has(event.documentId) &&
        pendingRedactions.get(event.documentId) !== count
      )
        markDirty(event.documentId);
      pendingRedactions.set(event.documentId, count);
    });
  })().catch((error) => {
    viewerReady = null;
    throw error;
  });
  return viewerReady;
}
async function openFiles(files: File[]): Promise<void> {
  const pdfs = files.filter(
    (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  );
  if (!pdfs.length) {
    showStatus('Choose a PDF file to open in your workspace.', true);
    return;
  }
  if (opening) {
    showStatus('Your PDFs are still opening. Try again in a moment.');
    return;
  }
  if (session.documents.size + pdfs.length > 20) {
    showStatus(
      'This workspace holds 20 documents. Close a tab before opening more.',
      true
    );
    return;
  }
  opening = true;
  showStatus('Preparing your PDF workspace…', false, true);
  try {
    await initializeViewer();
    for (const file of pdfs) {
      const id = crypto.randomUUID();
      session.add({
        id,
        name: file.name,
        size: file.size,
        dirty: false,
        revision: 0,
        loading: true,
      });
      session.activate(id);
      renderWorkspace();
      showStatus(`Opening ${file.name}…`, false, true);
      try {
        const result = await manager!
          .openDocumentBuffer({
            documentId: id,
            buffer: await file.arrayBuffer(),
            name: file.name,
            autoActivate: true,
          })
          .toPromise();
        await result.task.toPromise();
        originalFiles.set(id, file);
        const document = session.documents.get(id);
        if (document) document.loading = false;
        activateTab(id);
      } catch (error) {
        await manager!
          .closeDocument(id)
          .toPromise()
          .catch((): void => {});
        session.remove(id);
        renderWorkspace();
        console.error('PDF open failed', error);
        showStatus(
          `Could not open ${file.name}. ${error instanceof Error ? error.message : 'The file may be damaged or password protected.'}`,
          true
        );
      }
    }
    if (!el('workspace-status').classList.contains('error'))
      showStatus(
        `${pdfs.length === 1 ? 'Your PDF is' : 'Your PDFs are'} ready. Download a copy to keep any edits.`
      );
  } catch (error) {
    showStatus(
      error instanceof Error
        ? error.message
        : 'The PDF viewer could not start. Reload and try again.',
      true
    );
  } finally {
    opening = false;
    renderWorkspace();
  }
}
async function downloadDocument(id: string): Promise<boolean> {
  const document = session.documents.get(id);
  if (!document || document.loading || !exporter || exporting) return false;
  if ((pendingRedactions.get(id) ?? 0) > 0) {
    showStatus(
      'Apply your pending redactions in the editor before downloading.',
      true
    );
    return false;
  }
  const revision = document.revision;
  exporting = true;
  renderWorkspace();
  showStatus(`Preparing ${document.name}…`, false, true);
  try {
    const buffer = await exporter.forDocument(id).saveAsCopy().toPromise();
    const url = URL.createObjectURL(
      new Blob([buffer], { type: 'application/pdf' })
    );
    const link = window.document.createElement('a');
    link.href = url;
    link.download = document.name;
    window.document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    session.markDownloaded(id, revision);
    showStatus(`Downloaded ${document.name}`);
    return true;
  } catch (error) {
    console.error('PDF download failed', error);
    showStatus(
      'Could not download this PDF. Keep the tab open and try again.',
      true
    );
    return false;
  } finally {
    exporting = false;
    renderWorkspace();
  }
}
async function closeDocument(id: string): Promise<void> {
  const document = session.documents.get(id);
  if (!document) return;
  if (
    workspaceTools.hasWork(id) &&
    !window.confirm(
      'Close this task? Its tool inputs and unfinished tool changes will be discarded. Download or open a result before closing.'
    )
  )
    return;
  if (document.toolOnly) {
    workspaceTools.remove(id);
    activateTab(session.remove(id));
    return;
  }
  if (!manager) return;
  if (document.loading) {
    showStatus('Wait for this PDF to finish opening before closing its tab.');
    return;
  }
  if (document.dirty) {
    const dialog = el<HTMLDialogElement>('close-dialog');
    if (dialog.open) return;
    el('close-dialog-description').textContent =
      `“${document.name}” has changes that haven’t been downloaded.`;
    dialog.returnValue = 'cancel';
    dialog.showModal();
    const action = await new Promise<string>((resolve) =>
      dialog.addEventListener('close', () => resolve(dialog.returnValue), {
        once: true,
      })
    );
    if (action === 'cancel' || !action) return;
    if (action === 'download') {
      if (!(await downloadDocument(id))) return;
      if (session.documents.get(id)?.dirty) {
        showStatus(
          'New edits were made during the download. Download again before closing.'
        );
        return;
      }
    }
  }
  try {
    await manager.closeDocument(id).toPromise();
  } catch {
    showStatus('Could not close the document. Try again.', true);
  }
}
function applyFilter(name: string, scroll = false): void {
  filter = name;
  renderFilters();
  renderTools();
  if (scroll)
    el('tool-library').scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
}
function renderFilters(): void {
  const navigation = el('category-nav');
  navigation.replaceChildren();
  for (const category of categories.filter(
    (category) => category.name !== 'Popular Tools'
  )) {
    const button = window.document.createElement('button');
    button.className = `sidebar-link${filter === category.name ? ' selected' : ''}`;
    button.innerHTML = icon(
      categoryIcons[category.name] ??
        (category.name.includes('Convert') ? 'arrow-left-right' : 'folder')
    );
    button.append(
      window.document.createTextNode(
        category.name
          .replace(' & Manage', '')
          .replace('Popular Tools', 'Popular')
      )
    );
    button.setAttribute('aria-pressed', String(filter === category.name));
    button.onclick = () => applyFilter(category.name, true);
    navigation.append(button);
  }
  const pills = el('category-pills');
  pills.replaceChildren();
  for (const [name, label] of [
    ['Popular Tools', 'Popular'],
    ['all', 'All tools'],
    ...categories
      .filter((category) => category.name !== 'Popular Tools')
      .map((category) => [category.name, category.name]),
  ]) {
    const button = window.document.createElement('button');
    button.className = `category-pill${filter === name ? ' selected' : ''}`;
    button.textContent = label;
    button.setAttribute('aria-pressed', String(filter === name));
    button.onclick = () => applyFilter(name);
    pills.append(button);
  }
  el('overview-link').classList.toggle('selected', filter === 'Popular Tools');
  el('library-link').classList.toggle('selected', filter === 'all');
  refreshIcons();
}
function renderTools(): void {
  const grid = el('tool-grid');
  grid.replaceChildren();
  let tools =
    filter === 'all'
      ? [...toolsById.values()]
      : (categories.find((category) => category.name === filter)?.tools ?? []);
  if (filter === 'Popular Tools' && !query)
    tools = popularGroups
      .map((id) => toolsById.get(id))
      .filter((tool): tool is NonNullable<typeof tool> => Boolean(tool));
  if (query)
    tools = [...toolsById.values()].filter((tool) => matchesGroup(tool, query));
  el('library-title').textContent = query
    ? 'Find your next tool'
    : filter === 'Popular Tools'
      ? 'Your everyday toolkit'
      : filter === 'all'
        ? 'All PDF tools'
        : filter;
  el('library-description').textContent = query
    ? `${tools.length} ${tools.length === 1 ? 'tool' : 'tools'} found`
    : filter === 'Popular Tools'
      ? 'Small tasks. A smoother day.'
      : 'Find the right tool for your next task.';
  el('library-empty').hidden = tools.length !== 0;
  const descriptions: Record<string, string> = {
    'edit-pdf': 'Read, highlight, comment, and add shapes.',
    'merge-pdf': 'Combine multiple PDFs into one document.',
    'split-pdf': 'Extract the pages you need into a new PDF.',
    'compress-pdf': 'Reduce file size for easier sharing.',
    'sign-pdf': 'Draw, type, or upload your signature.',
    'organize-pdf': 'Reorder, duplicate, and delete pages.',
  };
  for (const tool of tools) {
    const visual = toolVisuals[tool.id] ?? [tool.icon, '#eff2fa', '#8292b5'];
    const card = createToolCard(
      tool,
      visual as [string, string, string],
      descriptions[tool.id] ?? tool.subtitle,
      () => void workspaceTools.select(tool.id, true, query)
    );
    grid.append(card);
  }
  refreshIcons();
}
const workspaceTools = setupWorkspaceTools({
  activeId: () => session.activeTab,
  revision: (id) => session.documents.get(id)?.revision ?? 0,
  hasPdf: (id) =>
    !!session.documents.get(id) &&
    !session.documents.get(id)?.toolOnly &&
    !session.documents.get(id)?.loading,
  createTask(name) {
    const id = crypto.randomUUID();
    session.add({
      id,
      name,
      size: 0,
      dirty: false,
      revision: 0,
      loading: false,
      toolOnly: true,
    });
    activateTab(id);
    return id;
  },
  async placeSignature(id, image, size) {
    await initializeViewer();
    const registry = await viewer!.registry;
    const annotation = registry
      .getPlugin('annotation')
      .provides() as unknown as AnnotationCapability;
    signatureDocument = id;
    annotation.setToolDefaults('stamp', {
      imageSrc: image,
      imageSize: size,
      subject: 'Signature',
    });
    annotation.forDocument(id).setActiveTool('stamp');
  },
  cancelSignature(id) {
    if (!viewer || signatureDocument !== id) return;
    signatureDocument = null;
    void viewer.registry
      .then((registry) => {
        if (signatureDocument !== null) return;
        const annotation = registry
          .getPlugin('annotation')
          .provides() as unknown as AnnotationCapability;
        if (session.documents.has(id) && !session.documents.get(id)?.toolOnly) {
          const scope = annotation.forDocument(id);
          if (scope.getActiveTool()?.id === 'stamp') scope.setActiveTool(null);
        }
        annotation.setToolDefaults('stamp', {
          imageSrc: undefined,
          imageSize: undefined,
          subject: undefined,
        });
      })
      .catch(() => {
        /* The viewer may already have disposed the closing document. */
      });
  },
  async editMode(id, toolbar) {
    await initializeViewer();
    const registry = await viewer!.registry;
    const ui = registry.getPlugin('ui').provides() as unknown as {
      setActiveToolbar(
        placement: string,
        slot: string,
        name: string,
        id: string
      ): void;
    };
    ui.setActiveToolbar('top', 'secondary', toolbar, id);
  },
  async snapshot(id, preserveOriginal = false) {
    if ((pendingRedactions.get(id) ?? 0) > 0)
      throw new Error('Apply pending redactions before using another tool.');
    const doc = session.documents.get(id)!;
    if (preserveOriginal && doc.revision === 0 && originalFiles.has(id))
      return originalFiles.get(id)!;
    return new File(
      [await exporter!.forDocument(id).saveAsCopy().toPromise()],
      doc.name,
      { type: 'application/pdf' }
    );
  },
  async attach(id, file) {
    const doc = session.documents.get(id);
    if (!doc || !doc.toolOnly) return;
    doc.loading = true;
    doc.name = file.name;
    doc.size = file.size;
    renderWorkspace();
    try {
      await initializeViewer();
      const result = await manager!
        .openDocumentBuffer({
          documentId: id,
          buffer: await file.arrayBuffer(),
          name: file.name,
          autoActivate: session.activeTab === id,
        })
        .toPromise();
      await result.task.toPromise();
      originalFiles.set(id, file);
      doc.toolOnly = false;
    } finally {
      doc.loading = false;
      renderWorkspace();
    }
  },
  async result(file) {
    await openFiles([file]);
  },
  status: (message) => showStatus(message, true),
});
for (const id of ['tab-open', 'hero-open']) el(id).onclick = chooseFiles;
el('overview-link').onclick = () => {
  query = '';
  el<HTMLInputElement>('tool-search').value = '';
  applyFilter('Popular Tools');
  el('home-content').scrollTo({ top: 0, behavior: 'smooth' });
};
el('library-link').onclick = () => applyFilter('all', true);
el('editor-tools').onclick = () => workspaceTools.toggle();
el('download-document').onclick = () => {
  void downloadDocument(session.activeTab);
};
input.onchange = () => {
  void openFiles(Array.from(input.files ?? []));
};
el<HTMLInputElement>('tool-search').oninput = (event) => {
  query = (event.target as HTMLInputElement).value.trim();
  renderTools();
};
window.addEventListener('keydown', (event) => {
  const target = event.composedPath()[0];
  const typing =
    target instanceof HTMLElement &&
    (target.matches('input,textarea,[contenteditable="true"]') ||
      target.isContentEditable);
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    chooseFiles();
  }
  if (
    event.key === '/' &&
    !typing &&
    !el<HTMLDialogElement>('close-dialog').open
  ) {
    event.preventDefault();
    activateTab('home');
    el<HTMLInputElement>('tool-search').focus();
  }
});
window.addEventListener('beforeunload', (event) => {
  if (session.hasUnsavedChanges || session.documents.size > 0) {
    event.preventDefault();
    event.returnValue = '';
  }
});
let dragDepth = 0;
window.addEventListener('dragenter', (event) => {
  if (event.dataTransfer?.types.includes('Files')) {
    event.preventDefault();
    dragDepth++;
    el('drop-overlay').hidden = false;
  }
});
window.addEventListener('dragover', (event) => {
  if (event.dataTransfer?.types.includes('Files')) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) el('drop-overlay').hidden = true;
});
window.addEventListener('drop', (event) => {
  event.preventDefault();
  dragDepth = 0;
  el('drop-overlay').hidden = true;
  if (event.dataTransfer?.files.length)
    void openFiles(Array.from(event.dataTransfer.files));
});
el('tool-count').textContent = String(toolsById.size);
el('workspace-date').textContent = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
}).format(new Date());
renderFilters();
renderTools();
renderWorkspace();
