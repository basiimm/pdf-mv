// Tool definitions for the document-info family. See docs/TOOL-MIGRATION-GUIDE.md.
//
// Engines are imported lazily inside each `run()`/`inspect()` — never
// statically at module scope. See families/exports.ts for why.
//
// Gaps against the current ToolDefinition contract (reported alongside this
// change):
// - `bookmark` (full outline tree editing) needs a sidebar UI the panel
//   doesn't provide; not registered.
// - `pdf-layers` (OCG) needs one checkbox per layer, which fields can't
//   express (fields are static, not per-document); not registered.
// - `table-of-contents` has no "position" field: the CoherentPDF worker it
//   reuses always inserts the generated page at the front.
// - `duplex-collate` drops the legacy "export as grouped ZIP" option, which
//   doesn't fit a single-file `revision` output.
// - `rotate-custom` applies one uniform angle to the chosen pages, not
//   per-page angles (the legacy page needed a thumbnail grid for that).
import { registerTool } from '../registry.js';
import type { ToolDefinition, ToolField } from '../types.js';

const pageScopeHelp = 'Leave blank for all pages. Example: 1, 3-5';

// ---------------------------------------------------------------------------
// Edit metadata
// ---------------------------------------------------------------------------

const editMetadataFields: ToolField[] = [
  { key: 'title', label: 'Title', value: '', type: 'text' },
  { key: 'author', label: 'Author', value: '', type: 'text' },
  { key: 'subject', label: 'Subject', value: '', type: 'text' },
  {
    key: 'keywords',
    label: 'Keywords',
    value: '',
    type: 'text',
    help: 'Comma-separated.',
  },
  {
    key: 'creator',
    label: 'Creator',
    value: '',
    type: 'text',
    advanced: true,
  },
  {
    key: 'producer',
    label: 'Producer',
    value: '',
    type: 'text',
    advanced: true,
  },
  {
    key: 'customFields',
    label: 'Custom fields',
    value: '',
    type: 'text',
    advanced: true,
    help: 'One per entry, as Key: value, separated by semicolons.',
  },
];

// ---------------------------------------------------------------------------
// Page dimensions
// ---------------------------------------------------------------------------

const pageDimensionsFields: ToolField[] = [
  {
    key: 'unit',
    label: 'Unit',
    value: 'mm',
    type: 'segmented',
    options: [
      ['mm', 'mm'],
      ['in', 'in'],
      ['pt', 'pt'],
    ],
  },
];

// ---------------------------------------------------------------------------
// Edit attachments
// ---------------------------------------------------------------------------

const editAttachmentsFields: ToolField[] = [
  {
    key: 'removeNames',
    label: 'Attachments to remove',
    value: '',
    type: 'text',
    help: 'Comma-separated file names, matching the list above.',
  },
];

// ---------------------------------------------------------------------------
// Table of contents
// ---------------------------------------------------------------------------

const tableOfContentsFields: ToolField[] = [
  { key: 'title', label: 'Title', value: 'Table of Contents', type: 'text' },
  {
    key: 'fontSize',
    label: 'Font size',
    value: '14',
    type: 'number',
    min: '8',
    max: '36',
    step: '1',
    advanced: true,
  },
  {
    key: 'addBookmark',
    label: 'Add a bookmark for the contents page',
    value: 'true',
    type: 'checkbox',
    advanced: true,
  },
];

// ---------------------------------------------------------------------------
// Duplex collate
// ---------------------------------------------------------------------------

const duplexCollateFields: ToolField[] = [
  {
    key: 'splitPage',
    label: 'Split at page',
    value: '',
    type: 'number',
    min: '1',
    placeholder: 'Midpoint',
    help: 'The front-side pages end here; back-side pages follow. Leave blank for the midpoint.',
  },
  {
    key: 'backOrder',
    label: 'Back page order',
    value: 'reverse',
    type: 'segmented',
    options: [
      ['reverse', 'Reverse'],
      ['keep', 'Keep as scanned'],
    ],
    help: 'Reverse for scanners that flip the back stack; keep for duplex-fed scans.',
  },
];

