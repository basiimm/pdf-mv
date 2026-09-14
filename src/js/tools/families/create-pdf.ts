// Tool definitions for the create-pdf family. See docs/TOOL-MIGRATION-GUIDE.md.
// Engines are imported lazily inside run() so the registry (loaded with the
// workspace) never pulls in heavy WASM/worker modules at startup.
import { registerTool } from '../registry.js';
import type { ToolDefinition, ToolField } from '../types.js';
import type { EbookFiletype } from '../../engines/ebook-to-pdf.js';

// Mirrors src/js/utils/image-input-utils.ts's IMAGE_ACCEPT. Not imported
// directly: that module pulls in heic2any, which opens a Worker at import
// time and must stay out of the registry's eagerly-loaded module graph.
const IMAGE_ACCEPT = [
  '.jpg',
  '.jpeg',
  '.png',
  '.bmp',
  '.gif',
  '.tiff',
  '.tif',
  '.pnm',
  '.pgm',
  '.pbm',
  '.ppm',
  '.pam',
  '.jxr',
  '.jpx',
  '.jp2',
  '.psd',
  '.svg',
  '.heic',
  '.heif',
  '.webp',
].join(',');

const qualityField: ToolField = {
  key: 'quality',
  label: 'Quality',
  value: 'medium',
  type: 'select',
  options: [
    ['high', 'High'],
    ['medium', 'Medium'],
    ['low', 'Low'],
  ],
  help: 'Higher quality creates a larger file.',
};

function register(
  definition: Omit<ToolDefinition, 'primaryLabel' | 'doneLabel' | 'output'>
): void {
  registerTool({
    ...definition,
    primaryLabel: 'Create PDF',
    doneLabel: 'PDF created',
    output: 'new-document',
  });
}

