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
import { createMarkPanel } from './workspace-mark-panel.js';
import { createActionPanel } from './workspace-action-panel.js';
import { createSignaturePanel } from './workspace-signature-panel.js';
import { nativeActions } from './workspace-actions.js';

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
  const nativePanels = new Map<
    string,
    ReturnType<typeof createMarkPanel> & { sourceFiles?(): File[] }
  >();
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
  let uploadTask = '',
    query = '';
  // These engines require a large interactive canvas; settings-oriented tools keep the PDF visible.
  const canvasTools = new Set([
    'edit-pdf-text',
    'crop-pdf',
    'organize-pdf',
    'pdf-multi-tool',
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
      host.status(
        error instanceof Error ? error.message : 'Could not open this PDF.'
      );
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
      const toPdf = conversionTo.includes(chosen);
      dropdown(
        'Conversion',
        [
          ['to', 'Create a PDF'],
          ['from', 'Export a PDF'],
        ],
        toPdf ? 'to' : 'from',
        (direction) =>
          void openEngine(id, direction === 'to' ? 'jpg-to-pdf' : 'pdf-to-png')
      );
      dropdown(
        toPdf ? 'From format' : 'To format',
        (toPdf ? conversionTo : conversionFrom).map((key) => [
          key,
          formatName(key),
        ]),
        chosen,
        (key) => void openEngine(id, key)
      );
      const note = document.createElement('p');
      note.textContent = toPdf
        ? 'Output: PDF · Choose the format of your source file.'
        : 'Input: PDF · Uses this document when one is open.';
      controls.append(note);
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
    if (nativeActions[chosen] || chosen === 'header-footer') {
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
    panel.hidden = collapsed.has(id);
    const toggle = document.getElementById('editor-tools')!;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    toggle.setAttribute('aria-controls', 'workspace-tools');
    const label = toggle.querySelector('span');
    if (label)
      label.textContent = panel.hidden ? 'Show all tools' : 'Hide all tools';
    title.textContent = group?.name ?? 'Tools';
    document.getElementById('document-tools-back')!.hidden = !chosen;
    document.getElementById('document-tools-search')!.hidden = !!chosen;
    catalog.hidden = !!chosen;
    renderGroupControls(id);
    nativeEdit.hidden = !['edit-pdf', 'add-stamps'].includes(chosen ?? '');
    if (!nativeEdit.hidden) renderNativeEdit(id);
    for (const [key, instance] of nativePanels) {
      instance.root.hidden = key !== `${id}:${chosen}`;
      instance.sync();
    }
    const useCanvas = !!chosen && canvasTools.has(chosen);
    document.getElementById('pdf-viewer')!.hidden =
      useCanvas || !host.hasPdf(id);
    document.getElementById('tool-empty-canvas')!.hidden =
      useCanvas || host.hasPdf(id);
    document.getElementById('download-document')!.hidden = useCanvas;
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
          active.frame.src = active.frame.src;
          sync();
        };
        frameStatus.append(retry);
      }
    }
  }
  async function openEngine(id: string, toolId: string) {
    selections.set(id, toolId);
    activeFrames.delete(id);
    try {
      if (['edit-pdf', 'add-stamps'].includes(toolId)) {
        if (host.hasPdf(id)) await host.editMode(id, 'annotation-toolbar');
        sync();
        return;
      }
      const nativeKey = `${id}:${toolId}`;
      if (
        toolId === 'sign-pdf' ||
        toolId === 'add-watermark' ||
        toolId === 'header-footer' ||
        nativeActions[toolId]
      ) {
        if (!nativePanels.has(nativeKey)) {
          const instance =
            toolId === 'sign-pdf'
              ? createSignaturePanel(outputHost, id, sync)
              : toolId === 'add-watermark' || toolId === 'header-footer'
                ? createMarkPanel(outputHost, id, toolId, sync)
                : createActionPanel(outputHost, id, toolId, sync);
          nativePanels.set(nativeKey, instance);
          panel.append(instance.root);
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
        const url = new URL(tool.href, location.href);
        url.searchParams.set('workspace', '1');
        frame.src = url.href;
        frames.set(key, {
          frame,
          tool: tool.id,
          documentId: id,
          initialized: false,
          state: 'Loading controls…',
          inputFiles: toolId.startsWith('advanced:')
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
      host.status(
        error instanceof Error ? error.message : 'Could not open tool.'
      );
    }
  }
  async function select(request: string, fromHome = false, search = '') {
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
      toolId = host.hasPdf(id) ? 'pdf-to-png' : 'jpg-to-pdf';
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
    if (event.data.type === 'studio-tool-error') {
      entry.state = String(event.data.message);
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
        host.status(
          error instanceof Error ? error.message : 'Could not open the result.'
        );
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
    hasWork(id: string) {
      return usedFrames.has(id);
    },
    remove(id: string) {
      collapsed.delete(id);
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
