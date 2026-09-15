// Stylesheet and initial theme are injected into <head> by the studio-boot Vite plugin.
import { palette, type ThemeName } from '../design-system/tokens.js';

type Preference = 'system' | 'light' | 'dark';
const key = 'pdf-studio-theme';
const system = window.matchMedia('(prefers-color-scheme: dark)');
let preference: Preference = 'system';
try {
  const saved = localStorage.getItem(key);
  if (saved === 'light' || saved === 'dark') preference = saved;
} catch {
  /* The theme still works when storage is unavailable. */
}
const controls = new Set<HTMLSelectElement>();
export function resolvedTheme(): 'light' | 'dark' {
  return preference === 'system'
    ? system.matches
      ? 'dark'
      : 'light'
    : preference;
}
function viewerPalette(theme: ThemeName) {
  const t = palette[theme];
  return {
    accent: {
      primary: t['accent-fill'],
      primaryHover: t['accent-fill-hover'],
      primaryActive: t['accent-fill-hover'],
      primaryLight: t.selected,
      primaryForeground: t['on-accent'],
    },
    background: {
      app: t.canvas,
      surface: t.surface,
      surfaceAlt: t.bg,
      elevated: t.raised,
      input: theme === 'dark' ? t.inset : t.surface,
    },
    foreground: {
      primary: t.text,
      secondary: t['text-muted'],
      muted: t['text-muted'],
      disabled: t['text-disabled'],
      onAccent: t['on-accent'],
    },
    border: {
      default: t.border,
      subtle: t['border-subtle'],
      strong: t['border-control'],
    },
    interactive: {
      hover: t.hover,
      active: t.active,
      selected: t.selected,
      focus: t['focus-ring'],
      focusRing: t['focus-ring'],
    },
    scrollbar: {
      track: t.surface,
      thumb: t['scrollbar-thumb'],
      thumbHover: t['border-control'],
    },
    tooltip: { background: t['tooltip-bg'], foreground: t['tooltip-text'] },
  };
}
export function viewerTheme() {
  return {
    preference: resolvedTheme(),
    light: viewerPalette('light'),
    dark: viewerPalette('dark'),
  };
}
function applyTheme(): void {
  document.documentElement.dataset.studioTheme = resolvedTheme();
  document.documentElement.style.colorScheme = resolvedTheme();
  for (const control of controls) control.value = preference;
  document
    .querySelectorAll<HTMLButtonElement>('[data-theme-choice]')
    .forEach((button) => {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.themeChoice === preference)
      );
    });
  document.querySelectorAll('embedpdf-container').forEach((viewer) => {
    (
      viewer as HTMLElement & {
        setTheme?: (theme: ReturnType<typeof viewerTheme>) => void;
      }
    ).setTheme?.(viewerTheme());
  });
  window.dispatchEvent(new Event('studio-theme-change'));
}
export function createThemeControl(): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'studio-theme-control';
  const caption = document.createElement('span');
  caption.textContent = 'Appearance';
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Appearance');
  for (const [value, text] of [
    ['system', 'System'],
    ['light', 'Light'],
    ['dark', 'Dark'],
  ]) {
    select.add(new Option(text, value));
  }
  select.value = preference;
  select.addEventListener('change', () => {
    preference = select.value as Preference;
    try {
      localStorage.setItem(key, preference);
    } catch {
      /* Session preference is sufficient. */
    }
    applyTheme();
  });
  controls.add(select);
  label.append(caption, select);
  return label;
}
system.addEventListener('change', () => {
  if (preference === 'system') applyTheme();
});
window.addEventListener('storage', (event) => {
  if (event.key !== key) return;
  preference =
    event.newValue === 'light' || event.newValue === 'dark'
      ? event.newValue
      : 'system';
  applyTheme();
});
applyTheme();
// Viewer instances are lazy-loaded by several independent tool controllers.
new MutationObserver((records) => {
  if (
    records.some((record) =>
      Array.from(record.addedNodes).some(
        (node) =>
          node instanceof Element &&
          (node.matches('embedpdf-container') ||
            node.querySelector('embedpdf-container'))
      )
    )
  )
    applyTheme();
}).observe(document.body, { childList: true, subtree: true });

function createAppearanceIcons(): HTMLElement {
  const group = document.createElement('div');
  group.className = 'appearance-icons';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Appearance');
  const icons: [Preference, string, string][] = [
    [
      'light',
      'Light',
      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    ],
    [
      'dark',
      'Dark',
      '<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>',
    ],
    [
      'system',
      'Auto',
      '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
    ],
  ];
  for (const [value, name, path] of icons) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.themeChoice = value;
    button.setAttribute('aria-label', `${name} appearance`);
    button.setAttribute('aria-pressed', String(preference === value));
    button.title =
      name === 'Auto' ? 'Auto — follow your device' : `${name} appearance`;
    button.innerHTML = `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
    button.addEventListener('click', () => {
      preference = value;
      try {
        localStorage.setItem(key, value);
      } catch {
        /* Keep session preference. */
      }
      applyTheme();
    });
    group.append(button);
  }
  return group;
}
const favicon =
  document.querySelector<HTMLLinkElement>('link[rel="icon"]') ??
  document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/svg+xml';
favicon.href = `${import.meta.env.BASE_URL}brand/favicon.svg`;
if (!favicon.isConnected) document.head.append(favicon);

const workspaceTabs = document.querySelector('.tab-strip');
if (workspaceTabs) {
  document
    .getElementById('sidebar-appearance')
    ?.append(createAppearanceIcons());
  const mobile = createAppearanceIcons();
  mobile.classList.add('appearance-mobile');
  document.querySelector('.home-footer')?.append(mobile);
} else if (
  document.querySelector('#tool-uploader, #uploader') ||
  /\/src\/pages\//.test(location.pathname) ||
  /\/(form-creator|pdf-workflow|markdown-to-pdf|pdf-multi-tool)\.html$/.test(
    location.pathname
  )
) {
  document.body.dataset.studioTool = '';
  const nav = document.createElement('nav');
  nav.className = 'studio-tool-nav';
  nav.setAttribute('aria-label', 'PDF.mv workspace');
  const home = document.createElement('a');
  home.href = `${import.meta.env.BASE_URL}workspace.html`;
  home.textContent = '⌂  Home';
  const current = document.createElement('span');
  current.className = 'studio-current-tool';
  current.setAttribute('aria-current', 'page');
  current.textContent =
    document.querySelector('h1')?.textContent?.trim() || 'PDF tool';
  document.title = `${current.textContent} — PDF.mv`;
  nav.append(home, current, createThemeControl());
  document.body.prepend(nav);
  const credits = document.createElement('a');
  credits.className = 'studio-tool-credits';
  credits.href = `${import.meta.env.BASE_URL}licensing.html`;
  credits.textContent = 'Built on BentoPDF · AGPL-3.0 · Source';
  document.body.append(credits);
  const back = document.getElementById('back-to-tools');
  back?.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      location.assign(home.href);
    },
    true
  );
}
