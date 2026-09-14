import { describe, it, expect, vi } from 'vitest';
import { setupWorkspaceTools, type ToolHost } from './workspace-tools';
import { groups, engines } from './config/workspace-catalog';
function fixture() {
  document.body.innerHTML = `<aside id="workspace-tools"><h2 id="document-tool-title"></h2><button id="document-tools-back"></button><input id="document-tools-search"><div id="document-tool-list"></div></aside><button id="editor-tools"><span></span></button><div class="document-canvas-area"><div id="pdf-viewer"></div><div id="tool-empty-canvas"></div></div><button id="download-document"></button>`;
  let active = 'home';
  let count = 0;
  const host: ToolHost = {
    activeId: () => active,
    placeSignature: vi.fn(async () => {}),
    cancelSignature: vi.fn(),
    hasPdf: vi.fn(() => false),
    revision: () => 0,
    createTask: vi.fn(() => (active = `task-${++count}`)),
    snapshot: vi.fn(),
    attach: vi.fn(),
    result: vi.fn(),
    status: vi.fn(),
    commit: vi.fn(async () => {}),
    canUndoCommit: vi.fn(() => false),
    undoCommit: vi.fn(async () => null),
    showPreview: vi.fn(async () => {}),
    applyPreview: vi.fn(async () => {}),
    cancelPreview: vi.fn(async () => {}),
    isPreviewing: vi.fn(() => false),
    editMode: vi.fn(async () => {}),
  };
  return { host, controller: setupWorkspaceTools(host), active: () => active };
}
describe('workspace tool navigation', () => {
  it('returns from the embedded text editor without reloading or removing its draft', async () => {
    const { controller, host } = fixture();
    await controller.select('edit-pdf-text', true);
    vi.mocked(host.hasPdf).mockReturnValue(true);
    const frame = document.querySelector('iframe')!;
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: location.origin,
        source: frame.contentWindow,
        data: { type: 'studio-tool-back' },
      })
    );
    expect(document.getElementById('pdf-viewer')!.hidden).toBe(false);
    expect(frame.hidden).toBe(true);
    await controller.select('edit-pdf-text');
    expect(document.querySelector('iframe')).toBe(frame);
    expect(frame.hidden).toBe(false);
  });

  it('starts conversion with file selection rather than format menus', async () => {
    const { controller } = fixture();
    await controller.select('convert', true);
    expect(
      document.querySelector('.workspace-group-controls')?.textContent
    ).toContain('Choose files to convert');
    expect(
      document.querySelector('.workspace-group-controls select')
    ).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
  });
  it('routes selected images into native conversion without another upload', async () => {
    const { controller, host } = fixture();
    await controller.select('convert', true);
    controller.chooseSource();
    const input = document.querySelector<HTMLInputElement>(
      '[data-conversion-source]'
    )!;
    Object.defineProperty(input, 'files', {
      value: [new File(['image'], 'page.png', { type: 'image/png' })],
    });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() =>
      expect(document.querySelector('.ds-file-row')?.textContent).toContain(
        'page.png'
      )
    );
    expect(
      document.querySelector('.workspace-group-controls')?.textContent
    ).toContain('Detected: PNG');
    expect(host.createTask).toHaveBeenCalledTimes(1);
    expect(controller.hasWork('task-1')).toBe(true);
  });
  it('shows native Merge in the central area and restores the viewer when switching tools', async () => {
    const { controller, host } = fixture();
    await controller.select('merge', true);
    expect(
      document.querySelector('.native-merge-canvas')?.parentElement?.className
    ).toBe('document-canvas-area');
    expect(document.querySelector('iframe')).toBeNull();
    vi.mocked(host.hasPdf).mockReturnValue(true);
    await controller.select('rotate-pdf');
    expect(
      (document.querySelector('.native-merge-canvas') as HTMLElement).hidden
    ).toBe(true);
    expect(document.getElementById('pdf-viewer')!.hidden).toBe(false);
  });
  it('creates a new task for every Home group and removes its controls on close', async () => {
    const { host, controller, active } = fixture();
    for (const group of groups) {
      await controller.select(group.id, true);
      expect(document.getElementById('document-tool-title')?.textContent).toBe(
        group.name
      );
      controller.remove(active());
    }
    expect(host.createTask).toHaveBeenCalledTimes(groups.length);
    expect(host.status).not.toHaveBeenCalled();
  });
  it('routes every original tool name without opening extra tasks inside a document', async () => {
    const { host, controller } = fixture();
    await controller.select('convert', true);
    for (const id of engines.keys()) await controller.select(id);
    expect(host.createTask).toHaveBeenCalledTimes(1);
    expect(host.status).not.toHaveBeenCalled();
  });
  it('keeps migrated tools in the PDF view without a legacy options page', async () => {
    const { controller } = fixture();
    await controller.select('extract-pages', true);
    expect(document.querySelector('.workspace-mode-switch')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
  });
  it('retains advanced controls for native features without creating another task', async () => {
    const { controller, host } = fixture();
    await controller.select('header-footer', true);
    const more = document.querySelector(
      '.workspace-mode-switch'
    ) as HTMLButtonElement;
    expect(more.textContent).toBe('More options');
    more.click();
    const frame = document.querySelector('iframe')!;
    expect(frame.src).toContain('header-footer.html');
    expect(frame.hidden).toBe(false);
    (
      document.querySelector('.workspace-mode-switch') as HTMLButtonElement
    ).click();
    expect(frame.hidden).toBe(true);
    expect(host.createTask).toHaveBeenCalledTimes(1);
  });
  it('hides previous embedded controls when switching to a native feature', async () => {
    const { controller } = fixture();
    await controller.select('bookmark', true);
    const frame = document.querySelector('iframe')!;
    expect(frame.hidden).toBe(false);
    await controller.select('rotate-pdf');
    expect(frame.hidden).toBe(true);
    const native = document.querySelector('.ds-tool-panel') as HTMLElement;
    expect(native.hidden).toBe(false);
    controller.toggle();
    expect(document.getElementById('workspace-tools')!.hidden).toBe(true);
    controller.toggle();
    expect(document.getElementById('workspace-tools')!.hidden).toBe(false);
  });
  it('opens signing in the default viewer with a sidebar PDF picker', async () => {
    const { controller, host } = fixture();
    await controller.select('signatures', true);
    const panel = document.querySelector('.signature-panel')!;
    expect(panel.closest('#workspace-tools')).not.toBeNull();
    expect(panel.textContent).toContain('Open PDF');
    expect(document.querySelector('iframe')).toBeNull();
    vi.mocked(host.hasPdf).mockReturnValue(true);
    controller.sync();
    expect(document.getElementById('pdf-viewer')!.hidden).toBe(false);
    expect(document.getElementById('download-document')!.hidden).toBe(false);
    expect(panel.textContent).toContain('Place signature');
    await controller.select('rotate-pdf');
    expect(host.cancelSignature).toHaveBeenCalled();
  });
  it('keeps certificate signing, validation and timestamp settings beside the viewer', async () => {
    const { controller, host } = fixture();
    vi.mocked(host.hasPdf).mockReturnValue(true);
    for (const tool of [
      'digital-sign-pdf',
      'validate-signature-pdf',
      'timestamp-pdf',
    ]) {
      await controller.select(tool, true);
      const panel = document.querySelector(
        `.ds-tool-panel[data-tool="${tool}"]`
      )!;
      expect(panel.closest('#workspace-tools')).not.toBeNull();
      expect(document.querySelector('iframe:not([hidden])')).toBeNull();
      expect(document.getElementById('pdf-viewer')!.hidden).toBe(false);
      expect(document.getElementById('download-document')!.hidden).toBe(false);
    }
  });
});