export function registerCreatePdfFamily(): void {
  // --- Images ---------------------------------------------------------
  register({
    id: 'image-to-pdf',
    description:
      'Combine JPG, PNG, BMP, HEIC, TIFF, SVG and other images into one PDF, in the order you choose.',
    fields: [qualityField],
    input: {
      accept: IMAGE_ACCEPT,
      multiple: true,
      label: 'Choose image files',
    },
    async run({ files, values, signal, progress }) {
      const { convertImagesToPdf, isValidQuality } =
        await import('../../engines/images-to-pdf.js');
      const quality = isValidQuality(values.quality)
        ? values.quality
        : 'medium';
      return convertImagesToPdf(files, { quality }, { signal, progress });
    },
  });

  register({
    id: 'bmp-to-pdf',
    description: 'Turn BMP images into a PDF, one page per image.',
    fields: [],
    input: {
      accept: '.bmp,image/bmp',
      multiple: true,
      label: 'Choose BMP files',
    },
    async run({ files, signal, progress }) {
      const { convertBmpToPdf } =
        await import('../../engines/images-to-pdf.js');
      return convertBmpToPdf(files, { signal, progress });
    },
  });

  register({
    id: 'heic-to-pdf',
    description: 'Turn HEIC/HEIF photos into a PDF, one page per photo.',
    fields: [],
    input: {
      accept: '.heic,.heif',
      multiple: true,
      label: 'Choose HEIC files',
    },
    async run({ files, signal, progress }) {
      const { convertHeicToPdf } =
        await import('../../engines/images-to-pdf.js');
      return convertHeicToPdf(files, { signal, progress });
    },
  });

  register({
    id: 'tiff-to-pdf',
    description:
      'Turn TIFF images into a PDF, one page per image (or per frame in a multi-page TIFF).',
    fields: [qualityField],
    input: {
      accept: '.tiff,.tif,image/tiff',
      multiple: true,
      label: 'Choose TIFF files',
    },
    async run({ files, values, signal, progress }) {
      const { convertTiffToPdf, isValidQuality } =
        await import('../../engines/images-to-pdf.js');
      const quality = isValidQuality(values.quality)
        ? values.quality
        : 'medium';
      return convertTiffToPdf(files, { quality }, { signal, progress });
    },
  });

  register({
    id: 'svg-to-pdf',
    description: 'Rasterize SVG graphics into a PDF, one page per file.',
    fields: [qualityField],
    input: {
      accept: '.svg,image/svg+xml',
      multiple: true,
      label: 'Choose SVG files',
    },
    async run({ files, values, signal, progress }) {
      const { convertSvgToPdf, isValidQuality } =
        await import('../../engines/images-to-pdf.js');
      const quality = isValidQuality(values.quality)
        ? values.quality
        : 'medium';
      return convertSvgToPdf(files, { quality }, { signal, progress });
    },
  });

  register({
    id: 'psd-to-pdf',
    description:
      'Turn Photoshop (PSD) files into a PDF, one page per file. Layers are flattened.',
    fields: [],
    input: { accept: '.psd', multiple: true, label: 'Choose PSD files' },
    async run({ files, signal, progress }) {
      const { convertPsdToPdf } =
        await import('../../engines/images-to-pdf.js');
      return convertPsdToPdf(files, { signal, progress });
    },
  });

  // --- Office / ODF (LibreOffice) --------------------------------------
  const officeTool = (
    id: string,
    accept: string,
    label: string,
    description: string
  ) =>
    register({
      id,
      description,
      fields: [],
      input: { accept, multiple: true, label },
      async run({ files, signal, progress }) {
        const { convertOfficeToPdf } =
          await import('../../engines/office-to-pdf.js');
        return convertOfficeToPdf(files, { signal, progress });
      },
    });

  officeTool(
    'word-to-pdf',
    '.doc,.docx',
    'Choose Word documents',
    'Export a Word document to PDF. Complex layouts may shift.'
  );
  officeTool(
    'excel-to-pdf',
    '.xls,.xlsx',
    'Choose Excel workbooks',
    'Export an Excel workbook to PDF. Complex layouts may shift.'
  );
  officeTool(
    'powerpoint-to-pdf',
    '.ppt,.pptx',
    'Choose PowerPoint presentations',
    'Export a PowerPoint presentation to PDF. Complex layouts may shift.'
  );
  officeTool(
    'odt-to-pdf',
    '.odt',
    'Choose OpenDocument text files',
    'Export an OpenDocument text file to PDF. Complex layouts may shift.'
  );
  officeTool(
    'ods-to-pdf',
    '.ods',
    'Choose OpenDocument spreadsheets',
    'Export an OpenDocument spreadsheet to PDF. Complex layouts may shift.'
  );
  officeTool(
    'odp-to-pdf',
    '.odp',
    'Choose OpenDocument presentations',
    'Export an OpenDocument presentation to PDF. Complex layouts may shift.'
  );
  officeTool(
    'odg-to-pdf',
    '.odg',
    'Choose OpenDocument drawings',
    'Export an OpenDocument drawing to PDF. Complex layouts may shift.'
  );
  officeTool(
    'rtf-to-pdf',
    '.rtf',
    'Choose RTF documents',
    'Export a rich text (RTF) document to PDF. Complex layouts may shift.'
  );
  officeTool(
    'wpd-to-pdf',
    '.wpd',
    'Choose WordPerfect documents',
    'Export a WordPerfect document to PDF. Complex layouts may shift.'
  );
  officeTool(
    'wps-to-pdf',
    '.wps',
    'Choose Works documents',
    'Export a Microsoft Works document to PDF. Complex layouts may shift.'
  );
  officeTool(
    'pages-to-pdf',
    '.pages',
    'Choose Pages documents',
    'Export an Apple Pages document to PDF. Complex layouts may shift.'
  );
  officeTool(
    'pub-to-pdf',
    '.pub',
    'Choose Publisher documents',
    'Export a Microsoft Publisher document to PDF. Complex layouts may shift.'
  );
  officeTool(
    'vsd-to-pdf',
    '.vsd,.vsdx',
    'Choose Visio diagrams',
    'Export a Visio diagram to PDF. Complex layouts may shift.'
  );

  // --- E-books / archives (PyMuPDF) ------------------------------------
  const ebookTool = (
    id: string,
    filetype: EbookFiletype,
    accept: string,
    label: string,
    description: string
  ) =>
    register({
      id,
      description,
      fields: [],
      input: { accept, multiple: true, label },
      async run({ files, signal, progress }) {
        const { convertEbookToPdf } =
          await import('../../engines/ebook-to-pdf.js');
        return convertEbookToPdf(files, filetype, { signal, progress });
      },
    });

  ebookTool(
    'xps-to-pdf',
    'xps',
    '.xps',
    'Choose XPS files',
    'Convert XPS documents to PDF.'
  );
  ebookTool(
    'mobi-to-pdf',
    'mobi',
    '.mobi',
    'Choose MOBI files',
    'Convert Kindle MOBI e-books to PDF. Complex layouts may shift.'
  );
  ebookTool(
    'epub-to-pdf',
    'epub',
    '.epub',
    'Choose EPUB files',
    'Convert EPUB e-books to PDF. Complex layouts may shift.'
  );
  ebookTool(
    'fb2-to-pdf',
    'fb2',
    '.fb2',
    'Choose FB2 files',
    'Convert FictionBook (FB2) e-books to PDF. Complex layouts may shift.'
  );
  ebookTool(
    'cbz-to-pdf',
    'cbz',
    '.cbz',
    'Choose CBZ files',
    'Turn a CBZ comic book archive into a PDF, one page per image.'
  );

  // --- Plain text -------------------------------------------------------
  register({
    id: 'txt-to-pdf',
    description: 'Turn plain text files into a formatted PDF.',
    fields: [
      {
        key: 'fontSize',
        label: 'Font size',
        value: '12',
        type: 'number',
        min: '6',
        max: '72',
      },
      {
        key: 'pageSize',
        label: 'Page size',
        value: 'a4',
        type: 'select',
        options: [
          ['a4', 'A4'],
          ['letter', 'Letter'],
          ['legal', 'Legal'],
          ['a3', 'A3'],
          ['a5', 'A5'],
        ],
      },
      {
        key: 'fontName',
        label: 'Font',
        value: 'helv',
        type: 'select',
        options: [
          ['helv', 'Helvetica'],
          ['times', 'Times'],
          ['cour', 'Courier'],
          ['tiro', 'Serif (Tiro)'],
        ],
        advanced: true,
      },
      {
        key: 'textColor',
        label: 'Text color',
        value: '#000000',
        type: 'color',
        advanced: true,
      },
    ],
    input: {
      accept: '.txt,text/plain',
      multiple: true,
      label: 'Choose text files',
    },
    async run({ files, values, signal, progress }) {
      const { convertTxtToPdf } = await import('../../engines/text-to-pdf.js');
      const fontSize = parseInt(values.fontSize, 10) || 12;
      const pageSize = (
        ['a4', 'letter', 'legal', 'a3', 'a5'] as const
      ).includes(values.pageSize as never)
        ? (values.pageSize as 'a4' | 'letter' | 'legal' | 'a3' | 'a5')
        : 'a4';
      const fontName = (['helv', 'tiro', 'cour', 'times'] as const).includes(
        values.fontName as never
      )
        ? (values.fontName as 'helv' | 'tiro' | 'cour' | 'times')
        : 'helv';
      return convertTxtToPdf(
        files,
        { fontSize, pageSize, fontName, textColor: values.textColor },
        { signal, progress }
      );
    },
  });

  register({
    id: 'csv-to-pdf',
    description: 'Turn CSV spreadsheets into a formatted PDF table.',
    fields: [],
    input: {
      accept: '.csv,text/csv',
      multiple: true,
      label: 'Choose CSV files',
    },
    async run({ files, signal, progress }) {
      const { convertCsvFilesToPdf } =
        await import('../../engines/text-to-pdf.js');
      return convertCsvFilesToPdf(files, { signal, progress });
    },
  });

  register({
    id: 'xml-to-pdf',
    description: 'Turn XML files into a formatted PDF table.',
    fields: [],
    input: {
      accept: '.xml,text/xml,application/xml',
      multiple: true,
      label: 'Choose XML files',
    },
    async run({ files, signal, progress }) {
      const { convertXmlFilesToPdf } =
        await import('../../engines/text-to-pdf.js');
      return convertXmlFilesToPdf(files, { signal, progress });
    },
  });

  register({
    id: 'json-to-pdf',
    description: 'Turn JSON files into a formatted PDF.',
    fields: [],
    input: {
      accept: '.json,application/json',
      multiple: true,
      label: 'Choose JSON files',
    },
    async run({ files, signal, progress }) {
      const { convertJsonToPdf } = await import('../../engines/text-to-pdf.js');
      return convertJsonToPdf(files, { signal, progress });
    },
  });

  register({
    id: 'email-to-pdf',
    description:
      'Turn EML or MSG email messages into a PDF, including attachments list.',
    fields: [
      {
        key: 'pageSize',
        label: 'Page size',
        value: 'a4',
        type: 'select',
        options: [
          ['a4', 'A4'],
          ['letter', 'Letter'],
          ['legal', 'Legal'],
        ],
      },
      {
        key: 'includeCcBcc',
        label: 'Include Cc/Bcc',
        value: 'true',
        type: 'checkbox',
        advanced: true,
      },
      {
        key: 'includeAttachments',
        label: 'List attachments',
        value: 'true',
        type: 'checkbox',
        advanced: true,
      },
    ],
    input: { accept: '.eml,.msg', multiple: true, label: 'Choose email files' },
    async run({ files, values, signal, progress }) {
      const { convertEmailToPdf } =
        await import('../../engines/email-to-pdf.js');
      const pageSize = (['a4', 'letter', 'legal'] as const).includes(
        values.pageSize as never
      )
        ? (values.pageSize as 'a4' | 'letter' | 'legal')
        : 'a4';
      return convertEmailToPdf(
        files,
        {
          pageSize,
          includeCcBcc: values.includeCcBcc !== 'false',
          includeAttachments: values.includeAttachments !== 'false',
        },
        { signal, progress }
      );
    },
  });
}

export { registerCreatePdfFamily as register };
