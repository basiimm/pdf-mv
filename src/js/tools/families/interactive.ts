// Tool definitions for the interactive family (crop, forms, layers, markdown). See docs/TOOL-MIGRATION-GUIDE.md.
//
// Engines are imported lazily inside each `run()`/`inspect()` — never
// statically at module scope. See families/exports.ts for why.
//
// Gaps against the legacy pages (reported alongside this change):
// - `crop-pdf` used to be a separate drag-to-crop canvas (cropperjs) with a
//   per-page "apply to all pages" toggle. The new tool crops live in the PDF
//   view via numeric edge margins applied uniformly to the selected pages;
//   drag handles in the viewer are a later improvement, and per-page crop
//   rectangles are dropped since there's no thumbnail grid to set them from.
// - `form-filler` used to embed the pdfjs viewer in an iframe and click its
//   native form/download controls (no real fill logic lived in the legacy
//   page). The new tool reads and writes AcroForm fields directly with
//   pdf-lib inside the panel.
// - `pdf-layers` used to be a full OCG editor (add/delete/reorder/nest
//   layers) backed by PyMuPDF. The new tool only toggles each existing
//   layer's default visibility, expressed as dynamic checkboxes from
//   `inspect().fields` — adding, deleting and nesting layers needs a tree UI
//   the shared panel doesn't provide.
// - `markdown-to-pdf` used to open a full editor page with live preview,
//   themes, and window.print() as the "export". The new tool takes Markdown
//   text in the panel and renders headlessly (markdown-it + html2canvas +
//   jsPDF); Mermaid diagrams, syntax highlighting and the editor-only
//   plugins (emoji, footnotes, task lists, TOC) are dropped since they need
//   the interactive editor's async render loop.
import { registerTool, busyLabel } from '../registry.js';
import type { ToolDefinition, ToolField } from '../types.js';

const pagesField: ToolField = {
  key: 'pages',
  label: 'Pages',
  value: '',
  placeholder: 'All pages',
  help: 'Leave blank for all pages. Example: 1, 3-5',
};

// ---------------------------------------------------------------------------
// Crop pages
// ---------------------------------------------------------------------------

const cropFields: ToolField[] = [
  {
    key: 'unit',
    label: 'Unit',
    value: 'percent',
    type: 'segmented',
    options: [
      ['percent', 'Percent'],
      ['mm', 'Millimeters'],
    ],
  },
  {
    key: 'top',
    label: 'Top',
    value: '0',
    type: 'number',
    min: '0',
    max: '45',
  },
  {
    key: 'right',
    label: 'Right',
    value: '0',
    type: 'number',
    min: '0',
    max: '45',
  },
  {
    key: 'bottom',
    label: 'Bottom',
    value: '0',
    type: 'number',
    min: '0',
    max: '45',
  },
  {
    key: 'left',
    label: 'Left',
    value: '0',
    type: 'number',
    min: '0',
    max: '45',
  },
  pagesField,
  {
    key: 'trimMediaBox',
    label: 'Also trim page size (MediaBox)',
    value: 'false',
    type: 'checkbox',
    advanced: true,
  },
];

// ---------------------------------------------------------------------------
// Fill form
// ---------------------------------------------------------------------------

const formFillerFields: ToolField[] = [
  {
    key: 'flatten',
    label: 'Flatten after filling',
    value: 'false',
    type: 'checkbox',
    advanced: true,
    help: 'Turns filled fields into permanent page content so they can no longer be edited.',
  },
];

// ---------------------------------------------------------------------------
// Markdown to PDF
// ---------------------------------------------------------------------------

// Kept in sync with SAMPLE_MARKDOWN in engines/markdown-to-pdf.ts. Duplicated
// (not imported) so this family file never statically imports the engine —
// see families/exports.ts for why.
const SAMPLE_MARKDOWN = `# Welcome to PDF.mv

A short tour of what this converter supports.

## Formatting

- **Bold**, *italic* and \`inline code\`
- Nested lists
  - Second level
- [Links](https://example.com)

## A table

| Feature | Supported |
|---------|:---------:|
| Headings | Yes |
| Lists | Yes |
| Tables | Yes |
| Code blocks | Yes |

## Code

\`\`\`js
function greet(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`

