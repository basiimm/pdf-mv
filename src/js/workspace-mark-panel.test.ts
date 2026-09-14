import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ToolHost } from './workspace-tools.js';
import { createMarkPanel } from './workspace-mark-panel.js';

vi.mock('./workspace-page-marks.js', () => ({
  applyPageMarks: vi.fn(async () => new Uint8Array([1])),
}));
vi.mock('./utils/setup-pdf-worker.js', () => ({}));
const engine = vi.hoisted(() => ({
  destroy: vi.fn(async () => {}),
  cancel: vi.fn(),
  getPage: vi.fn(),
}));
vi.mock('pdfjs-dist', () => ({
  getDocument: () => ({
    destroy: engine.destroy,
    promise: Promise.resolve({ numPages: 2, getPage: engine.getPage }),
  }),
}));

function sourceFile() {
  return {
    name: 'source.pdf',
    arrayBuffer: async () => new ArrayBuffer(1),
  } as File;
}
function host(snapshot = async () => sourceFile()) {
  return {
    hasPdf: () => true,
    snapshot,
    result: vi.fn(async () => {}),
    attach: vi.fn(),
    status: vi.fn(),
    commit: vi.fn(async () => {}),
    canUndoCommit: vi.fn(() => false),
    undoCommit: vi.fn(async () => null),
  } as unknown as ToolHost;
}
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('mark preview lifecycle', () => {
  it('discards a preview cancelled while its source is loading', async () => {
    let resolve!: (file: File) => void;
    const source = new Promise<File>((r) => {
      resolve = r;
    });
    const panel = createMarkPanel(
      host(() => source),
      'doc',
      'add-watermark',
      vi.fn()
    );
    document.body.append(panel.root);
    panel.root
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    [...panel.root.querySelectorAll('button')]
      .find((button) => button.textContent === 'Cancel preview')!
      .click();
    resolve(sourceFile());
    await settle();
    expect(panel.isPreviewActive()).toBe(false);
    expect(panel.canvasRoot.hidden).toBe(true);
    panel.dispose();
  });
  it('restores the original on input and destroys the temporary PDF', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    engine.getPage.mockResolvedValue({
      getViewport: () => ({ width: 100, height: 150 }),
      render: () => ({ promise: Promise.resolve(), cancel: engine.cancel }),
    });
    const panel = createMarkPanel(host(), 'doc', 'add-watermark', vi.fn());
    document.body.append(panel.root, panel.canvasRoot);
    panel.root
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(panel.isPreviewActive()).toBe(true);
    panel.root
      .querySelector('input[type="text"]')!
      .dispatchEvent(new Event('input', { bubbles: true }));
    expect(panel.isPreviewActive()).toBe(false);
    expect(engine.destroy).toHaveBeenCalled();
    panel.dispose();
    expect(panel.canvasRoot.isConnected).toBe(false);
  });
});
