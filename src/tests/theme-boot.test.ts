import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const source = readFileSync(
  resolve(__dirname, '../../public/theme-boot.js'),
  'utf8'
);

function boot(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: dark }))
  );
  window.matchMedia = globalThis.matchMedia;
  new Function(source)();
}

describe('theme-boot', () => {
  afterEach(() => {
    const root = document.documentElement;
    delete root.dataset.studioTheme;
    root.style.colorScheme = '';
    root.className = '';
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('follows the system theme before any module runs', () => {
    boot(true);
    expect(document.documentElement.dataset.studioTheme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('prefers the saved appearance over the system theme', () => {
    localStorage.setItem('pdf-studio-theme', 'light');
    boot(true);
    expect(document.documentElement.dataset.studioTheme).toBe('light');
  });

  it('does not mark top-level pages as embedded tools', () => {
    boot(false);
    expect(
      document.documentElement.classList.contains('workspace-embedded-tool')
    ).toBe(false);
  });
});