Start editing to make this your own document.
`;

const markdownFields: ToolField[] = [
  {
    key: 'markdown',
    label: 'Markdown',
    value: SAMPLE_MARKDOWN,
    type: 'textarea',
    help: 'Headings, lists, tables, links and code blocks are supported.',
  },
  {
    key: 'pageSize',
    label: 'Page size',
    value: 'a4',
    type: 'segmented',
    options: [
      ['a4', 'A4'],
      ['letter', 'Letter'],
    ],
  },
  {
    key: 'margin',
    label: 'Margin (mm)',
    value: '20',
    type: 'number',
    min: '0',
    max: '50',
    advanced: true,
  },
  {
    key: 'fontSize',
    label: 'Font size (pt)',
    value: '12',
    type: 'number',
    min: '8',
    max: '24',
    advanced: true,
  },
];

export function register(): void {
  registerTool({
    id: 'crop-pdf',
    description: 'Crop the visible area of your pages, previewed live.',
    fields: cropFields,
    primaryLabel: 'Crop pages',
    doneLabel: 'Pages cropped',
    output: 'revision',
    preview: true,
    async inspect(file) {
      const { cropPdfDetails } = await import('../../engines/crop-pdf.js');
      const { pageCount, widthMm, heightMm } = await cropPdfDetails(file);
      return {
        details: [
          ['Page count', String(pageCount)],
          ['Page 1 size', `${widthMm} × ${heightMm} mm`],
        ],
      };
    },
    async run({ files, values, signal, progress }) {
      progress({ label: busyLabel('Crop pages') });
      const { cropPdf } = await import('../../engines/crop-pdf.js');
      return cropPdf(
        files[0],
        {
          unit: values.unit === 'mm' ? 'mm' : 'percent',
          top: values.top,
          right: values.right,
          bottom: values.bottom,
          left: values.left,
          pages: values.pages,
          trimMediaBox: values.trimMediaBox,
        },
        { signal, progress }
      );
    },
  } satisfies ToolDefinition);

  registerTool({
    id: 'form-filler',
    description: 'Fill in this document’s form fields.',
    fields: formFillerFields,
    primaryLabel: 'Fill form',
    doneLabel: 'Form filled',
    output: 'revision',
    preview: true,
    async inspect(file) {
      const { inspectFormFields } =
        await import('../../engines/form-filler.js');
      return inspectFormFields(file);
    },
    async run({ files, values, signal, progress }) {
      progress({ label: busyLabel('Fill form') });
      const { fillForm } = await import('../../engines/form-filler.js');
      return fillForm(files[0], values, { signal, progress });
    },
  } satisfies ToolDefinition);

  registerTool({
    id: 'pdf-layers',
    description: 'Show or hide this document’s optional content layers.',
    fields: [],
    primaryLabel: 'Update layer visibility',
    doneLabel: 'Layer visibility updated',
    output: 'revision',
    preview: true,
    async inspect(file) {
      const { inspectPdfLayers } = await import('../../engines/pdf-layers.js');
      return inspectPdfLayers(file);
    },
    async run({ files, values, signal, progress }) {
      progress({ label: busyLabel('Update layer visibility') });
      const { updatePdfLayers } = await import('../../engines/pdf-layers.js');
      return updatePdfLayers(files[0], values, { signal, progress });
    },
  } satisfies ToolDefinition);

  // Not registered yet: the legacy editor keeps Mermaid, syntax highlighting,
  // footnotes and TOC. Register once this renderer reaches parity.
  void ({
    id: 'markdown-to-pdf',
    description: 'Write Markdown and turn it into a PDF document.',
    document: 'none',
    fields: markdownFields,
    primaryLabel: 'Create PDF',
    doneLabel: 'PDF created',
    output: 'new-document',
    async run({ values, signal, progress }) {
      progress({ label: busyLabel('Create PDF') });
      const { markdownToPdf } =
        await import('../../engines/markdown-to-pdf.js');
      return markdownToPdf(values, { signal, progress });
    },
  } satisfies ToolDefinition);
}
