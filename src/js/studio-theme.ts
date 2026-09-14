import '../css/studio-theme.css';

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
export function viewerTheme() {
  return {
    preference: resolvedTheme(),
    light: {
      accent: {
        primary: '#1a7f37',
        primaryHover: '#197935',
        primaryActive: '#166b2e',
        primaryLight: '#e6f4ea',
        primaryForeground: '#ffffff',
      },
      background: {
        app: '#e9e9e9',
        surface: '#ffffff',
        surfaceAlt: '#f5f5f5',
        elevated: '#ffffff',
        input: '#ffffff',
      },
      foreground: {
        primary: '#242424',
        secondary: '#505050',
        muted: '#6b6b6b',
        disabled: '#999999',
        onAccent: '#ffffff',
      },
      border: { default: '#e3e3e3', subtle: '#ededed', strong: '#b8b8b8' },
      interactive: {
        hover: '#f0f0f0',
        active: '#e6e6e6',
        selected: '#e6f4ea',
        focus: '#1a7f37',
        focusRing: '#b8dfc2',
      },
      scrollbar: { track: '#f5f5f5', thumb: '#cccccc', thumbHover: '#999999' },
      tooltip: { background: '#242424', foreground: '#ffffff' },
    },
    dark: {
      accent: {
        primary: '#1a7f37',
        primaryHover: '#166b2e',
        primaryActive: '#145c28',
        primaryLight: '#203b29',
        primaryForeground: '#ffffff',
      },
      background: {
        app: '#101010',
        surface: '#202020',
        surfaceAlt: '#292929',
        elevated: '#292929',
        input: '#181818',
      },
      foreground: {
        primary: '#f2f2f2',
        secondary: '#d4d4d4',
        muted: '#b6b6b6',
        disabled: '#777777',
        onAccent: '#ffffff',
      },
      border: { default: '#303030', subtle: '#292929', strong: '#505050' },
      interactive: {
        hover: '#333333',
        active: '#3b3b3b',
        selected: '#203b29',
        focus: '#3fb950',
        focusRing: '#285c36',
      },
      scrollbar: { track: '#202020', thumb: '#505050', thumbHover: '#707070' },
      tooltip: { background: '#f2f2f2', foreground: '#202020' },
    },
  };
}
function applyTheme(): void {
  document.documentElement.dataset.studioTheme = resolvedTheme();
  document.documentElement.style.colorScheme = resolvedTheme();
  for (const control of controls) control.value = preference;
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

const workspaceTabs = document.querySelector('.tab-strip');
if (workspaceTabs) workspaceTabs.append(createThemeControl());
else if (
  document.querySelector('#tool-uploader, #uploader') ||
  /\/src\/pages\//.test(location.pathname) ||
  /\/(form-creator|pdf-workflow|markdown-to-pdf|pdf-multi-tool)\.html$/.test(
    location.pathname
  )
) {
  document.body.dataset.studioTool = '';
  const nav = document.createElement('nav');
  nav.className = 'studio-tool-nav';
  nav.setAttribute('aria-label', 'PDF workspace');
  const home = document.createElement('a');
  home.href = `${import.meta.env.BASE_URL}workspace.html`;
  home.textContent = '⌂  Home';
  const current = document.createElement('span');
  current.className = 'studio-current-tool';
  current.setAttribute('aria-current', 'page');
  current.textContent =
    document.querySelector('h1')?.textContent?.trim() || 'PDF tool';
  document.title = `${current.textContent} — PDF Studio`;
  nav.append(home, current, createThemeControl());
  document.body.prepend(nav);
  const credits = document.createElement('a');
  credits.className = 'studio-tool-credits';
  credits.href = `${import.meta.env.BASE_URL}licensing.html`;
  credits.textContent = 'Powered by BentoPDF';
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
