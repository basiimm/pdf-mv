// Watermark and header/footer: generated with pdf-lib and previewed live in the PDF view.
import { applyPageMarks, type PageMarks } from '../../workspace-page-marks.js';
import { registerTool } from '../registry.js';
import type { ToolField } from '../types.js';

const pages: ToolField = {
  key: 'pages',
  label: 'Pages',
  value: '',
  placeholder: 'All pages',
  help: 'Leave blank for all pages. Example: 1, 3-5',
};

function marks(
  kind: PageMarks['kind'],
  values: Record<string, string>
): PageMarks {
  return {
    kind,
    text: values.text ?? '',
    header: values.header ?? '',
    footer: values.footer ?? '',
    size: Number(values.size),
    opacity: Number(values.opacity ?? '100'),
    angle: Number(values.angle ?? '0'),
    color: values.color ?? '#555555',
    pages: values.pages ?? '',
    align: (values.align ?? 'center') as PageMarks['align'],
  };
}

export function register(): void {
  registerTool({
    id: 'add-watermark',
    description: 'Add a text watermark across your pages.',
    primaryLabel: 'Apply watermark',
    doneLabel: 'Watermark added',
    output: 'revision',
    preview: true,
    fields: [
      { key: 'text', label: 'Watermark text', value: 'CONFIDENTIAL' },
      pages,
      {
        key: 'opacity',
        label: 'Opacity (%)',
        value: '25',
        type: 'number',
        min: '1',
        max: '100',
        advanced: true,
      },
      {
        key: 'angle',
        label: 'Angle (degrees)',
        value: '45',
        type: 'number',
        min: '-180',
        max: '180',
        advanced: true,
      },
      {
        key: 'size',
        label: 'Font size (pt)',
        value: '48',
        type: 'number',
        min: '6',
        max: '144',
        advanced: true,
      },
      {
        key: 'color',
        label: 'Text color',
        value: '#555555',
        type: 'color',
        advanced: true,
      },
    ],
    async run({ files, values, progress }) {
      progress({ label: 'Adding watermark…' });
      const file = files[0];
      const bytes = await applyPageMarks(
        await file.arrayBuffer(),
        marks('add-watermark', values)
      );
      return new File([bytes], file.name, { type: 'application/pdf' });
    },
  });
  registerTool({
    id: 'header-footer',
    description: 'Add text and page numbers in the page margins.',
    primaryLabel: 'Apply header & footer',
    doneLabel: 'Header and footer added',
    output: 'revision',
    preview: true,
    fields: [
      { key: 'header', label: 'Header', value: '' },
      {
        key: 'footer',
        label: 'Footer',
        value: 'Page {page} of {total}',
        help: 'Use {page} for the page number and {total} for the page count.',
      },
      {
        key: 'align',
        label: 'Alignment',
        value: 'center',
        type: 'segmented',
        options: [
          ['left', 'Left'],
          ['center', 'Center'],
          ['right', 'Right'],
        ],
      },
      pages,
      {
        key: 'size',
        label: 'Font size (pt)',
        value: '10',
        type: 'number',
        min: '6',
        max: '144',
        advanced: true,
      },
      {
        key: 'color',
        label: 'Text color',
        value: '#555555',
        type: 'color',
        advanced: true,
      },
    ],
    async run({ files, values, progress }) {
      progress({ label: 'Adding header and footer…' });
      const file = files[0];
      const bytes = await applyPageMarks(
        await file.arrayBuffer(),
        marks('header-footer', values)
      );
      return new File([bytes], file.name, { type: 'application/pdf' });
    },
  });
}