// ---------------------------------------------------------------------------
// Remove blank pages
// ---------------------------------------------------------------------------

const removeBlankPagesFields: ToolField[] = [
  {
    key: 'sensitivity',
    label: 'Sensitivity',
    value: '80',
    type: 'number',
    min: '0',
    max: '100',
    help: 'Higher removes more pages that are almost, but not perfectly, blank.',
  },
  {
    key: 'treatNearlyBlank',
    label: 'Treat nearly blank pages as blank',
    value: 'false',
    type: 'checkbox',
    advanced: true,
  },
];

// ---------------------------------------------------------------------------
// Divide pages
// ---------------------------------------------------------------------------

const dividePagesFields: ToolField[] = [
  {
    key: 'direction',
    label: 'Split direction',
    value: 'vertical',
    type: 'segmented',
    options: [
      ['vertical', 'Vertical'],
      ['horizontal', 'Horizontal'],
    ],
  },
  {
    key: 'pages',
    label: 'Pages to split',
    value: '',
    type: 'text',
    help: pageScopeHelp,
  },
];

// ---------------------------------------------------------------------------
// Overlay PDF
// ---------------------------------------------------------------------------

const overlayPdfFields: ToolField[] = [
  {
    key: 'mode',
    label: 'Mode',
    value: 'overlay',
    type: 'select',
    options: [
      ['overlay', 'Overlay (on top)'],
      ['underlay', 'Underlay (behind)'],
    ],
  },
  {
    key: 'pageRange',
    label: 'Pages',
    value: '',
    type: 'text',
    help: pageScopeHelp,
    advanced: true,
  },
  {
    key: 'repeat',
    label: 'Repeat overlay pages to cover the whole document',
    value: 'false',
    type: 'checkbox',
    advanced: true,
  },
];

// ---------------------------------------------------------------------------
// Rotate custom
// ---------------------------------------------------------------------------

const rotateCustomFields: ToolField[] = [
  {
    key: 'angle',
    label: 'Angle',
    value: '0',
    type: 'number',
    min: '-180',
    max: '180',
    step: '1',
    help: 'Degrees clockwise.',
  },
  {
    key: 'pages',
    label: 'Pages',
    value: '',
    type: 'text',
    help: pageScopeHelp,
  },
];

// ---------------------------------------------------------------------------
// Alternate merge
// ---------------------------------------------------------------------------

const alternateMergeFields: ToolField[] = [
  {
    key: 'retainPageLabels',
    label: 'Retain page labels',
    value: 'false',
    type: 'checkbox',
    advanced: true,
  },
];

