import { describe, it, expect, vi } from 'vitest';
import { setupWorkspaceTools, type ToolHost } from './workspace-tools';
import { groups, engines } from './config/workspace-catalog';
function fixture() {
  document.body.innerHTML = `<aside id="workspace-tools"><h2 id="document-tool-title"></h2><button id="document-tools-back"></button><input id="document-tools-search"><div id="document-tool-list"></div></aside><button id="editor-tools"><span></span></button><div class="document-canvas-area"><div id="pdf-viewer"></div><div id="tool-empty-canvas"></div></div><button id="download-document"></button>`;
  let active = 'home';
  let count = 0;
  const host: ToolHost = {
    activeId: () => active,
    hasPdf: () => false,
    revision: () => 0,
    createTask: vi.fn(() => (active = `task-${++count}`)),
    snapshot: vi.fn(),
    attach: vi.fn(),
    result: vi.fn(),
    status: vi.fn(),
    editMode: vi.fn(async () => {}),
  };
  return { host, controller: setupWorkspaceTools(host), active: () => active };
}
describe('workspace tool navigation', () => {
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
  it('retains advanced controls for native features without creating another task', async () => {
    const { controller, host } = fixture();
    await controller.select('extract-pages', true);
    const more = document.querySelector(
      '.workspace-mode-switch'
    ) as HTMLButtonElement;
    expect(more.textContent).toBe('More options');
    more.click();
    const frame = document.querySelector('iframe')!;
    expect(frame.src).toContain('extract-pages.html');
    expect(frame.hidden).toBe(false);
    (
      document.querySelector('.workspace-mode-switch') as HTMLButtonElement
    ).click();
    expect(frame.hidden).toBe(true);
    expect(host.createTask).toHaveBeenCalledTimes(1);
  });
  it('hides previous embedded controls when switching to a native feature', async () => {
    const { controller } = fixture();
    await controller.select('compress-pdf', true);
    const frame = document.querySelector('iframe')!;
    expect(frame.hidden).toBe(false);
    await controller.select('rotate-pdf');
    expect(frame.hidden).toBe(true);
    const native = document.querySelector('.native-mark-panel') as HTMLElement;
    expect(native.hidden).toBe(false);
    controller.toggle();
    expect(document.getElementById('workspace-tools')!.hidden).toBe(true);
    controller.toggle();
    expect(document.getElementById('workspace-tools')!.hidden).toBe(false);
  });
});
