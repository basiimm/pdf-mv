import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ToolHost } from '../workspace-tools.js';
import { createToolPanel } from './panel.js';
import type { ToolDefinition } from './types.js';

const pdf = (name = 'doc.pdf') =>
  new File(['%PDF'], name, { type: 'application/pdf' });
const flush = async (times = 4) => {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
};

function host(overrides: Partial<ToolHost> = {}) {
  return {
    hasPdf: () => true,
    revision: () => 0,
    snapshot: vi.fn(async () => pdf()),
    result: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    undoCommit: vi.fn(async () => null),
    showPreview: vi.fn(async () => {}),
    applyPreview: vi.fn(async () => {}),
    cancelPreview: vi.fn(async () => {}),
    isPreviewing: vi.fn(() => false),
    status: vi.fn(),
    ...overrides,
  } as unknown as ToolHost;
}

function tool(overrides: Partial<ToolDefinition>): ToolDefinition {
  return {
    id: 'test-tool',
    description: 'Test tool.',
    fields: [],
    primaryLabel: 'Run test',
    doneLabel: 'Test done',
    output: 'revision',
    run: vi.fn(async () => pdf('out.pdf')),
    ...overrides,
  };
}

const primary = (root: HTMLElement) =>
  root.querySelector<HTMLButtonElement>(
    '.ds-tool-panel__footer [data-variant="accent"]'
  )!;

afterEach(() => document.body.replaceChildren());

describe('tool panel', () => {
  it('prefills values, shows details and builds document-specific fields', async () => {
    const run = vi.fn(async () => pdf('filled.pdf'));
    const definition = tool({
      fields: [{ key: 'title', label: 'Title', value: '' }],
      inspect: async () => ({
        values: { title: 'Annual report', name: 'Ada' },
        details: [['Pages', '12']],
        fields: [{ key: 'name', label: 'Name', value: '' }],
      }),
      run,
    });
    const workspace = host();
    const panel = createToolPanel(workspace, 'doc', definition, vi.fn());
    document.body.append(panel.root);
    await flush();
    const inputs = panel.root.querySelectorAll<HTMLInputElement>('input');
    expect([...inputs].map((i) => i.value)).toEqual(['Annual report', 'Ada']);
    expect(panel.root.querySelector('.ds-details')?.textContent).toBe(
      'Pages12'
    );
    primary(panel.root).click();
    await flush(8);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        values: { title: 'Annual report', name: 'Ada' },
      })
    );
    expect(workspace.commit).toHaveBeenCalledWith(
      'doc',
      expect.any(File),
      'Test done'
    );
  });

  it('requires extra files and passes them after the open PDF', async () => {
    const run = vi.fn(async ({ files }: { files: File[] }) => files[0]);
    const definition = tool({
      extraInput: { accept: '*/*', multiple: true, label: 'Choose files' },
      run: run as unknown as ToolDefinition['run'],
    });
    const panel = createToolPanel(host(), 'doc', definition, vi.fn());
    document.body.append(panel.root);
    expect(primary(panel.root).disabled).toBe(true);
    const attachment = new File(['x'], 'notes.txt');
    panel.setFiles([attachment]);
    expect(primary(panel.root).disabled).toBe(false);
    primary(panel.root).click();
    await flush(8);
    expect(run.mock.calls[0][0].files.map((f: File) => f.name)).toEqual([
      'doc.pdf',
      'notes.txt',
    ]);
  });

  it('downloads non-PDF output instead of replacing the document', async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:x',
      revokeObjectURL: () => {},
    });
    const workspace = host();
    const panel = createToolPanel(
      workspace,
      'doc',
      tool({ output: 'download', run: async () => new File(['a'], 'a.csv') }),
      vi.fn()
    );
    document.body.append(panel.root);
    primary(panel.root).click();
    await flush(8);
    expect(click).toHaveBeenCalled();
    expect(workspace.commit).not.toHaveBeenCalled();
    expect(panel.root.querySelector('.ds-result')).not.toBeNull();
    vi.unstubAllGlobals();
    click.mockRestore();
  });
});
