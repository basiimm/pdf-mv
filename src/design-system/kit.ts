// Living reference for the PDF.mv Studio kit (dev only: /src/design-system/kit.html).
import {
  badge,
  button,
  checkbox,
  dialog,
  disclosure,
  dropZone,
  el,
  emptyState,
  fileRow,
  iconButton,
  inlineAlert,
  pageThumb,
  panelSkeleton,
  progress,
  resultCard,
  segmented,
  selectField,
  slider,
  textField,
  toast,
  toolPanel,
} from './ui/index.js';

const kit = document.getElementById('kit')!;
const close =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

function section(title: string, ...children: Node[]) {
  kit.append(el('section', {}, [el('h2', { text: title }), ...children]));
}
const row = (...children: Node[]) => el('div', { className: 'row' }, children);
const grid = (...children: Node[]) =>
  el('div', { className: 'grid' }, children);
const surface = (...children: Node[]) =>
  el('div', { className: 'surface' }, children);

const theme = segmented({
  label: 'Appearance',
  options: [
    ['system', 'Auto'],
    ['light', 'Light'],
    ['dark', 'Dark'],
  ],
  value: localStorage.getItem('pdf-studio-theme') ?? 'system',
  onChange(value) {
    localStorage.setItem('pdf-studio-theme', value);
    if (value === 'system') delete document.documentElement.dataset.studioTheme;
    else document.documentElement.dataset.studioTheme = value;
  },
});
kit.append(
  el('header', {}, [el('h1', { text: 'PDF.mv Studio kit' }), theme.root])
);

section(
  'Color tokens',
  el(
    'div',
    { className: 'swatches' },
    [
      'bg',
      'surface',
      'raised',
      'inset',
      'canvas',
      'text',
      'text-muted',
      'border',
      'border-control',
      'accent-fill',
      'accent-text',
      'selected',
      'negative',
      'notice',
      'informative',
      'positive',
    ].map((name) => {
      const chip = el('span');
      chip.style.background = `var(--ds-${name})`;
      return el('div', { className: 'swatch' }, [
        chip,
        el('code', { text: `--ds-${name}` }),
      ]);
    })
  )
);

section(
  'Buttons',
  row(
    button({ label: 'Merge PDFs', variant: 'accent' }),
    button({ label: 'Add files' }),
    button({ label: 'More options', variant: 'quiet' }),
    button({ label: 'Discard edits', variant: 'negative' }),
    iconButton({ label: 'Close', icon: close })
  ),
  row(
    button({ label: 'Small', size: 's' }),
    button({ label: 'Medium' }),
    button({ label: 'Large', size: 'l', variant: 'accent' }),
    (() => {
      const b = button({ label: 'Disabled' });
      b.disabled = true;
      return b;
    })(),
    (() => {
      const b = button({ label: 'Compressing…', variant: 'accent' });
      b.dataset.busy = 'true';
      return b;
    })()
  )
);

const invalid = textField({
  label: 'Pages',
  value: '1, 99',
  help: 'Blank means all pages',
});
invalid.setError('This document has 12 pages.');
section(
  'Fields',
  grid(
    surface(
      el('div', { className: 'grid' }, [
        textField({ label: 'Output file name', value: 'report-compressed.pdf' })
          .root,
        selectField({
          label: 'Quality',
          options: [
            ['balanced', 'Balanced'],
            ['small', 'Smallest file'],
            ['high', 'Best quality'],
          ],
          value: 'balanced',
        }).root,
        invalid.root,
        slider({
          label: 'Opacity',
          min: 0,
          max: 100,
          value: 60,
          format: (v) => `${v}%`,
        }).root,
      ])
    ),
    surface(
      checkbox({ label: 'Keep bookmarks', checked: true }).root,
      checkbox({ label: 'Flatten form fields' }).root,
      checkbox({ label: 'Apply to all pages', checked: true, switch: true })
        .root,
      segmented({
        label: 'Page scope',
        options: [
          ['all', 'All pages'],
          ['selected', 'Selected'],
          ['range', 'Range'],
        ],
        value: 'all',
        block: true,
      }).root
    )
  )
);

