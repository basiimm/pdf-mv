import { categories as engineCategories } from './tools.js';
export const engines = new Map(
  engineCategories.flatMap((c) => c.tools).map((t) => [t.id, t])
);
export interface ToolGroup {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
  category: string;
  members: string[];
}
const group = (
  id: string,
  name: string,
  subtitle: string,
  icon: string,
  category: string,
  members: string[]
): ToolGroup => ({ id, name, subtitle, icon, category, members });
export const conversionTo = [...engines.keys()].filter((id) =>
  id.endsWith('-to-pdf')
);
export const conversionFrom = [
  'pdf-to-jpg',
  'pdf-to-png',
  'pdf-to-webp',
  'pdf-to-bmp',
  'pdf-to-tiff',
  'pdf-to-svg',
  'pdf-to-docx',
  'pdf-to-excel',
  'pdf-to-csv',
  'pdf-to-text',
  'pdf-to-markdown',
  'pdf-to-json',
  'pdf-to-cbz',
  'pdf-to-pdfa',
];
export const groups: ToolGroup[] = [
  group(
    'edit-pdf',
    'Read & annotate',
    'Highlight, comment, draw, add text, images and stamps.',
    'pencil-line',
    'Edit & Annotate',
    ['edit-pdf', 'add-stamps']
  ),
  group(
    'edit-pdf-text',
    'Edit PDF text',
    'Change existing paragraphs, images and shapes.',
    'text-cursor-input',
    'Edit & Annotate',
    ['edit-pdf-text']
  ),
  group(
    'convert',
    'Convert',
    'Choose a format: Word, images, spreadsheets, text and more.',
    'arrow-left-right',
    'Convert & Extract',
    [...conversionTo, ...conversionFrom]
  ),
  group(
    'organize',
    'Organize pages',
    'Rotate, reorder, extract, duplicate, insert or delete pages.',
    'layers-2',
    'Pages & Layout',
    [
      'rotate-pdf',
      'extract-pages',
      'delete-pages',
      'add-blank-page',
      'reverse-pages',
      'organize-pdf',
      'split-pdf',
      'remove-blank-pages',
      'duplex-collate',
      'pdf-multi-tool',
    ]
  ),
  group(
    'merge',
    'Combine documents',
    'Merge files, alternate pages, or overlay one PDF on another.',
    'combine',
    'Pages & Layout',
    ['merge-pdf', 'alternate-merge', 'overlay-pdf']
  ),
  group(
    'layout',
    'Page layout',
    'Crop, resize, divide or arrange pages for printing.',
    'panels-top-left',
    'Pages & Layout',
    [
      'crop-pdf',
      'fix-page-size',
      'divide-pages',
      'n-up-pdf',
      'pdf-booklet',
      'combine-single-page',
      'posterize-pdf',
      'rotate-custom',
    ]
  ),
  group(
    'numbering',
    'Headers & numbering',
    'Headers, footers, page numbers, labels and Bates numbering.',
    'list-ordered',
    'Edit & Annotate',
    ['header-footer', 'page-numbers', 'add-page-labels', 'bates-numbering']
  ),
  group(
    'watermark',
    'Watermark',
    'Add a text watermark, or use advanced image watermark options.',
    'droplets',
    'Edit & Annotate',
    ['add-watermark']
  ),
  group(
    'appearance',
    'Appearance',
    'Adjust brightness, colors, backgrounds or a scanned look.',
    'palette',
    'Edit & Annotate',
    [
      'adjust-colors',
      'background-color',
      'text-color',
      'pdf-to-greyscale',
      'invert-colors',
      'scanner-effect',
    ]
  ),
  group(
    'forms',
    'Forms',
    'Fill or create form fields, then flatten a finished document.',
    'text-select',
    'Edit & Annotate',
    ['form-filler', 'form-creator', 'flatten-pdf']
  ),
  group(
    'signatures',
    'Signatures',
    'Sign by hand, use a certificate, validate or timestamp.',
    'signature',
    'Security & Privacy',
    ['sign-pdf', 'digital-sign-pdf', 'validate-signature-pdf', 'timestamp-pdf']
  ),
  group(
    'bookmarks',
    'Bookmarks & contents',
    'Manage navigation and generate a table of contents.',
    'bookmark',
    'Edit & Annotate',
    ['bookmark', 'table-of-contents']
  ),
  group(
    'attachments',
    'Attachments',
    'Add, inspect, remove or export embedded files.',
    'paperclip',
    'Document Details',
    ['edit-attachments', 'add-attachments', 'extract-attachments']
  ),
  group(
    'properties',
    'Document properties',
    'Inspect or edit metadata, remove it, and check page dimensions.',
    'info',
    'Document Details',
    ['view-metadata', 'edit-metadata', 'remove-metadata', 'page-dimensions']
  ),
  group(
    'layers',
    'Layers',
    'Inspect and manage optional content layers.',
    'layers',
    'Document Details',
    ['pdf-layers']
  ),
  group(
    'extract',
    'Extract content',
    'Export embedded images, tables or structured data for AI.',
    'scan-text',
    'Convert & Extract',
    ['extract-images', 'extract-tables', 'prepare-pdf-for-ai']
  ),
  group(
    'ocr',
    'Recognize text',
    'Make scanned documents searchable and copyable.',
    'scan-line',
    'Convert & Extract',
    ['ocr-pdf']
  ),
  group(
    'optimize',
    'Optimize & repair',
    'Compress, repair, straighten scans or prepare a PDF for the web.',
    'minimize-2',
    'Optimize & Repair',
    [
      'compress-pdf',
      'repair-pdf',
      'linearize-pdf',
      'deskew-pdf',
      'rasterize-pdf',
      'font-to-outline',
    ]
  ),
  group(
    'security',
    'Password & permissions',
    'Set or remove a password and manage document permissions.',
    'lock-keyhole',
    'Security & Privacy',
    ['encrypt-pdf', 'decrypt-pdf', 'change-permissions', 'remove-restrictions']
  ),
  group(
    'cleanup',
    'Clean up document',
    'Remove annotations or sanitize hidden content.',
    'eraser',
    'Security & Privacy',
    ['remove-annotations', 'sanitize-pdf']
  ),
  group(
    'compare',
    'Compare documents',
    'Compare two PDFs side by side.',
    'columns-2',
    'Document Details',
    ['compare-pdfs']
  ),
  group(
    'package',
    'Package files',
    'Collect multiple PDFs in a ZIP archive.',
    'archive',
    'Document Details',
    ['pdf-to-zip']
  ),
  group(
    'workflow',
    'Workflow builder',
    'Build a reusable sequence of PDF operations.',
    'workflow',
    'Optimize & Repair',
    ['pdf-workflow']
  ),
];
export const groupById = new Map(groups.map((g) => [g.id, g]));
export const groupForEngine = new Map(
  groups.flatMap((g) => g.members.map((id) => [id, g] as const))
);
export const popularGroups = [
  'edit-pdf',
  'convert',
  'organize',
  'merge',
  'optimize',
  'signatures',
];
export const workspaceCategories = [
  {
    name: 'Popular Tools',
    tools: popularGroups.map((id) => groupById.get(id)!),
  },
  ...[...new Set(groups.map((g) => g.category))].map((name) => ({
    name,
    tools: groups.filter((g) => g.category === name),
  })),
];
export function matchesGroup(group: ToolGroup, query: string): boolean {
  const haystack = [
    group.name,
    group.subtitle,
    ...group.members.flatMap((id) => {
      const tool = engines.get(id);
      return [tool?.name ?? '', tool?.subtitle ?? ''];
    }),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}
export function formatName(id: string): string {
  const aliases: Record<string, string> = {
    'image-to-pdf': 'Images (mixed formats)',
    'word-to-pdf': 'Word (DOCX / DOC)',
    'excel-to-pdf': 'Excel (XLSX / XLS)',
    'powerpoint-to-pdf': 'PowerPoint (PPTX / PPT)',
    'pdf-to-docx': 'Word (DOCX)',
    'pdf-to-excel': 'Excel (XLSX)',
    'pdf-to-pdfa': 'PDF/A (archive)',
    'txt-to-pdf': 'Plain text (TXT)',
  };
  return (
    aliases[id] ??
    (engines.get(id)?.name ?? id)
      .replace(/^PDF to /, '')
      .replace(/ to PDF$/, '')
  );
}
