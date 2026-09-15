// Tool definitions for the appearance family. See docs/TOOL-MIGRATION-GUIDE.md.
// Engines are imported lazily inside run() so the registry stays cheap to load.
import type {
  PageNumberFormat,
  PageNumberPosition,
} from '../../engines/page-numbers.js';
import { registerTool } from '../registry.js';
import type { ToolField } from '../types.js';

type Orientation = 'auto' | 'portrait' | 'landscape';

const positions: [string, string][] = [
  ['bottom-center', 'Bottom center'],
  ['bottom-left', 'Bottom left'],
  ['bottom-right', 'Bottom right'],
  ['top-center', 'Top center'],
  ['top-left', 'Top left'],
  ['top-right', 'Top right'],
];

const orientation: ToolField = {
  key: 'orientation',
  label: 'Orientation',
  value: 'auto',
  type: 'segmented',
  options: [
    ['auto', 'Auto'],
    ['portrait', 'Portrait'],
    ['landscape', 'Landscape'],
  ],
};

export function register(): void {
  registerTool({
    id: 'page-numbers',
    description: 'Add page numbers to every page.',
    primaryLabel: 'Add page numbers',
    doneLabel: 'Page numbers added',
    output: 'revision',
    preview: true,
    fields: [
      {
        key: 'position',
        label: 'Position',
        value: 'bottom-center',
        type: 'select',
        options: positions,
      },
      {
        key: 'format',
        label: 'Format',
        value: 'simple',
        type: 'segmented',
        options: [
          ['simple', '1, 2, 3'],
          ['page_x_of_y', '1 of 5'],
        ],
      },
      {
        key: 'fontSize',
        label: 'Font size (pt)',
        value: '12',
        type: 'number',
        min: '6',
        max: '72',
        advanced: true,
      },
      {
        key: 'color',
        label: 'Color',
        value: '#000000',
        type: 'color',
        advanced: true,
      },
    ],
    async run({ files, values, signal, progress }) {
      const { pageNumbers } = await import('../../engines/page-numbers.js');
      return pageNumbers(
        files[0],
        {
          position: values.position as PageNumberPosition,
          format: values.format as PageNumberFormat,
          fontSize: parseInt(values.fontSize, 10) || 12,
          color: values.color,
        },
        { signal, progress }
      );
    },
  });

  registerTool({
    id: 'bates-numbering',
    description: 'Stamp sequential Bates numbers on every page.',
    primaryLabel: 'Add Bates numbers',
    doneLabel: 'Bates numbers added',
    output: 'revision',
    preview: true,
    fields: [
      {
        key: 'template',
        label: 'Template',
        value: '[BATES]',
        help: 'Use [BATES], [PAGE], [FILE] and [FILENAME] placeholders.',
      },
      {
        key: 'startNumber',
        label: 'Start number',
        value: '1',
        type: 'number',
        min: '1',
      },
      {
        key: 'padding',
        label: 'Digits',
        value: '6',
        type: 'select',
        options: [
          ['6', '6 digits (000001)'],
          ['5', '5 digits (00001)'],
          ['4', '4 digits (0001)'],
          ['3', '3 digits (001)'],
          ['0', 'No padding (1)'],
        ],
      },
      {
        key: 'position',
        label: 'Position',
        value: 'bottom-center',
        type: 'select',
        options: positions,
      },
      {
        key: 'fontFamily',
        label: 'Font',
        value: 'Helvetica',
        type: 'select',
        options: [
          ['Helvetica', 'Helvetica'],
          ['TimesRoman', 'Times New Roman'],
          ['Courier', 'Courier'],
        ],
        advanced: true,
      },
      {
        key: 'fontSize',
        label: 'Font size (pt)',
        value: '10',
        type: 'number',
        min: '6',
        max: '72',
        advanced: true,
      },
      {
        key: 'color',
        label: 'Color',
        value: '#000000',
        type: 'color',
        advanced: true,
      },
    ],
    async run({ files, values, signal, progress }) {
      const { batesNumbering } =
        await import('../../engines/bates-numbering.js');
      return batesNumbering(
        files[0],
        {
          template: values.template,
          startNumber: parseInt(values.startNumber, 10) || 1,
          padding: parseInt(values.padding, 10) || 0,
          position: values.position as never,
          fontFamily: values.fontFamily as never,
          fontSize: parseInt(values.fontSize, 10) || 10,
          color: values.color,
        },
        { signal, progress }
      );
    },
  });

  registerTool({
    id: 'add-page-labels',
    description:
      'Set the page labels readers see in PDF apps, like i, ii, iii or A-1.',
    primaryLabel: 'Apply page labels',
    doneLabel: 'Page labels applied',
    output: 'revision',
    fields: [
      {
        key: 'pageRange',
        label: 'Pages',
        value: '',
        placeholder: 'All pages',
        help: 'Leave blank for all pages. Example: 1-4, 7',
      },
      {
        key: 'style',
        label: 'Label style',
        value: 'DecimalArabic',
        type: 'select',
        options: [
          ['DecimalArabic', '1, 2, 3'],
          ['LowercaseRoman', 'i, ii, iii'],
          ['UppercaseRoman', 'I, II, III'],
          ['LowercaseLetters', 'a, b, c'],
          ['UppercaseLetters', 'A, B, C'],
          ['NoLabelPrefixOnly', 'Prefix only'],
        ],
      },
      {
        key: 'prefix',
        label: 'Prefix',
        value: '',
        placeholder: 'e.g. A-',
        advanced: true,
      },
      {
        key: 'startValue',
        label: 'Start at',
        value: '1',
        type: 'number',
        min: '0',
        advanced: true,
      },
      {
        key: 'progress',
        label: 'Continue numbering across ranges',
        value: 'false',
        type: 'checkbox',
        advanced: true,
      },
      {
        key: 'removeExistingLabels',
        label: 'Replace existing labels',
        value: 'true',
        type: 'checkbox',
        advanced: true,
      },
    ],
    async run({ files, values, signal, progress }) {
      const { addPageLabels } =
        await import('../../engines/add-page-labels.js');
      return addPageLabels(
        files[0],
        {
          removeExistingLabels: values.removeExistingLabels === 'true',
          rules: [
            {
              pageRange: values.pageRange,
              style: values.style as never,
              prefix: values.prefix,
              startValue: parseInt(values.startValue, 10) || 0,
              progress: values.progress === 'true',
            },
          ],
        },
        { signal, progress }
      );
    },
  });

  registerTool({
    id: 'invert-colors',
    description: 'Invert colors on every page, turning light pages dark.',
    primaryLabel: 'Invert colors',
    doneLabel: 'Colors inverted',
    output: 'revision',
    fields: [],
    async run({ files, signal, progress }) {
      const { invertColors } = await import('../../engines/invert-colors.js');
      return invertColors(files[0], {}, { signal, progress });
    },
  });

  registerTool({
    id: 'scanner-effect',
    description:
      'Make the document look printed and scanned, with grain, tilt and paper tone.',
    primaryLabel: 'Apply scanner effect',
    doneLabel: 'Scanner effect applied',
    output: 'revision',
    fields: [
      {
        key: 'noise',
        label: 'Grain',
        value: '10',
        type: 'number',
        min: '0',
        max: '100',
      },
      {
        key: 'grayscale',
        label: 'Grayscale',
        value: 'false',
        type: 'checkbox',
      },
      {
        key: 'resolution',
        label: 'Resolution (dpi)',
        value: '150',
        type: 'number',
        min: '72',
        max: '600',
        advanced: true,
      },
      {
        key: 'border',
        label: 'Darken edges',
        value: 'false',
        type: 'checkbox',
        advanced: true,
      },
      {
        key: 'rotate',
        label: 'Tilt (degrees)',
        value: '0',
        type: 'number',
        min: '-15',
        max: '15',
        advanced: true,
      },
      {
        key: 'rotateVariance',
        label: 'Tilt variation (degrees)',
        value: '0',
        type: 'number',
        min: '0',
        max: '15',
        advanced: true,
      },
      {
        key: 'brightness',
        label: 'Brightness',
        value: '0',
        type: 'number',
        min: '-100',
        max: '100',
        advanced: true,
      },
      {
        key: 'contrast',
        label: 'Contrast',
        value: '0',
        type: 'number',
        min: '-100',
        max: '100',
        advanced: true,
      },
      {
        key: 'blur',
        label: 'Blur',
        value: '0',
        type: 'number',
        min: '0',
        max: '10',
        advanced: true,
      },
      {
        key: 'yellowish',
        label: 'Aged paper tone',
        value: '0',
        type: 'number',
        min: '0',
        max: '100',
        advanced: true,
      },
    ],
    async run({ files, values, signal, progress }) {
      const { scannerEffect } = await import('../../engines/scanner-effect.js');
      return scannerEffect(
        files[0],
        {
          grayscale: values.grayscale === 'true',
          border: values.border === 'true',
          rotate: Number(values.rotate),
          rotateVariance: Number(values.rotateVariance),
          brightness: Number(values.brightness),
          contrast: Number(values.contrast),
          blur: Number(values.blur),
          noise: Number(values.noise),
          yellowish: Number(values.yellowish),
          resolution: Number(values.resolution),
        },
        { signal, progress }
      );
    },
  });

  registerTool({
    id: 'adjust-colors',
    description:
      'Fine-tune brightness, contrast, saturation and color balance.',
    primaryLabel: 'Apply color adjustments',
    doneLabel: 'Colors adjusted',
    output: 'revision',
    fields: [
      {
        key: 'brightness',
        label: 'Brightness',
        value: '0',
        type: 'number',
        min: '-100',
        max: '100',
      },
      {
        key: 'contrast',
        label: 'Contrast',
        value: '0',
        type: 'number',
        min: '-100',
        max: '100',
      },
      {
        key: 'saturation',
        label: 'Saturation',
        value: '0',
        type: 'number',
        min: '-100',
        max: '100',
      },
      {
        key: 'hueShift',
        label: 'Hue shift',
        value: '0',
        type: 'number',
        min: '-180',
        max: '180',
        advanced: true,
      },
      {
        key: 'temperature',
        label: 'Temperature',
        value: '0',
        type: 'number',
        min: '-100',
        max: '100',
        advanced: true,
      },
      {
        key: 'tint',
        label: 'Tint',
        value: '0',
        type: 'number',
        min: '-100',
        max: '100',
        advanced: true,
      },
      {
        key: 'gamma',
        label: 'Gamma',
        value: '1.0',
        type: 'number',
        min: '0.1',
        max: '3',
        step: '0.1',
        advanced: true,
      },
      {
        key: 'sepia',
        label: 'Sepia',
        value: '0',
        type: 'number',
        min: '0',
        max: '100',
        advanced: true,
      },
    ],
    async run({ files, values, signal, progress }) {
      const { adjustColors } = await import('../../engines/adjust-colors.js');
      return adjustColors(
        files[0],
        {
          brightness: Number(values.brightness),
          contrast: Number(values.contrast),
          saturation: Number(values.saturation),
          hueShift: Number(values.hueShift),
          temperature: Number(values.temperature),
          tint: Number(values.tint),
          gamma: Number(values.gamma),
          sepia: Number(values.sepia),
        },
        { signal, progress }
      );
    },
  });

  registerTool({
    id: 'background-color',
    description: 'Fill a solid color behind every page.',
    primaryLabel: 'Change background color',
    doneLabel: 'Background color changed',
    output: 'revision',
    preview: true,
    fields: [
      {
        key: 'color',
        label: 'Background color',
        value: '#ffffff',
        type: 'color',
      },
    ],
    async run({ files, values, signal, progress }) {
      const { backgroundColor } =
        await import('../../engines/background-color.js');
      return backgroundColor(
        files[0],
        { color: values.color },
        { signal, progress }
      );
    },
  });

  registerTool({
    id: 'text-color',
    description: 'Recolor dark text on every page.',
    primaryLabel: 'Change text color',
    doneLabel: 'Text color changed',
    output: 'revision',
    fields: [
      { key: 'color', label: 'Text color', value: '#000000', type: 'color' },
      {
        key: 'darknessThreshold',
        label: 'Darkness threshold',
        value: '120',
        type: 'number',
        min: '0',
        max: '255',
        help: 'Pixels darker than this are treated as text.',
        advanced: true,
      },
    ],
    async run({ files, values, signal, progress }) {
      const { textColor } = await import('../../engines/text-color.js');
      return textColor(
        files[0],
        {
          color: values.color,
          darknessThreshold: Number(values.darknessThreshold),
        },
        { signal, progress }
      );
    },
  });

  registerTool({
    id: 'posterize-pdf',
    description: 'Split each page into a grid of tiles for poster printing.',
    primaryLabel: 'Create poster pages',
    doneLabel: 'Poster pages created',
    output: 'new-document',
    fields: [
      {
        key: 'rows',
        label: 'Rows',
        value: '1',
        type: 'number',
        min: '1',
        max: '10',
        step: '1',
      },
      {
        key: 'cols',
        label: 'Columns',
        value: '2',
        type: 'number',
        min: '1',
        max: '10',
        step: '1',
      },
      {
        key: 'pageSize',
        label: 'Paper size',
        value: 'A4',
        type: 'select',
        options: [
          ['A4', 'A4'],
          ['Letter', 'Letter'],
          ['Legal', 'Legal'],
          ['A3', 'A3'],
          ['A5', 'A5'],
        ],
      },
      orientation,
      {
        key: 'scalingMode',
        label: 'Scaling',
        value: 'fit',
        type: 'segmented',
        options: [
          ['fit', 'Fit'],
          ['fill', 'Fill and crop'],
        ],
        advanced: true,
      },
      {
        key: 'overlap',
        label: 'Overlap',
        value: '0',
        type: 'number',
        min: '0',
        max: '100',
        step: '1',
        advanced: true,
      },
      {
        key: 'overlapUnit',
        label: 'Overlap unit',
        value: 'pt',
        type: 'segmented',
        options: [
          ['pt', 'pt'],
          ['mm', 'mm'],
          ['in', 'in'],
        ],
        advanced: true,
      },
      {
        key: 'pages',
        label: 'Pages',
        value: '',
        placeholder: 'All pages',
        help: 'Leave blank for all pages. Example: 1-3, 5',
        advanced: true,
      },
    ],
    async run({ files, values, signal, progress }) {
      const { posterizePdf } = await import('../../engines/posterize-pdf.js');
      return posterizePdf(
        files[0],
        {
          rows: Number(values.rows) || 1,
          cols: Number(values.cols) || 1,
          pageSize: values.pageSize,
          orientation: values.orientation as Orientation,
          scalingMode: values.scalingMode as 'fit' | 'fill',
          overlap: Number(values.overlap) || 0,
          overlapUnit: values.overlapUnit as 'pt' | 'in' | 'mm',
          pages: values.pages,
        },
        { signal, progress }
      );
    },
  });

  registerTool({
    id: 'n-up-pdf',
    description: 'Print several pages on each sheet.',
    primaryLabel: 'Create N-up PDF',
    doneLabel: 'N-up PDF created',
    output: 'new-document',
    fields: [
      {
        key: 'pagesPerSheet',
        label: 'Pages per sheet',
        value: '4',
        type: 'segmented',
        options: [
          ['2', '2'],
          ['4', '4'],
          ['9', '9'],
          ['16', '16'],
        ],
      },
      {
        key: 'pageSize',
        label: 'Paper size',
        value: 'Letter',
        type: 'select',
        options: [
          ['Letter', 'Letter'],
          ['A4', 'A4'],
          ['Legal', 'Legal'],
          ['A3', 'A3'],
        ],
      },
      orientation,
      {
        key: 'margins',
        label: 'Add margins',
        value: 'false',
        type: 'checkbox',
        advanced: true,
      },
      {
        key: 'border',
        label: 'Add borders',
        value: 'false',
        type: 'checkbox',
        advanced: true,
      },
      {
        key: 'borderColor',
        label: 'Border color',
        value: '#000000',
        type: 'color',
        advanced: true,
      },
    ],
    async run({ files, values, signal, progress }) {
      const { nUpPdf } = await import('../../engines/n-up-pdf.js');
      return nUpPdf(
        files[0],
        {
          pagesPerSheet: Number(values.pagesPerSheet) as 2 | 4 | 9 | 16,
          pageSize: values.pageSize,
          orientation: values.orientation as Orientation,
          margins: values.margins === 'true',
          border: values.border === 'true',
          borderColor: values.borderColor,
        },
        { signal, progress }
      );
    },
  });

  registerTool({
    id: 'pdf-booklet',
    description: 'Arrange pages in fold-and-staple booklet order.',
    primaryLabel: 'Create booklet',
    doneLabel: 'Booklet created',
    output: 'new-document',
    fields: [
      {
        key: 'gridMode',
        label: 'Layout',
        value: '1x2',
        type: 'segmented',
        options: [
          ['1x2', 'Booklet'],
          ['2x2', '2×2'],
          ['2x4', '2×4'],
          ['4x4', '4×4'],
        ],
      },
      {
        key: 'paperSize',
        label: 'Paper size',
        value: 'Letter',
        type: 'select',
        options: [
          ['Letter', 'Letter'],
          ['Legal', 'Legal'],
          ['Tabloid', 'Tabloid'],
          ['A4', 'A4'],
          ['A3', 'A3'],
          ['A5', 'A5'],
        ],
      },
      { ...orientation, advanced: true },
      {
        key: 'rotation',
        label: 'Page rotation',
        value: 'none',
        type: 'select',
        options: [
          ['none', 'None'],
          ['90cw', '90° clockwise'],
          ['90ccw', '90° counterclockwise'],
          ['alternate', 'Alternate'],
        ],
        advanced: true,
      },
    ],
    async run({ files, values, signal, progress }) {
      const { pdfBooklet } = await import('../../engines/pdf-booklet.js');
      return pdfBooklet(
        files[0],
        {
          gridMode: values.gridMode as '1x2' | '2x2' | '2x4' | '4x4',
          paperSize: values.paperSize,
          orientation: values.orientation as Orientation,
          rotation: values.rotation as 'none' | '90cw' | '90ccw' | 'alternate',
        },
        { signal, progress }
      );
    },
  });

  registerTool({
    id: 'combine-single-page',
    description: 'Join every page into one long page.',
    primaryLabel: 'Combine into one page',
    doneLabel: 'Pages combined',
    output: 'new-document',
    fields: [
      {
        key: 'orientation',
        label: 'Direction',
        value: 'vertical',
        type: 'segmented',
        options: [
          ['vertical', 'Top to bottom'],
          ['horizontal', 'Left to right'],
        ],
      },
      {
        key: 'spacing',
        label: 'Spacing (pt)',
        value: '0',
        type: 'number',
        min: '0',
        max: '200',
        step: '1',
      },
      {
        key: 'backgroundColor',
        label: 'Background color',
        value: '#ffffff',
        type: 'color',
        advanced: true,
      },
      {
        key: 'addSeparator',
        label: 'Add separator lines',
        value: 'false',
        type: 'checkbox',
        advanced: true,
      },
      {
        key: 'separatorThickness',
        label: 'Separator thickness (pt)',
        value: '0.5',
        type: 'number',
        min: '0.1',
        max: '10',
        step: '0.1',
        advanced: true,
      },
      {
        key: 'separatorColor',
        label: 'Separator color',
        value: '#000000',
        type: 'color',
        advanced: true,
      },
    ],
    async run({ files, values, signal, progress }) {
      const { combineSinglePage } =
        await import('../../engines/combine-single-page.js');
      return combineSinglePage(
        files[0],
        {
          orientation: values.orientation as 'vertical' | 'horizontal',
          spacing: Number(values.spacing) || 0,
          backgroundColor: values.backgroundColor,
          addSeparator: values.addSeparator === 'true',
          separatorThickness: Number(values.separatorThickness) || 0.5,
          separatorColor: values.separatorColor,
        },
        { signal, progress }
      );
    },
  });
}
