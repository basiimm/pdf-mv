import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  openToolLauncher,
  readRecentTools,
  rememberTool,
  searchTools,
} from './tool-launcher.js';

afterEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
});

describe('tool launcher', () => {
  it('ranks tools whose name starts with the query first', () => {
    const results = searchTools('compress');
    expect(results[0].id).toBe('compress-pdf');
    expect(searchTools('word').some((r) => r.id === 'word-to-pdf')).toBe(true);
    expect(searchTools('zzzz-nothing')).toEqual([]);
  });

  it('keeps five unique recent tools, newest first', () => {
    for (const id of ['a', 'b', 'c', 'a', 'd', 'e', 'f']) rememberTool(id);
    expect(readRecentTools()).toEqual(['f', 'e', 'd', 'a', 'c']);
  });

  it('selects the highlighted result with the keyboard and remembers it', () => {
    const selectTool = vi.fn();
    openToolLauncher({
      selectTool,
      openDocuments: () => [{ id: 'd1', name: 'Contract.pdf' }],
      activateDocument: vi.fn(),
      chooseFiles: vi.fn(),
      browseAllTools: vi.fn(),
    });
    const input =
      document.querySelector<HTMLInputElement>('[role="combobox"]')!;
    input.value = 'merge';
    input.dispatchEvent(new Event('input'));
    const first = document.querySelector(
      '[role="option"][aria-selected="true"]'
    );
    expect(first?.textContent).toContain('Merge');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(selectTool).toHaveBeenCalledTimes(1);
    expect(readRecentTools()[0]).toBe(selectTool.mock.calls[0][0]);
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('switches to open documents and offers a way forward when nothing matches', () => {
    const activateDocument = vi.fn();
    const browseAllTools = vi.fn();
    openToolLauncher({
      selectTool: vi.fn(),
      openDocuments: () => [{ id: 'd1', name: 'Contract.pdf' }],
      activateDocument,
      chooseFiles: vi.fn(),
      browseAllTools,
    });
    const input =
      document.querySelector<HTMLInputElement>('[role="combobox"]')!;
    input.value = 'contract';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(activateDocument).toHaveBeenCalledWith('d1');
    openToolLauncher({
      selectTool: vi.fn(),
      openDocuments: () => [],
      activateDocument,
      chooseFiles: vi.fn(),
      browseAllTools,
    });
    const again =
      document.querySelector<HTMLInputElement>('[role="combobox"]')!;
    again.value = 'qwerty';
    again.dispatchEvent(new Event('input'));
    const browse = [...document.querySelectorAll('button')].find(
      (b) => b.textContent === 'Browse all tools'
    )!;
    browse.click();
    expect(browseAllTools).toHaveBeenCalled();
  });
});
