// Tool definitions for the protect-optimize family. See docs/TOOL-MIGRATION-GUIDE.md.
//
// Engines are imported lazily inside each `run()` — the registry loads with the
// workspace, so a static import of an engine (and the heavy loaders it may pull in,
// e.g. pdfjs/workers) would run at startup and break tests ("Worker is not defined").
import { registerTool, busyLabel } from '../registry.js';
import type { ToolField } from '../types.js';

import type {
  CompressLevel,
  CompressAlgorithm,
} from '../../engines/compress-pdf.js';
import type { PdfALevel } from '../../utils/ghostscript-loader.js';

const bool = (v: string): boolean => v === 'true';
const num = (v: string, fallback: number): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

export function register(): void {
  // --- Compress PDF -------------------------------------------------------
  registerTool({
    id: 'compress-pdf',
    description:
      'Shrink the file size by recompressing images and cleaning up the document.',
    primaryLabel: 'Compress PDF',
    doneLabel: 'PDF compressed',
    output: 'revision',
    fields: [
      {
        key: 'algorithm',
        label: 'Method',
        value: 'condense',
        type: 'segmented',
        options: [
          ['condense', 'Condense'],
          ['photon', 'Photon (image-based)'],
        ],
      },
      {
        key: 'level',
        label: 'Compression level',
        value: 'balanced',
        type: 'segmented',
        options: [
          ['light', 'Light'],
          ['balanced', 'Balanced'],
          ['aggressive', 'Aggressive'],
          ['extreme', 'Extreme'],
        ],
      },
      {
        key: 'imageQuality',
        label: 'Image quality',
        value: '75',
        type: 'number',
        min: '1',
        max: '100',
        advanced: true,
      },
      {
        key: 'dpiTarget',
        label: 'Target DPI',
        value: '96',
        type: 'number',
        min: '30',
        max: '300',
        advanced: true,
      },
      {
        key: 'removeMetadata',
        label: 'Remove metadata',
        value: 'true',
        type: 'checkbox',
        advanced: true,
      },
      {
        key: 'subsetFonts',
        label: 'Subset fonts',
        value: 'true',
        type: 'checkbox',
        advanced: true,
      },
      {
        key: 'convertToGrayscale',
        label: 'Convert images to grayscale',
        value: 'false',
        type: 'checkbox',
        advanced: true,
      },
      {
        key: 'removeThumbnails',
        label: 'Remove thumbnails',
        value: 'true',
        type: 'checkbox',
        advanced: true,
      },
    ],
    async run({ files, values, signal, progress }) {
      progress({ label: busyLabel('Compress PDF') });
      const { compressPdf } = await import('../../engines/compress-pdf.js');
      return compressPdf(
        files[0],
        {
          algorithm: values.algorithm as CompressAlgorithm,
          level: values.level as CompressLevel,
          imageQuality: num(values.imageQuality, 75),
          dpiTarget: num(values.dpiTarget, 96),
          removeMetadata: bool(values.removeMetadata),
          subsetFonts: bool(values.subsetFonts),
          convertToGrayscale: bool(values.convertToGrayscale),
          removeThumbnails: bool(values.removeThumbnails),
        },
        { signal, progress }
      );
    },
  });

  // --- Encrypt PDF ---------------------------------------------------------
  registerTool({
    id: 'encrypt-pdf',
    description:
      'Protect this PDF with a password using 256-bit AES encryption.',
    primaryLabel: 'Encrypt PDF',
    doneLabel: 'PDF encrypted',
    output: 'revision',
    fields: [
      {
        key: 'userPassword',
        label: 'Password',
        value: '',
        type: 'password',
        placeholder: 'Required to open the PDF',
      },
      {
        key: 'ownerPassword',
        label: 'Owner password',
        value: '',
        type: 'password',
        advanced: true,
        help: 'Leave blank to use the same password with no usage restrictions.',
      },
    ],
    async run({ files, values, signal, progress }) {
      progress({ label: busyLabel('Encrypt PDF') });
      const { encryptPdf } = await import('../../engines/encrypt-pdf.js');
      return encryptPdf(
        files[0],
        {
          userPassword: values.userPassword,
          ownerPassword: values.ownerPassword,
        },
        { signal, progress }
      );
    },
  });

  // --- Decrypt PDF (Remove password) ---------------------------------------
  registerTool({
    id: 'decrypt-pdf',
    description: 'Remove password protection from this PDF.',
    primaryLabel: 'Remove password',
    doneLabel: 'Password removed',
    output: 'revision',
    fields: [
      {
        key: 'password',
        label: 'Password',
        value: '',
        type: 'password',
        placeholder: 'Current PDF password',
      },
    ],
    async run({ files, values, signal, progress }) {
      progress({ label: busyLabel('Remove password') });
      const { decryptPdf } = await import('../../engines/decrypt-pdf.js');
      return decryptPdf(
        files[0],
        { password: values.password },
        { signal, progress }
      );
    },
  });

  // --- Change Permissions ---------------------------------------------------
  registerTool({
    id: 'change-permissions',
    description:
      'Set what people can do with this PDF, like printing or copying text.',
    primaryLabel: 'Update permissions',
    doneLabel: 'Permissions updated',
    output: 'revision',
    fields: [
      {
        key: 'newOwnerPassword',
        label: 'Owner password',
        value: '',
        type: 'password',
        help: 'Required to enforce the permissions below.',
      },
      {
        key: 'allowPrinting',
        label: 'Allow printing',
        value: 'true',
        type: 'checkbox',
      },
      {
        key: 'allowCopying',
        label: 'Allow copying text and images',
        value: 'true',
        type: 'checkbox',
      },
      {
        key: 'allowModifying',
        label: 'Allow modifying the document',
        value: 'true',
        type: 'checkbox',
      },
      {
        key: 'allowAnnotating',
        label: 'Allow annotations and comments',
        value: 'true',
        type: 'checkbox',
      },
      {
        key: 'allowFillingForms',
        label: 'Allow filling forms',
        value: 'true',
        type: 'checkbox',
      },
      {
        key: 'allowDocumentAssembly',
        label: 'Allow document assembly',
        value: 'true',
        type: 'checkbox',
        advanced: true,
      },
      {
        key: 'allowPageExtraction',
        label: 'Allow page extraction',
        value: 'true',
        type: 'checkbox',
        advanced: true,
      },
      {
        key: 'newUserPassword',
        label: 'Password to open',
        value: '',
        type: 'password',
        advanced: true,
        help: 'Leave blank to allow opening without a password.',
      },
      {
        key: 'currentPassword',
        label: 'Current password',
        value: '',
        type: 'password',
        advanced: true,
        help: 'Only needed if this PDF is already password protected.',
      },
    ],
    async run({ files, values, signal, progress }) {
      progress({ label: busyLabel('Update permissions') });
      const { changePermissions } =
        await import('../../engines/change-permissions.js');
      return changePermissions(
        files[0],
        {
          currentPassword: values.currentPassword,
          newUserPassword: values.newUserPassword,
          newOwnerPassword: values.newOwnerPassword,
          allowPrinting: bool(values.allowPrinting),
          allowCopying: bool(values.allowCopying),
          allowModifying: bool(values.allowModifying),
          allowAnnotating: bool(values.allowAnnotating),
          allowFillingForms: bool(values.allowFillingForms),
          allowDocumentAssembly: bool(values.allowDocumentAssembly),
          allowPageExtraction: bool(values.allowPageExtraction),
        },
        { signal, progress }
      );
    },
  });

  // --- Remove Restrictions ---------------------------------------------------
  registerTool({
    id: 'remove-restrictions',
    description:
      'Remove owner-set restrictions like print and copy limits from this PDF.',
    primaryLabel: 'Remove restrictions',
    doneLabel: 'Restrictions removed',
    output: 'revision',
    fields: [
      {
        key: 'password',
        label: 'Owner password',
        value: '',
        type: 'password',
        advanced: true,
        help: 'Only needed if the PDF requires one.',
      },
    ],
    async run({ files, values, signal, progress }) {
      progress({ label: busyLabel('Remove restrictions') });
      const { removeRestrictions } =
        await import('../../engines/remove-restrictions.js');
      return removeRestrictions(
        files[0],
        { password: values.password },
        { signal, progress }
      );
    },
  });

  // --- Sanitize PDF -----------------------------------------------------------
  registerTool({
    id: 'sanitize-pdf',
    description:
      'Strip hidden content like scripts, metadata, and embedded files for safer sharing.',
    primaryLabel: 'Sanitize PDF',
    doneLabel: 'PDF sanitized',
    output: 'revision',
    fields: [
      {
        key: 'flattenForms',
        label: 'Flatten form fields',
        value: 'true',
        type: 'checkbox',
      },
      {
        key: 'removeMetadata',
        label: 'Remove metadata',
        value: 'true',
        type: 'checkbox',
      },
      {
        key: 'removeAnnotations',
        label: 'Remove annotations and comments',
        value: 'true',
        type: 'checkbox',
      },
      {
        key: 'removeJavascript',
        label: 'Remove JavaScript',
        value: 'true',
        type: 'checkbox',
      },
      {
        key: 'removeEmbeddedFiles',
        label: 'Remove embedded files',
        value: 'true',
        type: 'checkbox',
      },
      {
        key: 'removeLinks',
        label: 'Remove links',
        value: 'true',
        type: 'checkbox',
        advanced: true,
      },
      {
        key: 'removeLayers',
        label: 'Remove layers (OCG)',
        value: 'true',
        type: 'checkbox',
        advanced: true,
      },
      {
        key: 'removeStructureTree',
        label: 'Remove structure tree',
        value: 'true',
        type: 'checkbox',
        advanced: true,
      },
      {
        key: 'removeMarkInfo',
        label: 'Remove accessibility tags',
        value: 'true',
        type: 'checkbox',
        advanced: true,
      },
      {
        key: 'removeFonts',
        label: 'Remove embedded fonts',
        value: 'false',
        type: 'checkbox',
        advanced: true,
      },
    ],
    async run({ files, values, signal, progress }) {
      progress({ label: busyLabel('Sanitize PDF') });
      const { sanitizePdf } = await import('../../engines/sanitize-pdf.js');
      return sanitizePdf(
        files[0],
        {
          flattenForms: bool(values.flattenForms),
          removeMetadata: bool(values.removeMetadata),
          removeAnnotations: bool(values.removeAnnotations),
          removeJavascript: bool(values.removeJavascript),
          removeEmbeddedFiles: bool(values.removeEmbeddedFiles),
          removeLinks: bool(values.removeLinks),
          removeLayers: bool(values.removeLayers),
          removeStructureTree: bool(values.removeStructureTree),
          removeMarkInfo: bool(values.removeMarkInfo),
          removeFonts: bool(values.removeFonts),
        },
        { signal, progress }
      );
    },
  });

  // --- Repair PDF -----------------------------------------------------------
  registerTool({
    id: 'repair-pdf',
    description: 'Attempt to fix a damaged or corrupted PDF file.',
    primaryLabel: 'Repair PDF',
    doneLabel: 'PDF repaired',
    output: 'revision',
    fields: [],
    async run({ files, signal, progress }) {
      progress({ label: busyLabel('Repair PDF') });
      const { repairPdf } = await import('../../engines/repair-pdf.js');
      return repairPdf(files[0], {}, { signal, progress });
    },
  });

  // --- Linearize PDF (Optimize for web) --------------------------------------
  registerTool({
    id: 'linearize-pdf',
    description:
      'Restructure this PDF so pages start displaying before the whole file downloads.',
    primaryLabel: 'Optimize for web',
    doneLabel: 'PDF optimized for web',
    output: 'revision',
    fields: [],
    async run({ files, signal, progress }) {
      progress({ label: busyLabel('Optimize for web') });
      const { linearizePdf } = await import('../../engines/linearize-pdf.js');
      return linearizePdf(files[0], {}, { signal, progress });
    },
  });

  // --- Flatten PDF -----------------------------------------------------------
  registerTool({
    id: 'flatten-pdf',
    description:
      'Merge form fields and annotations into the page content so they can no longer be edited.',
    primaryLabel: 'Flatten PDF',
    doneLabel: 'PDF flattened',
    output: 'revision',
    fields: [],
    async run({ files, signal, progress }) {
      progress({ label: busyLabel('Flatten PDF') });
      const { flattenPdf } = await import('../../engines/flatten-pdf.js');
      return flattenPdf(files[0], {}, { signal, progress });
    },
  });

  // --- Edit Metadata (Save metadata) -------------------------------------------
  registerTool({
    id: 'edit-metadata',
    description: 'Update the title, author, and other document properties.',
    primaryLabel: 'Save metadata',
    doneLabel: 'Metadata saved',
    output: 'revision',
    fields: [
      {
        key: 'title',
        label: 'Title',
        value: '',
        type: 'text',
        help: 'Leave blank to keep the current value.',
      },
      {
        key: 'author',
        label: 'Author',
        value: '',
        type: 'text',
        help: 'Leave blank to keep the current value.',
      },
      {
        key: 'subject',
        label: 'Subject',
        value: '',
        type: 'text',
        help: 'Leave blank to keep the current value.',
      },
      {
        key: 'keywords',
        label: 'Keywords',
        value: '',
        type: 'text',
        placeholder: 'Comma-separated',
        help: 'Leave blank to keep the current value.',
      },
      {
        key: 'creator',
        label: 'Creator',
        value: '',
        type: 'text',
        advanced: true,
        help: 'Leave blank to keep the current value.',
      },
      {
        key: 'producer',
        label: 'Producer',
        value: '',
        type: 'text',
        advanced: true,
        help: 'Leave blank to keep the current value.',
      },
    ],
    async run({ files, values, signal, progress }) {
      progress({ label: busyLabel('Save metadata') });
      const { editMetadata } = await import('../../engines/edit-metadata.js');
      return editMetadata(
        files[0],
        {
          title: values.title,
          author: values.author,
          subject: values.subject,
          keywords: values.keywords,
          creator: values.creator,
          producer: values.producer,
        },
        { signal, progress }
      );
    },
  });

  // --- PDF to PDF/A --------------------------------------------------------
  registerTool({
    id: 'pdf-to-pdfa',
    description:
      'Convert this PDF into an archival PDF/A format for long-term preservation.',
    primaryLabel: 'Convert to PDF/A',
    doneLabel: 'Converted to PDF/A',
    output: 'new-document',
    fields: [
      {
        key: 'level',
        label: 'PDF/A level',
        value: 'PDF/A-2b',
        type: 'select',
        options: [
          ['PDF/A-1b', 'PDF/A-1b'],
          ['PDF/A-2b', 'PDF/A-2b'],
          ['PDF/A-3b', 'PDF/A-3b'],
        ],
      },
      {
        key: 'preFlatten',
        label: 'Pre-flatten pages before converting',
        value: 'false',
        type: 'checkbox',
        advanced: true,
        help: 'Helps with PDFs that use unsupported patterns or transparency.',
      },
    ],
    async run({ files, values, signal, progress }) {
      progress({ label: busyLabel('Convert to PDF/A') });
      const { pdfToPdfA } = await import('../../engines/pdf-to-pdfa.js');
      return pdfToPdfA(
        files[0],
        {
          level: values.level as PdfALevel,
          preFlatten: bool(values.preFlatten),
        },
        { signal, progress }
      );
    },
  });

  // --- Rasterize PDF -----------------------------------------------------------
  registerTool({
    id: 'rasterize-pdf',
    description:
      'Convert each page into a flattened image, useful for redaction or locking down content.',
    primaryLabel: 'Rasterize pages',
    doneLabel: 'Pages rasterized',
    output: 'revision',
    fields: [
      {
        key: 'dpi',
        label: 'Resolution',
        value: '150',
        type: 'select',
        options: [
          ['72', '72 DPI'],
          ['150', '150 DPI'],
          ['300', '300 DPI'],
          ['600', '600 DPI'],
        ],
      },
      {
        key: 'format',
        label: 'Image format',
        value: 'png',
        type: 'segmented',
        options: [
          ['png', 'PNG'],
          ['jpeg', 'JPEG'],
        ],
      },
      {
        key: 'grayscale',
        label: 'Convert to grayscale',
        value: 'false',
        type: 'checkbox',
        advanced: true,
      },
    ],
    async run({ files, values, signal, progress }) {
      progress({ label: busyLabel('Rasterize pages') });
      const { rasterizePdf } = await import('../../engines/rasterize-pdf.js');
      return rasterizePdf(
        files[0],
        {
          dpi: num(values.dpi, 150),
          format: values.format as 'png' | 'jpeg',
          grayscale: bool(values.grayscale),
        },
        { signal, progress }
      );
    },
  });

  // --- Font to Outline -----------------------------------------------------------
  registerTool({
    id: 'font-to-outline',
    description:
      'Convert embedded text into vector outlines so the PDF displays identically everywhere.',
    primaryLabel: 'Convert text to outlines',
    doneLabel: 'Text converted to outlines',
    output: 'revision',
    fields: [],
    async run({ files, signal, progress }) {
      progress({ label: busyLabel('Convert text to outlines') });
      const { fontToOutline } =
        await import('../../engines/font-to-outline.js');
      return fontToOutline(files[0], {}, { signal, progress });
    },
  });

  // --- Deskew PDF -----------------------------------------------------------
  registerTool({
    id: 'deskew-pdf',
    description:
      'Automatically straighten scanned pages that are slightly rotated.',
    primaryLabel: 'Straighten pages',
    doneLabel: 'Pages straightened',
    output: 'revision',
    fields: [
      {
        key: 'threshold',
        label: 'Sensitivity',
        value: '0.5',
        type: 'select',
        options: [
          ['0.1', 'High'],
          ['0.5', 'Medium'],
          ['1', 'Low'],
        ],
        help: 'Minimum skew angle (degrees) worth correcting.',
      },
      {
        key: 'dpi',
        label: 'Analysis resolution',
        value: '150',
        type: 'select',
        options: [
          ['150', '150 DPI'],
          ['300', '300 DPI'],
        ],
        advanced: true,
      },
    ],
    async run({ files, values, signal, progress }) {
      progress({ label: busyLabel('Straighten pages') });
      const { deskewPdf } = await import('../../engines/deskew-pdf.js');
      return deskewPdf(
        files[0],
        { threshold: num(values.threshold, 0.5), dpi: num(values.dpi, 150) },
        { signal, progress }
      );
    },
  });

  // --- Fix Page Size -----------------------------------------------------------
  const pageScopeSizes: ToolField['options'] = [
    ['A4', 'A4'],
    ['Letter', 'Letter'],
    ['Legal', 'Legal'],
    ['Tabloid', 'Tabloid'],
    ['A3', 'A3'],
    ['A5', 'A5'],
    ['Custom', 'Custom'],
  ];
  const fixPageSizeFields: ToolField[] = [
    {
      key: 'targetSize',
      label: 'Page size',
      value: 'A4',
      type: 'select',
      options: pageScopeSizes,
    },
    {
      key: 'orientation',
      label: 'Orientation',
      value: 'auto',
      type: 'segmented',
      options: [
        ['auto', 'Auto'],
        ['portrait', 'Portrait'],
        ['landscape', 'Landscape'],
      ],
    },
    {
      key: 'scalingMode',
      label: 'Scaling',
      value: 'fit',
      type: 'segmented',
      options: [
        ['fit', 'Fit'],
        ['fill', 'Fill'],
      ],
    },
    {
      key: 'backgroundColor',
      label: 'Background color',
      value: '#ffffff',
      type: 'color',
      advanced: true,
    },
    {
      key: 'customWidth',
      label: 'Custom width',
      value: '210',
      type: 'number',
      advanced: true,
    },
    {
      key: 'customHeight',
      label: 'Custom height',
      value: '297',
      type: 'number',
      advanced: true,
    },
    {
      key: 'customUnits',
      label: 'Custom units',
      value: 'mm',
      type: 'select',
      options: [
        ['mm', 'mm'],
        ['in', 'in'],
      ],
      advanced: true,
    },
  ];
  registerTool({
    id: 'fix-page-size',
    description:
      'Make every page the same size by scaling content onto a standard page.',
    primaryLabel: 'Fix page size',
    doneLabel: 'Page size fixed',
    output: 'revision',
    fields: fixPageSizeFields,
    async run({ files, values, signal, progress }) {
      progress({ label: busyLabel('Fix page size') });
      const { fixPageSize } = await import('../../engines/fix-page-size.js');
      return fixPageSize(
        files[0],
        {
          targetSize: values.targetSize,
          orientation: values.orientation as 'auto' | 'portrait' | 'landscape',
          scalingMode: values.scalingMode as 'fit' | 'fill',
          backgroundColor: values.backgroundColor,
          customWidth: num(values.customWidth, 210),
          customHeight: num(values.customHeight, 297),
          customUnits: values.customUnits as 'mm' | 'in',
        },
        { signal, progress }
      );
    },
  });
}
