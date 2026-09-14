import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ToolHost } from './workspace-tools.js';
import { createActionPanel } from './workspace-action-panel.js';
import { createSignaturePanel } from './workspace-signature-panel.js';
const run = vi.hoisted(() => vi.fn());
vi.mock('./workspace-actions.js', () => ({
  nativeActions: {
    'rotate-pdf': {
      description: 'Rotate',
      fields: [{ key: 'pages', label: 'Pages', value: '' }],
    },
  },
  runNativeAction: run,
  imagesToPdf: vi.fn(),
}));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function host() {
  return {
    hasPdf: () => true,
    snapshot: vi.fn(async () => ({ name: 'source.pdf' })),
    result: vi.fn(async () => {}),
    cancelSignature: vi.fn(),
  } as unknown as ToolHost;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('panel error recovery', () => {
  it('retries an engine failure with the existing source and settings', async () => {
    run
      .mockRejectedValueOnce(
        new Error(
          'Failed to fetch dynamically imported module: https://example.test/engine.js'
        )
      )
      .mockResolvedValueOnce(
        new File(['result'], 'result.pdf', { type: 'application/pdf' })
      );
    const panel = createActionPanel(host(), 'doc', 'rotate-pdf', vi.fn());
    document.body.append(panel.root);
    const pages = panel.root.querySelector(
      'input[type="text"]'
    ) as HTMLInputElement;
    pages.value = '2-3';
    panel.root
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await tick();
    const retry = [...panel.root.querySelectorAll('button')].find(
      (button) => button.textContent === 'Retry engine loading'
    )!;
    expect(retry).toBeDefined();
    expect(
      panel.root.querySelector('[role="status"] .ds-alert__message')!
        .textContent
    ).not.toContain('https://');
    retry.click();
    await tick();
    expect(run).toHaveBeenLastCalledWith(expect.anything(), 'rotate-pdf', {
      pages: '2-3',
    });
    expect(pages.value).toBe('2-3');
    panel.dispose();
  });
  it('offers an explicit font retry while retaining the typed signature', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.stubGlobal(
      'FontFace',
      class {
        load() {
          return Promise.reject(
            new Error('Font fetch failed at https://example.test/font.ttf')
          );
        }
      }
    );
    const panel = createSignaturePanel(host(), 'doc', vi.fn());
    document.body.append(panel.root);
    [...panel.root.querySelectorAll('button')]
      .find((button) => button.textContent === 'Type')!
      .click();
    const name = panel.root.querySelector(
      'input[type="text"]'
    ) as HTMLInputElement;
    name.value = 'Basim';
    name.dispatchEvent(new Event('input'));
    await tick();
    expect(
      [...panel.root.querySelectorAll('button')].some(
        (button) => button.textContent === 'Retry font loading'
      )
    ).toBe(true);
    expect(name.value).toBe('Basim');
    expect(
      panel.root.querySelector('[role="status"] .ds-alert__message')!
        .textContent
    ).not.toContain('https://');
    panel.dispose();
  });
});
