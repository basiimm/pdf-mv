// Tool definitions for the exports family. See docs/TOOL-MIGRATION-GUIDE.md.
//
// Engines are imported lazily inside each `run()` — never statically at
// module scope. The registry loads with the workspace, and a static import
// would pull heavy engines (pdfjs, wasm-vips, pymupdf, Workers) into startup
// and break environments without them (e.g. `Worker is not defined` in tests).
import { registerTool, busyLabel } from '../registry.js';
import type { ToolDefinition, ToolField } from '../types.js';
import type { CbzOptions } from '@/types';
import type { PdfToTiffOptions } from '../../engines/pdf-to-tiff.js';
import type { ExtractTablesFormat } from '../../engines/extract-tables.js';

const cbzFields: ToolField[] = [
  {
    key: 'imageFormat',
    label: 'Image format',
    value: 'jpeg',
    type: 'select',
    options: [
      ['jpeg', 'JPEG'],
      ['png', 'PNG'],
      ['webp', 'WebP'],
    ],
  },
  {
    key: 'quality',
    label: 'Quality',
    value: '85',
    type: 'number',
    min: '1',
    max: '100',
    help: 'Ignored for PNG.',
  },
  {
    key: 'scale',
    label: 'Render scale',
    value: '2',
    type: 'number',
    min: '0.5',
    max: '4',
    step: '0.1',
    advanced: true,
  },
  {
    key: 'grayscale',
    label: 'Convert to grayscale',
    value: 'false',
    type: 'checkbox',
    advanced: true,
  },
  {
    key: 'manga',
    label: 'Manga (right-to-left)',
    value: 'false',
    type: 'checkbox',
    advanced: true,
  },
  {
    key: 'includeMetadata',
    label: 'Include ComicInfo metadata',
    value: 'true',
    type: 'checkbox',
    advanced: true,
  },
  { key: 'title', label: 'Title', value: '', type: 'text', advanced: true },
  { key: 'series', label: 'Series', value: '', type: 'text', advanced: true },
  {
    key: 'number',
    label: 'Issue number',
    value: '',
    type: 'text',
    advanced: true,
  },
  { key: 'volume', label: 'Volume', value: '', type: 'text', advanced: true },
  { key: 'author', label: 'Author', value: '', type: 'text', advanced: true },
  {
    key: 'publisher',
    label: 'Publisher',
    value: '',
    type: 'text',
    advanced: true,
  },
  {
    key: 'tags',
    label: 'Tags / genre',
    value: '',
    type: 'text',
    advanced: true,
  },
  { key: 'year', label: 'Year', value: '', type: 'text', advanced: true },
  {
    key: 'rating',
    label: 'Community rating',
    value: '',
    type: 'text',
    advanced: true,
  },
];

function cbzOptionsFrom(values: Record<string, string>): CbzOptions {
  return {
    imageFormat: (values.imageFormat as CbzOptions['imageFormat']) || 'jpeg',
    quality: values.quality ? Number(values.quality) / 100 : 0.85,
    scale: values.scale ? Number(values.scale) : 2.0,
    grayscale: values.grayscale === 'true',
    manga: values.manga === 'true',
    includeMetadata: values.includeMetadata !== 'false',
    title: values.title?.trim() ?? '',
    series: values.series?.trim() ?? '',
    number: values.number?.trim() ?? '',
    volume: values.volume?.trim() ?? '',
    author: values.author?.trim() ?? '',
    publisher: values.publisher?.trim() ?? '',
    tags: values.tags?.trim() ?? '',
    year: values.year?.trim() ?? '',
    rating: values.rating?.trim() ?? '',
  };
}

const tiffFields: ToolField[] = [
  {
    key: 'dpi',
    label: 'Resolution (DPI)',
    value: '300',
    type: 'number',
    min: '72',
    max: '1200',
  },
  {
    key: 'compression',
    label: 'Compression',
    value: 'lzw',
    type: 'select',
    options: [
      ['lzw', 'LZW'],
      ['deflate', 'Deflate'],
      ['jpeg', 'JPEG'],
      ['ccittfax4', 'CCITT Fax 4 (black & white)'],
      ['none', 'None'],
    ],
    advanced: true,
  },
  {
    key: 'colorMode',
    label: 'Color mode',
    value: 'rgb',
    type: 'select',
    options: [
      ['rgb', 'Color'],
      ['greyscale', 'Greyscale'],
      ['bw', 'Black & white'],
    ],
    advanced: true,
  },
  {
    key: 'multiPage',
    label: 'Single multi-page TIFF',
    value: 'false',
    type: 'checkbox',
    advanced: true,
  },
];