export function register(): void {
  registerTool({
    id: 'edit-metadata',
    description: 'Update the document title, author and other info fields.',
    fields: editMetadataFields,
    primaryLabel: 'Save metadata',
    doneLabel: 'Metadata saved',
    output: 'revision',
    async inspect(file) {
      const { readEditableMetadata } =
        await import('../../engines/edit-metadata.js');
      return readEditableMetadata(file);
    },
    async run({ files, values, signal, progress }) {
      const { editMetadata } = await import('../../engines/edit-metadata.js');
      return editMetadata(files[0], values, { signal, progress });
    },
  } satisfies ToolDefinition);

  registerTool({
    id: 'view-metadata',
    description: 'See every metadata field stored in this document.',
    fields: [],
    primaryLabel: 'Export as JSON',
    doneLabel: 'Metadata exported',
    output: 'download',
    async inspect(file) {
      const { readDocumentMetadata, metadataDetails } =
        await import('../../engines/view-metadata.js');
      const result = await readDocumentMetadata(file);
      return { details: metadataDetails(result) };
    },
    async run({ files, signal, progress }) {
      const { exportMetadataJson } =
        await import('../../engines/view-metadata.js');
      return exportMetadataJson(files[0], { signal, progress });
    },
  } satisfies ToolDefinition);

  registerTool({
    id: 'page-dimensions',
    description: 'See and export the size of every page in this document.',
    fields: pageDimensionsFields,
    primaryLabel: 'Export sizes as CSV',
    doneLabel: 'Page sizes exported',
    output: 'download',
    async inspect(file) {
      const { analyzePageDimensions, pageDimensionDetails } =
        await import('../../engines/page-dimensions.js');
      const pages = await analyzePageDimensions(file);
      return { details: pageDimensionDetails(pages) };
    },
    async run({ files, values, signal, progress }) {
      const { exportPageDimensionsCsv } =
        await import('../../engines/page-dimensions.js');
      return exportPageDimensionsCsv(files[0], values, { signal, progress });
    },
  } satisfies ToolDefinition);

  // add-attachments operates on the open PDF *and* extra files, via
  // `extraInput` (files = [openPdfSnapshot, ...chosenFiles]).
  registerTool({
    id: 'add-attachments',
    description: 'Embed one or more files inside this PDF as attachments.',
    fields: [],
    primaryLabel: 'Attach files',
    doneLabel: 'Files attached',
    output: 'revision',
    extraInput: {
      accept: '*/*',
      multiple: true,
      label: 'Choose files to attach',
    },
    async run({ files, signal, progress }) {
      const { addAttachments } =
        await import('../../engines/add-attachments.js');
      return addAttachments(files, {}, { signal, progress });
    },
  } satisfies ToolDefinition);

  registerTool({
    id: 'edit-attachments',
    description: 'Remove files already attached to this PDF.',
    fields: editAttachmentsFields,
    primaryLabel: 'Remove attachments',
    doneLabel: 'Attachments removed',
    output: 'revision',
    async inspect(file) {
      const { listAttachments } =
        await import('../../engines/edit-attachments.js');
      const attachments = await listAttachments(file);
      if (attachments.length === 0) {
        return { details: [['Attachments', 'None found in this document']] };
      }
      return {
        details: attachments.map(
          (a) =>
            [a.name, `${(a.size / 1024).toFixed(1)} KB`] as [string, string]
        ),
      };
    },
    async run({ files, values, signal, progress }) {
      const { editAttachments } =
        await import('../../engines/edit-attachments.js');
      return editAttachments(files[0], values, { signal, progress });
    },
  } satisfies ToolDefinition);

  registerTool({
    id: 'table-of-contents',
    description:
      'Insert a generated table of contents page from this document’s bookmarks.',
    fields: tableOfContentsFields,
    primaryLabel: 'Insert table of contents',
    doneLabel: 'Table of contents inserted',
    output: 'revision',
    async inspect(file) {
      const { countBookmarks } =
        await import('../../engines/table-of-contents.js');
      const count = await countBookmarks(file);
      return {
        details: [
          [
            'Bookmarks found',
            count > 0
              ? String(count)
              : 'None — the contents page will be empty',
          ],
        ],
      };
    },
    async run({ files, values, signal, progress }) {
      const { generateTableOfContents } =
        await import('../../engines/table-of-contents.js');
      return generateTableOfContents(
        files[0],
        {
          title: values.title,
          fontSize: Number(values.fontSize) || 14,
          addBookmark: values.addBookmark !== 'false',
        },
        { signal, progress }
      );
    },
  } satisfies ToolDefinition);

  // alternate-merge interleaves the open PDF with extra PDFs chosen via
  // `extraInput` (files = [openPdfSnapshot, ...chosenPdfs]).
  registerTool({
    id: 'alternate-merge',
    description:
      'Interleave pages from this document with one or more other PDFs.',
    fields: alternateMergeFields,
    primaryLabel: 'Alternate and merge',
    doneLabel: 'Pages merged',
    output: 'new-document',
    extraInput: {
      accept: '.pdf,application/pdf',
      multiple: true,
      label: 'Choose PDFs to interleave',
    },
    async run({ files, values, signal, progress }) {
      const { alternateMerge } =
        await import('../../engines/alternate-merge.js');
      return alternateMerge(
        files,
        { retainPageLabels: values.retainPageLabels === 'true' },
        { signal, progress }
      );
    },
  } satisfies ToolDefinition);

  registerTool({
    id: 'duplex-collate',
    description:
      'Reorder a single-sided duplex scan back into front/back order.',
    fields: duplexCollateFields,
    primaryLabel: 'Collate pages',
    doneLabel: 'Pages collated',
    output: 'revision',
    async run({ files, values, signal, progress }) {
      const { duplexCollate } = await import('../../engines/duplex-collate.js');
      return duplexCollate(
        files[0],
        {
          splitPage: values.splitPage,
          backOrder: values.backOrder === 'keep' ? 'keep' : 'reverse',
        },
        { signal, progress }
      );
    },
  } satisfies ToolDefinition);

  registerTool({
    id: 'remove-blank-pages',
    description: 'Detect and delete blank pages from this document.',
    fields: removeBlankPagesFields,
    primaryLabel: 'Remove blank pages',
    doneLabel: 'Blank pages removed',
    output: 'revision',
    async run({ files, values, signal, progress }) {
      const { removeBlankPages } =
        await import('../../engines/remove-blank-pages.js');
      return removeBlankPages(
        files[0],
        {
          sensitivity: Number(values.sensitivity),
          treatNearlyBlank: values.treatNearlyBlank === 'true',
        },
        { signal, progress }
      );
    },
  } satisfies ToolDefinition);

  registerTool({
    id: 'divide-pages',
    description: 'Split each page in half, doubling the page count.',
    fields: dividePagesFields,
    primaryLabel: 'Divide pages',
    doneLabel: 'Pages divided',
    output: 'revision',
    async run({ files, values, signal, progress }) {
      const { dividePages } = await import('../../engines/divide-pages.js');
      return dividePages(
        files[0],
        {
          direction:
            values.direction === 'horizontal' ? 'horizontal' : 'vertical',
          pages: values.pages,
        },
        { signal, progress }
      );
    },
  } satisfies ToolDefinition);

  // overlay-pdf stamps a second PDF onto the open one, chosen via
  // `extraInput` (files = [openPdfSnapshot, overlayFile]).
  registerTool({
    id: 'overlay-pdf',
    description:
      'Stamp another PDF’s pages on top of (or behind) this document.',
    fields: overlayPdfFields,
    primaryLabel: 'Apply overlay',
    doneLabel: 'Overlay applied',
    output: 'revision',
    extraInput: {
      accept: '.pdf,application/pdf',
      multiple: false,
      label: 'Choose overlay PDF',
    },
    async run({ files, values, signal, progress }) {
      const { overlayPdf } = await import('../../engines/overlay-pdf.js');
      return overlayPdf(
        files,
        {
          mode: values.mode === 'underlay' ? 'underlay' : 'overlay',
          pageRange: values.pageRange,
          repeat: values.repeat === 'true',
        },
        { signal, progress }
      );
    },
  } satisfies ToolDefinition);

  registerTool({
    id: 'rotate-custom',
    description: 'Rotate pages by any angle, not just 90-degree steps.',
    fields: rotateCustomFields,
    primaryLabel: 'Rotate pages',
    doneLabel: 'Pages rotated',
    output: 'revision',
    async run({ files, values, signal, progress }) {
      const { rotateCustom } = await import('../../engines/rotate-custom.js');
      return rotateCustom(
        files[0],
        { angle: values.angle, pages: values.pages },
        { signal, progress }
      );
    },
  } satisfies ToolDefinition);
}
