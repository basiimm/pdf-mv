import { createIcons, icons } from 'lucide';
import {
  engines,
  groups,
  groupById,
  groupForEngine,
  workspaceCategories,
  conversionTo,
  conversionFrom,
  formatName,
  matchesGroup,
  type ToolGroup,
} from './config/workspace-catalog.js';
import { createSignaturePanel } from './workspace-signature-panel.js';
import { createMergePanel } from './workspace-merge-panel.js';
import { createToolPanel } from './tools/panel.js';
import { rememberTool } from './tool-launcher.js';
import { createOrganizePanel } from './tools/organize-panel.js';
import { toolDefinitions } from './tools/registry.js';
import { detectConversion } from './workspace-conversion.js';
import { describeWorkspaceError } from './workspace-errors.js';

export interface ToolHost {
  activeId(): string;
  placeSignature(
    id: string,
    image: string,
    size: { width: number; height: number }
  ): Promise<void>;
  cancelSignature(id: string): void;
  editMode(id: string, toolbar: string): Promise<void>;
  hasPdf(id: string): boolean;
  revision(id: string): number;
  createTask(name: string): string;
  snapshot(id: string, preserveOriginal?: boolean): Promise<File>;
  attach(id: string, file: File): Promise<void>;
  result(file: File): Promise<void>;
  /** Apply a tool's output to the same document as an undoable revision. */
  commit(id: string, file: File, label: string): Promise<void>;
  canUndoCommit(id: string): boolean;
  /** Show generated output in the same view without committing it. */
  showPreview(id: string, file: File): Promise<void>;
  /** Commit the visible preview as an undoable revision. */
  applyPreview(id: string, label: string): Promise<void>;
  /** Discard the preview and return to the committed document. */
  cancelPreview(id: string): Promise<void>;
  isPreviewing(id: string): boolean;
  /** Restore the previous revision; resolves with its label, or null. */
  undoCommit(id: string): Promise<string | null>;
  status(message: string): void;
}
interface FrameEntry {
  frame: HTMLIFrameElement;
  tool: string;
  documentId: string;
  initialized: boolean;
  state: string;
  sourceName?: string;
  inputFiles?: File[];
}
interface NativePanel {
  root: HTMLElement;
  sync(): void;
  dispose(): void;
  sourceFiles?(): File[];
  setFiles?(files: File[]): void;
  canvasRoot?: HTMLElement;
  setActive?(active: boolean): void;
  isPreviewActive?(): boolean;
}
export function setupWorkspaceTools(host: ToolHost) {
  const panel = document.getElementById('workspace-tools')!;
  const catalog = document.getElementById('document-tool-list')!;
  const title = document.getElementById('document-tool-title')!;
  const canvas = document.querySelector('.document-canvas-area')!;
  const frames = new Map<string, FrameEntry>();
  const selections = new Map<string, string>();
  const groupSelections = new Map<string, ToolGroup>();
  const activeFrames = new Map<string, string>();
  const usedFrames = new Set<string>();
  const collapsed = new Set<string>();
  const nativePanels = new Map<string, NativePanel>();
  const conversionFiles = new Map<string, File[]>();
  let lastPanelOpen: boolean | undefined;
  let lastPanelId = '';
  const visitedDocuments = new Set<string>();
  const controls = document.createElement('div');
  controls.className = 'workspace-group-controls';
  panel.append(controls);
  const frameStatus = document.createElement('div');
  frameStatus.className = 'workspace-frame-status';
  frameStatus.setAttribute('role', 'status');
  panel.append(frameStatus);
  const nativeEdit = document.createElement('div');
  nativeEdit.className = 'native-edit-controls';
  panel.append(nativeEdit);
  const upload = document.createElement('input');
  upload.type = 'file';
  upload.accept = '.pdf,application/pdf';
  upload.hidden = true;
  panel.append(upload);
  const convertUpload = document.createElement('input');
  convertUpload.type = 'file';
  convertUpload.dataset.conversionSource = 'true';
  convertUpload.multiple = true;
  convertUpload.hidden = true;
  panel.append(convertUpload);
  let conversionTask = '';
  function chooseConversion(id: string) {
    conversionTask = id;
    convertUpload.value = '';
    convertUpload.click();
  }
  convertUpload.onchange = async () => {
    const files = Array.from(convertUpload.files ?? []);
    if (!files.length) return;
    let id = conversionTask;
    try {
      const engine = detectConversion(files);
      if (host.hasPdf(id)) {
        id = host.createTask('Convert');
        groupSelections.set(id, groupById.get('convert')!);
        collapsed.delete(id);
      }
      if (engine.startsWith('pdf-to-')) await host.attach(id, files[0]);
      conversionFiles.set(id, files);
      usedFrames.add(id);
      // A new source must not reuse the previous engine's input or result state.
      for (const [key, instance] of nativePanels) {
        if (
          key.startsWith(id + ':') &&
          conversionTo.includes(key.slice(id.length + 1))
        ) {
          instance.dispose();
          nativePanels.delete(key);
        }
      }
      for (const [key, entry] of frames) {
        if (
          entry.documentId === id &&
          (conversionTo.includes(entry.tool) ||
            conversionFrom.includes(entry.tool))
        ) {
          entry.frame.remove();
          frames.delete(key);
        }
      }
      await openEngine(id, engine);
    } catch (error) {
      host.status(
        error instanceof Error ? error.message : 'Could not select this file.'
      );
    }
  };
  const revealTimers = new WeakMap<HTMLIFrameElement, number>();
  function revealFrame(frame: HTMLIFrameElement) {
    clearTimeout(revealTimers.get(frame));
    delete frame.dataset.state;
  }
  function markFrameLoading(frame: HTMLIFrameElement) {
    frame.dataset.state = 'loading';
    clearTimeout(revealTimers.get(frame));
    revealTimers.set(
      frame,
      window.setTimeout(() => revealFrame(frame), 3000)
    );
  }
  let uploadTask = '',
    query = '';
  // These engines require a large interactive canvas; settings-oriented tools keep the PDF visible.
  const canvasTools = new Set([
    'edit-pdf-text',
    'crop-pdf',
    'organize-pdf',
    'pdf-multi-tool',
    'split-pdf',
    'form-creator',
    'form-filler',
    'pdf-workflow',
    'markdown-to-pdf',
    'compare-pdfs',
  ]);
  const outputHost: ToolHost = {
    ...host,
    async result(file) {
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name))
        await host.result(file);
      else {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
    },
  };
  upload.onchange = async () => {
    const file = upload.files?.[0];
    if (!file) return;
    try {
      await host.attach(uploadTask, file);
      await host.editMode(uploadTask, 'annotation-toolbar');
      sync();
    } catch (error) {
      host.status(describeWorkspaceError(error, 'open').message);
    }
  };
  function renderNativeEdit(id: string) {
    nativeEdit.replaceChildren();
    const p = document.createElement('p');
    p.textContent = host.hasPdf(id)
      ? 'Use the controls above the page to annotate this document.'
      : 'Open a PDF to start editing.';
    nativeEdit.append(p);
    const options = host.hasPdf(id)
      ? [
          ['Text, highlights & stamps', 'annotation-toolbar'],
          ['Shapes', 'shapes-toolbar'],
          ['Redact', 'redaction-toolbar'],
        ]
      : [['Open PDF', 'upload']];
    for (const [name, toolbar] of options) {
      const button = document.createElement('button');
      button.className = 'document-tool-button';
      button.textContent = name;
      button.onclick = () => {
        if (toolbar === 'upload') {
          uploadTask = id;
          upload.value = '';
          upload.click();
        } else
          void host
            .editMode(id, toolbar)
            .catch((error) => host.status(String(error)));
      };
      nativeEdit.append(button);
    }
  }
  function renderCatalog() {
    catalog.replaceChildren();
    let count = 0;
    for (const category of workspaceCategories) {
      const filtered = category.tools.filter(
        (group) => !query || matchesGroup(group, query)
      );
      if (!filtered.length) continue;
      const section = document.createElement('details');
      section.className = 'document-tool-category';
      section.open = !!query || category.name === 'Popular Tools';
      const heading = document.createElement('summary');
      heading.textContent = category.name;
      section.append(heading);
      for (const group of filtered) {
        count++;
        const button = document.createElement('button');
        button.className = 'document-tool-button';
        button.dataset.toolGroup = group.id;
        const badge = document.createElement('span');
        badge.className = 'tool-icon';
        badge.style.setProperty(
          '--icon-color',
          group.id === 'edit-pdf' ? '#7b8fc3' : '#8292b5'
        );
        const icon = document.createElement('i');
        icon.dataset.lucide = group.icon;
        badge.append(icon);
        const text = document.createElement('span');
        text.textContent = group.name;
        button.append(badge, text);
        button.onclick = () => void select(group.id, false, query);
        section.append(button);
      }
      catalog.append(section);
    }
    if (!count)
      catalog.textContent = 'No matching tools. Try a format or task name.';
    createIcons({ icons });
  }
  function dropdown(
    labelText: string,
    options: [string, string][],
    value: string,
    change: (value: string) => void
  ) {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('select');
    for (const [id, name] of options) input.add(new Option(name, id));
    input.value = value;
    input.onchange = () => change(input.value);
    label.append(input);
    controls.append(label);
  }
  function renderGroupControls(id: string) {
    controls.replaceChildren();
    const group = groupSelections.get(id),
      active = selections.get(id);
    const advanced = active?.startsWith('advanced:');
    const chosen = advanced ? active!.slice(9) : active;
    controls.hidden = !group;
    if (!group || !chosen) return;
    if (group.id === 'convert') {
      const files = conversionFiles.get(id);
      const source = document.createElement('p');
      source.textContent = files?.length
        ? files.map((file) => file.name).join(', ')
        : host.hasPdf(id)
          ? 'Source: current PDF'
          : 'Choose files to see compatible conversion options.';
      controls.append(source);
      const choose = document.createElement('button');
      choose.className = 'button button-secondary';
      choose.dataset.chooseSource = 'true';
      choose.textContent =
        files?.length || host.hasPdf(id)
          ? 'Choose another file'
          : 'Choose files to convert';
      choose.onclick = () => chooseConversion(id);
      controls.append(choose);
      if (chosen === 'convert-start') return;
      const toPdf = conversionTo.includes(chosen);
      if (!toPdf)
        dropdown(
          'Output format',
          conversionFrom.map((key) => [key, formatName(key)]),
          chosen,
          (key) => void openEngine(id, key)
        );
      else {
        const output = document.createElement('p');
        output.textContent = `Detected: ${formatName(chosen)} · Output: PDF`;
        controls.append(output);
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = 'Input format options';
        details.append(summary);
        const previous = controls.lastElementChild;
        dropdown(
          'Interpret input as',
          conversionTo.map((key) => [key, formatName(key)]),
          chosen,
          (key) => void openEngine(id, key)
        );
        if (controls.lastElementChild !== previous)
          details.append(controls.lastElementChild!);
        controls.append(details);
      }
      if (chosen.includes('word') || chosen.includes('docx')) {
        const note = document.createElement('p');
        note.textContent =
          'Complex layouts and fonts may change during conversion. Check the result before sharing.';
        controls.append(note);
      }
    } else if (group.id === 'watermark') {
      dropdown(
        'Watermark type',
        [
          ['add-watermark', 'Text watermark'],
          ['watermark-advanced', 'Image & advanced options'],
        ],
        chosen,
        (key) => void openEngine(id, key)
      );
    } else if (group.members.length > 1) {
      dropdown(
        'Action',
        group.members.map((key) => [key, engines.get(key)!.name]),
        chosen,
        (key) => void openEngine(id, key)
      );
    }
    // Legacy engine pages are only offered where the native panel lacks options.
    if (chosen === 'header-footer' || chosen === 'add-watermark') {
      const mode = document.createElement('button');
      mode.className = 'workspace-mode-switch';
      mode.textContent = advanced ? 'Use simple controls' : 'More options';
      mode.onclick = () =>
        void openEngine(id, advanced ? chosen : `advanced:${chosen}`);
      controls.append(mode);
    }
  }
  function sync() {
    const id = host.activeId(),
      chosen = selections.get(id),
      group = groupSelections.get(id);
    if (
      !visitedDocuments.has(id) &&
      host.hasPdf(id) &&
      !chosen &&
      window.matchMedia('(max-width: 700px)').matches
    )
      collapsed.add(id);
    visitedDocuments.add(id);
    panel.hidden = id === 'home' || collapsed.has(id);
    const toggle = document.getElementById('editor-tools')!;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    toggle.setAttribute('aria-controls', 'workspace-tools');
    toggle.setAttribute(
      'aria-label',
      window.matchMedia('(max-width: 700px)').matches
        ? 'Tools'
        : panel.hidden
          ? 'Show all tools'
          : 'Hide all tools'
    );
    document
      .getElementById('editor-panel')
      ?.setAttribute('data-tools-open', String(!panel.hidden));
    if (lastPanelOpen !== !panel.hidden || lastPanelId !== id) {
      lastPanelOpen = !panel.hidden;
      lastPanelId = id;
      document.dispatchEvent(
        new CustomEvent('workspace-tools-visibility', {
          detail: { open: !panel.hidden },
        })
      );
    }
    const label = toggle.querySelector('span');
    if (label)
      label.textContent = window.matchMedia('(max-width: 700px)').matches
        ? 'Tools'
        : panel.hidden
          ? 'Show all tools'
          : 'Hide all tools';
    title.textContent = group?.name ?? 'Tools';
    document.getElementById('document-tools-back')!.hidden = !chosen;
    document.getElementById('document-tools-search')!.hidden = !!chosen;
    catalog.hidden = !!chosen;
    renderGroupControls(id);
    nativeEdit.hidden = !['edit-pdf', 'add-stamps'].includes(chosen ?? '');
    if (!nativeEdit.hidden) renderNativeEdit(id);
    for (const [key, instance] of nativePanels) {
      const active = key === `${id}:${chosen}`;
      instance.root.hidden = !active;
      instance.setActive?.(active);
      instance.sync();
      if (instance.canvasRoot)
        instance.canvasRoot.hidden =
          !active ||
          (instance.isPreviewActive ? !instance.isPreviewActive() : false);
    }
    const native = nativePanels.get(`${id}:${chosen}`);
    const selectedFiles =
      native?.sourceFiles?.() ?? conversionFiles.get(id) ?? [];
    const emptyCanvas = document.getElementById('tool-empty-canvas');
    const emptyHeading = emptyCanvas?.querySelector('h2');
    const emptyText = emptyCanvas?.querySelector('p');
    const emptyButton = document.getElementById('tool-empty-open');
    if (group?.id === 'convert') {
      if (emptyHeading)
        emptyHeading.textContent = selectedFiles.length
          ? 'Ready to convert'
          : 'Start with your file';
      if (emptyText)
        emptyText.textContent = selectedFiles.length
          ? 'Adjust the options in the tool panel, then convert. Your output will be ready to inspect or download.'
          : 'Choose a PDF, image or document. We will detect its format for you.';
      if (emptyButton)
        emptyButton.textContent = selectedFiles.length
          ? 'Choose another file'
          : 'Choose files to convert';
    } else {
      if (emptyHeading) emptyHeading.textContent = 'Start with your document';
      if (emptyText)
        emptyText.textContent =
          'Choose a file to use with this tool. It will appear here when ready.';
      if (emptyButton) emptyButton.textContent = 'Choose a PDF';
    }

    const sourceState = document.getElementById('document-state');
    if (sourceState && !host.hasPdf(id))
      sourceState.textContent = selectedFiles.length
        ? `${selectedFiles.length} ${selectedFiles.length === 1 ? 'file' : 'files'} selected`
        : 'Choose a file';
    const useCanvas =
      !!chosen &&
      (canvasTools.has(chosen) ||
        chosen === 'merge-pdf' ||
        !!native?.isPreviewActive?.());
    const convertingInput =
      group?.id === 'convert' && !!chosen && conversionTo.includes(chosen);
    document.getElementById('pdf-viewer')!.hidden =
      useCanvas || !host.hasPdf(id) || convertingInput;
    document.getElementById('tool-empty-canvas')!.hidden =
      useCanvas || (host.hasPdf(id) && !convertingInput);
    document.getElementById('download-document')!.hidden =
      useCanvas || group?.id === 'convert';
    for (const [key, entry] of frames)
      entry.frame.hidden = !chosen || key !== activeFrames.get(id);
    const active = frames.get(activeFrames.get(id) ?? '');
    frameStatus.hidden = !chosen || !active;
    frameStatus.replaceChildren();
    if (chosen && active) {
      const text = document.createElement('span');
      text.textContent = active.state;
      frameStatus.append(text);
      if (host.hasPdf(id) && !conversionTo.includes(active.tool)) {
        const retry = document.createElement('button');
        retry.textContent = 'Use current PDF';
        retry.type = 'button';
        retry.title = 'Reload the tool with the current document';
        retry.onclick = () => {
          active.initialized = false;
          active.state = 'Reloading tool…';
          markFrameLoading(active.frame);
          active.frame.src = active.frame.src;
          sync();
        };
        frameStatus.append(retry);
      }
    }
  }
  async function openEngine(id: string, toolId: string) {
    const previous = selections.get(id);
    if (
      previous &&
      conversionTo.includes(previous) &&
      conversionTo.includes(toolId)
    ) {
      const files = nativePanels.get(`${id}:${previous}`)?.sourceFiles?.();
      if (files?.length) conversionFiles.set(id, files);
    }
    selections.set(id, toolId);
    activeFrames.delete(id);
    try {
      if (toolId === 'convert-start') {
        sync();
        return;
      }
      if (['edit-pdf', 'add-stamps'].includes(toolId)) {
        if (host.hasPdf(id)) await host.editMode(id, 'annotation-toolbar');
        sync();
        return;
      }
      const nativeKey = `${id}:${toolId}`;
      if (
        toolId === 'merge-pdf' ||
        toolId === 'sign-pdf' ||
        toolId === 'organize-pdf' ||
        toolId === 'pdf-multi-tool' ||
        toolId === 'split-pdf' ||
        toolDefinitions.has(toolId)
      ) {
        if (!nativePanels.has(nativeKey)) {
          const instance =
            toolId === 'merge-pdf'
              ? createMergePanel(outputHost, id, sync)
              : toolId === 'sign-pdf'
                ? createSignaturePanel(outputHost, id, sync)
                : toolId === 'organize-pdf' || toolId === 'pdf-multi-tool'
                  ? createOrganizePanel(outputHost, id, 'organize', sync)
                  : toolId === 'split-pdf'
                    ? createOrganizePanel(outputHost, id, 'split', sync)
                    : toolDefinitions.has(toolId)
                      ? createToolPanel(
                          outputHost,
                          id,
                          toolDefinitions.get(toolId)!,
                          sync
                        )
                      : (() => {
                          throw new Error('This tool is not available.');
                        })();
          nativePanels.set(nativeKey, instance);
          panel.append(instance.root);
          const native = instance as NativePanel;
          if (native.canvasRoot) canvas.append(native.canvasRoot);
          const sources = conversionFiles.get(id);
          if (sources && conversionTo.includes(toolId))
            native.setFiles?.(sources);
        }
        sync();
        return;
      }
      const tool = engines.get(
        toolId === 'watermark-advanced'
          ? 'add-watermark'
          : toolId.replace(/^advanced:/, '')
      );
      if (!tool) throw new Error('This tool is not available.');
      const key = `${id}:${toolId}:${host.revision(id)}`;
      activeFrames.set(id, key);
      if (!frames.has(key)) {
        const frame = document.createElement('iframe');
        frame.className = 'workspace-tool-frame';
        frame.title = tool.name + ' controls';
        // Stay invisible until the page reports it is styled, so the legacy
        // markup can never flash. A timeout keeps slow pages reachable.
        markFrameLoading(frame);
        const url = new URL(tool.href, location.href);
        url.searchParams.set('workspace', '1');
        frame.src = url.href;
        frames.set(key, {
          frame,
          tool: tool.id,
          documentId: id,
          initialized: false,
          state: 'Loading controls…',
          inputFiles: conversionTo.includes(toolId)
            ? conversionFiles.get(id)
            : toolId.startsWith('advanced:')
              ? nativePanels.get(`${id}:${tool.id}`)?.sourceFiles?.()
              : undefined,
        });
        (canvasTools.has(toolId) ? canvas : panel).append(frame);
        setTimeout(() => {
          const entry = frames.get(key);
          if (entry && !entry.initialized) {
            entry.state =
              'This tool is taking longer to start. You can choose another action or retry.';
            if (host.activeId() === id) sync();
          }
        }, 15000);
        frame.addEventListener('error', () => {
          const entry = frames.get(key);
          if (entry) {
            entry.state = 'Could not load this tool. Try opening it again.';
            sync();
          }
        });
      }
      sync();
    } catch (error) {
      sync();
      host.status(describeWorkspaceError(error, 'open').message);
    }
  }
  async function select(request: string, fromHome = false, search = '') {
    rememberTool(request);
    const group = groupById.get(request) ?? groupForEngine.get(request);
    if (!group) {
      host.status('This tool is not available.');
      return;
    }
    let id = host.activeId();
    if (fromHome || id === 'home') id = host.createTask(group.name);
    groupSelections.set(id, group);
    collapsed.delete(id);
    let toolId = groupById.has(request) ? group.members[0] : request;
    if (group.id === 'convert' && groupById.has(request))
      toolId = host.hasPdf(id)
        ? 'pdf-to-png'
        : conversionFiles.has(id)
          ? detectConversion(conversionFiles.get(id)!)
          : 'convert-start';
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      toolId =
        group.members.find((key) =>
          engines.get(key)?.name.toLowerCase().includes(q)
        ) ?? toolId;
    }
    await openEngine(id, toolId);
  }
  window.addEventListener('message', async (event) => {
    if (
      event.origin !== location.origin ||
      !event.data ||
      typeof event.data.type !== 'string'
    )
      return;
    const entry = [...frames.values()].find(
      (item) => item.frame.contentWindow === event.source
    );
    if (!entry) return;
    const id = entry.documentId;
    if (event.data.type === 'studio-tool-styled') {
      revealFrame(entry.frame);
      return;
    }
    if (event.data.type === 'studio-tool-back') {
      if (
        host.activeId() !== id ||
        frames.get(activeFrames.get(id) ?? '') !== entry
      )
        return;
      selections.delete(id);
      groupSelections.delete(id);
      activeFrames.delete(id);
      sync();
      return;
    }
    if (event.data.type === 'studio-tool-error') {
      entry.state = describeWorkspaceError(
        new Error(String(event.data.message)),
        'apply'
      ).message;
      if (host.activeId() === id) sync();
    }
    if (event.data.type === 'studio-tool-ready' && !entry.initialized) {
      entry.initialized = true;
      if (entry.inputFiles?.length) {
        entry.frame.contentWindow?.postMessage(
          {
            type: 'studio-tool-input',
            file: entry.inputFiles[0],
            files: entry.inputFiles,
          },
          location.origin
        );
        entry.state = 'Opening selected files…';
      } else if (
        host.hasPdf(id) &&
        !conversionTo.includes(entry.tool) &&
        entry.tool !== 'pdf-workflow'
      ) {
        entry.state = 'Preparing current PDF…';
        try {
          const file = await host.snapshot(
            id,
            [
              'digital-sign-pdf',
              'validate-signature-pdf',
              'timestamp-pdf',
            ].includes(entry.tool)
          );
          entry.sourceName = file.name;
          usedFrames.add(id);
          entry.frame.contentWindow?.postMessage(
            { type: 'studio-tool-input', file },
            location.origin
          );
          entry.state = 'Opening current PDF…';
        } catch (error) {
          entry.state =
            error instanceof Error
              ? error.message
              : 'Could not prepare document.';
        }
      } else
        entry.state =
          entry.tool === 'pdf-workflow'
            ? 'Build your workflow below.'
            : 'Choose a source file below.';
      if (host.activeId() === id) sync();
    }
    if (event.data.type === 'studio-tool-input-received') {
      entry.state = entry.sourceName
        ? 'Selected: ' + entry.sourceName
        : 'Source selected.';
      if (host.activeId() === id) sync();
    }
    if (
      event.data.type === 'studio-tool-source' &&
      event.data.file instanceof File
    ) {
      usedFrames.add(id);
      const file = event.data.file;
      entry.sourceName = file.name;
      entry.state = 'Source selected: ' + file.name;
      if (host.activeId() === id) sync();
      if (
        !host.hasPdf(id) &&
        (file.type === 'application/pdf' || /\.pdf$/i.test(file.name))
      ) {
        try {
          await host.attach(id, file);
        } catch {
          entry.state = 'Could not display this file in the viewer.';
          sync();
        }
      }
    }
    if (
      event.data.type === 'studio-tool-output' &&
      event.data.blob instanceof Blob
    ) {
      try {
        await outputHost.result(
          new File(
            [event.data.blob],
            event.data.name === entry.sourceName &&
              /\.pdf$/i.test(event.data.name)
              ? event.data.name.replace(/\.pdf$/i, '') +
                  ' - ' +
                  engines.get(entry.tool)!.name +
                  '.pdf'
              : String(event.data.name || 'result.pdf'),
            {
              type: event.data.blob.type,
            }
          )
        );
      } catch (error) {
        host.status(describeWorkspaceError(error, 'open').message);
      }
    }
  });
  document.getElementById('document-tools-back')!.onclick = () => {
    selections.delete(host.activeId());
    groupSelections.delete(host.activeId());
    activeFrames.delete(host.activeId());
    sync();
  };
  document
    .getElementById('document-tools-search')!
    .addEventListener('input', (event) => {
      query = (event.target as HTMLInputElement).value.toLowerCase();
      renderCatalog();
    });
  renderCatalog();
  return {
    select,
    sync,
    toggle() {
      const id = host.activeId();
      if (collapsed.has(id)) collapsed.delete(id);
      else collapsed.add(id);
      sync();
    },
    close() {
      collapsed.add(host.activeId());
      sync();
    },
    chooseSource() {
      const id = host.activeId();
      if (groupSelections.get(id)?.id === 'convert') {
        chooseConversion(id);
        return;
      }
      const instance = nativePanels.get(`${id}:${selections.get(id)}`);
      const input =
        instance?.root.querySelector<HTMLInputElement>('input[type=file]');
      if (input) {
        input.value = '';
        input.click();
        return;
      }
      const entry = frames.get(activeFrames.get(id) ?? '');
      const embeddedInput =
        entry?.frame.contentDocument?.querySelector<HTMLInputElement>(
          'input[type=file]'
        );
      if (embeddedInput) {
        embeddedInput.value = '';
        embeddedInput.click();
        return;
      }
      uploadTask = id;
      upload.value = '';
      upload.click();
    },
    hasWork(id: string) {
      return (
        usedFrames.has(id) ||
        [...nativePanels].some(
          ([key, instance]) =>
            key.startsWith(id + ':') && !!instance.sourceFiles?.().length
        )
      );
    },
    remove(id: string) {
      collapsed.delete(id);
      conversionFiles.delete(id);
      visitedDocuments.delete(id);
      usedFrames.delete(id);
      selections.delete(id);
      groupSelections.delete(id);
      activeFrames.delete(id);
      for (const [key, instance] of nativePanels)
        if (key.startsWith(id + ':')) {
          instance.dispose();
          nativePanels.delete(key);
        }
      for (const [key, entry] of frames)
        if (entry.documentId === id) {
          entry.frame.remove();
          frames.delete(key);
        }
    },
  };
}