function tiffOptionsFrom(values: Record<string, string>): PdfToTiffOptions {
  return {
    dpi: values.dpi ? Number(values.dpi) : 300,
    compression: values.compression || 'lzw',
    colorMode: values.colorMode || 'rgb',
    multiPage: values.multiPage === 'true',
  };
}

interface ExportDef {
  id: string;
  primaryLabel: string;
  doneLabel: string;
  description: string;
  fields?: ToolField[];
  preview?: boolean;
  run: ToolDefinition['run'];
}

const defs: ExportDef[] = [
  {
    id: 'pdf-to-bmp',
    primaryLabel: 'Export BMP images',
    doneLabel: 'BMP images exported',
    description:
      'Save each page as a BMP image. Multiple pages download as a ZIP.',
    async run({ files, signal, progress }) {
      progress({ label: busyLabel('Export BMP images') });
      const { pdfToBmp } = await import('../../engines/pdf-to-bmp.js');
      return pdfToBmp(files[0], {}, { signal, progress });
    },
  },
  {
    id: 'pdf-to-tiff',
    primaryLabel: 'Export TIFF',
    doneLabel: 'TIFF exported',
    description:
      'Save the document as TIFF images. Larger PDFs may take a moment to render.',
    fields: tiffFields,
    async run({ files, values, signal, progress }) {
      progress({ label: busyLabel('Export TIFF') });
      const { pdfToTiff } = await import('../../engines/pdf-to-tiff.js');
      return pdfToTiff(files[0], tiffOptionsFrom(values), { signal, progress });
    },
  },
  {
    id: 'pdf-to-svg',
    primaryLabel: 'Export SVG',
    doneLabel: 'SVG exported',
    description:
      'Save each page as a scalable SVG image. Multiple pages download as a ZIP.',
    async run({ files, signal, progress }) {
      progress({ label: busyLabel('Export SVG') });
      const { pdfToSvg } = await import('../../engines/pdf-to-svg.js');
      return pdfToSvg(files[0], {}, { signal, progress });
    },
  },
  {
    id: 'pdf-to-cbz',
    primaryLabel: 'Export comic book (CBZ)',
    doneLabel: 'Comic book exported',
    description:
      'Package the pages as a CBZ comic archive, with optional ComicInfo metadata.',
    fields: cbzFields,
    async run({ files, values, signal, progress }) {
      progress({ label: busyLabel('Export comic book (CBZ)') });
      const { pdfToCbz } = await import('../../engines/pdf-to-cbz.js');
      return pdfToCbz(files[0], cbzOptionsFrom(values), { signal, progress });
    },
  },
  {
    id: 'pdf-to-docx',
    primaryLabel: 'Export Word document',
    doneLabel: 'Word document exported',
    description:
      'Convert to an editable .docx file. Layout may differ from the original.',
    async run({ files, signal, progress }) {
      progress({ label: busyLabel('Export Word document') });
      const { pdfToDocx } = await import('../../engines/pdf-to-docx.js');
      return pdfToDocx(files[0], {}, { signal, progress });
    },
  },
  {
    id: 'pdf-to-excel',
    primaryLabel: 'Export Excel workbook',
    doneLabel: 'Excel workbook exported',
    description:
      'Detect tables and save each one as a sheet in an .xlsx workbook.',
    async run({ files, signal, progress }) {
      progress({ label: busyLabel('Export Excel workbook') });
      const { pdfToExcel } = await import('../../engines/pdf-to-excel.js');
      return pdfToExcel(files[0], {}, { signal, progress });
    },
  },
  {
    id: 'pdf-to-csv',
    primaryLabel: 'Export CSV',
    doneLabel: 'CSV exported',
    description: 'Detect tables and save their rows as a single CSV file.',
    async run({ files, signal, progress }) {
      progress({ label: busyLabel('Export CSV') });
      const { pdfToCsv } = await import('../../engines/pdf-to-csv.js');
      return pdfToCsv(files[0], {}, { signal, progress });
    },
  },
  {
    id: 'pdf-to-markdown',
    primaryLabel: 'Export Markdown',
    doneLabel: 'Markdown exported',
    description: 'Convert the document to Markdown text.',
    fields: [
      {
        key: 'includeImages',
        label: 'Include images',
        value: 'false',
        type: 'checkbox',
      },
    ],
    async run({ files, values, signal, progress }) {
      progress({ label: busyLabel('Export Markdown') });
      const { pdfToMarkdown } =
        await import('../../engines/pdf-to-markdown.js');
      return pdfToMarkdown(
        files[0],
        { includeImages: values.includeImages === 'true' },
        { signal, progress }
      );
    },
  },
  {
    id: 'pdf-to-json',
    primaryLabel: 'Export JSON',
    doneLabel: 'JSON exported',
    description: 'Convert the document structure and content to a JSON file.',
    async run({ files, signal, progress }) {
      progress({ label: busyLabel('Export JSON') });
      const { pdfToJson } = await import('../../engines/pdf-to-json.js');
      return pdfToJson(files[0], {}, { signal, progress });
    },
  },
  {
    id: 'pdf-to-greyscale',
    primaryLabel: 'Convert to grayscale',
    doneLabel: 'Converted to grayscale',
    description:
      'Replace every page with a grayscale rendering. Rasterizes the page content.',
    preview: true,
    async run({ files, signal, progress }) {
      progress({ label: busyLabel('Convert to grayscale') });
      const { pdfToGreyscale } =
        await import('../../engines/pdf-to-greyscale.js');
      return pdfToGreyscale(files[0], {}, { signal, progress });
    },
  },
  {
    id: 'extract-images',
    primaryLabel: 'Extract images',
    doneLabel: 'Images extracted',
    description: 'Pull out embedded images. Multiple images download as a ZIP.',
    async run({ files, signal, progress }) {
      progress({ label: busyLabel('Extract images') });
      const { extractImages } = await import('../../engines/extract-images.js');
      return extractImages(files[0], {}, { signal, progress });
    },
  },
  {
    id: 'extract-tables',
    primaryLabel: 'Extract tables',
    doneLabel: 'Tables extracted',
    description:
      'Detect tables and save them in the chosen format. Multiple tables download as a ZIP.',
    fields: [
      {
        key: 'format',
        label: 'Format',
        value: 'csv',
        type: 'segmented',
        options: [
          ['csv', 'CSV'],
          ['json', 'JSON'],
          ['markdown', 'Markdown'],
        ],
      },
    ],
    async run({ files, values, signal, progress }) {
      progress({ label: busyLabel('Extract tables') });
      const { extractTables } = await import('../../engines/extract-tables.js');
      return extractTables(
        files[0],
        { format: (values.format as ExtractTablesFormat) || 'csv' },
        { signal, progress }
      );
    },
  },
  {
    id: 'prepare-pdf-for-ai',
    primaryLabel: 'Prepare for AI',
    doneLabel: 'Prepared for AI',
    description:
      'Export structured JSON suited to feeding the document to an AI or LLM pipeline.',
    async run({ files, signal, progress }) {
      progress({ label: busyLabel('Prepare for AI') });
      const { preparePdfForAi } =
        await import('../../engines/prepare-pdf-for-ai.js');
      return preparePdfForAi(files[0], {}, { signal, progress });
    },
  },
  {
    id: 'extract-attachments',
    primaryLabel: 'Extract attachments',
    doneLabel: 'Attachments extracted',
    description: 'Save every file attached to this PDF as a ZIP archive.',
    async run({ files, signal, progress }) {
      progress({ label: busyLabel('Extract attachments') });
      const { extractAttachments } =
        await import('../../engines/extract-attachments.js');
      return extractAttachments(files[0], {}, { signal, progress });
    },
  },
];

export function register(): void {
  for (const def of defs) {
    registerTool({
      id: def.id,
      description: def.description,
      fields: def.fields ?? [],
      primaryLabel: def.primaryLabel,
      doneLabel: def.doneLabel,
      output: def.id === 'pdf-to-greyscale' ? 'revision' : 'download',
      preview: def.preview,
      run: def.run,
    });
  }

  registerTool({
    id: 'pdf-to-zip',
    description: 'Bundle the chosen PDFs into a single ZIP archive.',
    fields: [],
    primaryLabel: 'Download as ZIP',
    doneLabel: 'ZIP downloaded',
    output: 'download',
    input: {
      accept: 'application/pdf,.pdf',
      multiple: true,
      label: 'Choose PDFs',
    },
    async run({ files, signal, progress }) {
      progress({ label: busyLabel('Download as ZIP') });
      const { pdfToZip } = await import('../../engines/pdf-to-zip.js');
      return pdfToZip(files, {}, { signal, progress });
    },
  });
}