const p = progress({
  label: 'Compressing',
  value: 0.42,
  detail: 'Page 5 of 12',
  onCancel: () => toast('Cancelled. Your settings are kept.'),
});
section(
  'Feedback',
  grid(
    surface(
      p.root,
      el('div', { attrs: { style: 'height:16px' } }),
      progress({ label: 'Loading PDF engine' }).root
    ),
    inlineAlert({
      tone: 'negative',
      message: 'We could not read this PDF. Your other files are safe.',
      actions: [{ label: 'Choose another file', onClick: () => {} }],
      details: 'InvalidPDFException: No PDF header found',
    }),
    inlineAlert({
      tone: 'notice',
      message: 'Password-protected files are skipped until you unlock them.',
    }),
    inlineAlert({
      tone: 'positive',
      message: 'Edited copy opened in a new tab.',
    })
  ),
  row(
    button({ label: 'Show toast', onClick: () => toast('Download started') }),
    button({
      label: 'Confirm dialog',
      onClick: () =>
        void dialog({
          title: 'Close this document?',
          message: 'You have edits that are not downloaded yet.',
          confirmLabel: 'Close without saving',
          cancelLabel: 'Keep editing',
          tone: 'negative',
        }),
    })
  )
);

const file = new File([new Uint8Array(284000)], 'Quarterly report 2026.pdf', {
  type: 'application/pdf',
});
section(
  'Files and pages',
  grid(
    surface(
      dropZone({
        multiple: true,
        accept: '.pdf',
        hint: 'or drop PDFs here · files stay on this device',
        onFiles: (f) => toast(`${f.length} file(s) chosen`),
      }).root
    ),
    surface(
      el('ul', { className: 'ds-file-list' }, [
        fileRow({
          file,
          index: 0,
          total: 3,
          onMove: () => {},
          onRemove: () => {},
        }),
        fileRow({
          file: new File(['x'], 'Signed contract.pdf'),
          index: 1,
          total: 3,
          state: 'processing',
          onMove: () => {},
          onRemove: () => {},
        }),
        fileRow({
          file: new File(['x'], 'Scan 0042.pdf'),
          index: 2,
          total: 3,
          state: 'failed',
          onRetry: () => {},
          onRemove: () => {},
        }),
      ])
    ),
    surface(
      el(
        'div',
        { className: 'ds-page-grid' },
        [1, 2, 3].map((n) =>
          pageThumb({
            pageNumber: n,
            selected: n === 2,
            badge: n === 3 ? 'B' : undefined,
          })
        )
      )
    )
  )
);

const panel = toolPanel({
  title: 'Compress PDF',
  description: 'Reduce file size. Your original stays untouched.',
  onBack: () => toast('Back to tools'),
});
const advanced = disclosure({
  summary: 'Advanced',
  children: [
    checkbox({ label: 'Remove embedded thumbnails', checked: true }).root,
    checkbox({ label: 'Convert to grayscale' }).root,
  ],
});
panel.setBody(
  el('ul', { className: 'ds-file-list' }, [fileRow({ file })]),
  segmented({
    label: 'Compression',
    options: [
      ['balanced', 'Balanced'],
      ['strong', 'Strong'],
      ['light', 'Light'],
    ],
    value: 'balanced',
    block: true,
  }).root,
  advanced.root,
  resultCard({
    file,
    name: 'Quarterly report 2026-compressed.pdf',
    detail: '38% smaller',
    primary: { label: 'Open in new tab', onClick: () => {} },
    secondary: { label: 'Download', onClick: () => {} },
  })
);
panel.setFooter(
  button({ label: 'Compress PDF', variant: 'accent', size: 'l', block: true }),
  el('p', {
    className: 'ds-tool-panel__note',
    text: 'Runs on this device. The result opens in a new tab.',
  })
);

section(
  'Tool panel · empty state · skeleton',
  grid(
    el('div', { className: 'panel-frame' }, [panel.root]),
    el('div', { className: 'panel-frame' }, [
      emptyState({
        title: 'Open a PDF to compress',
        message: 'Choose a file or drop it here. Nothing is uploaded.',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/></svg>',
        primary: { label: 'Choose a PDF', onClick: () => {} },
      }),
    ]),
    el('div', { className: 'panel-frame' }, [panelSkeleton()])
  ),
  row(
    badge('12 pages'),
    badge('3 selected', 'accent'),
    el('kbd', { className: 'ds-kbd', text: '⌘K' })
  )
);
