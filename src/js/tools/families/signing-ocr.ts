// Tool definitions for the signing & OCR family. See docs/TOOL-MIGRATION-GUIDE.md.
//
// Engines are imported lazily inside each `run()`/`inspect()` — never
// statically at module scope. The registry loads with the workspace, and a
// static import would pull heavy engines (tesseract.js, node-forge,
// zgapdfsigner) into startup and break environments without them.
import { registerTool, busyLabel } from '../registry.js';
import type { ToolField } from '../types.js';
import { getAvailableTesseractLanguageEntries } from '../../utils/tesseract-language-availability.js';
import { TIMESTAMP_TSA_PRESETS } from '../../config/timestamp-tsa.js';

const ocrLanguageOptions: [string, string][] =
  getAvailableTesseractLanguageEntries().map(([code, name]) => [code, name]);
const defaultOcrLanguage =
  (ocrLanguageOptions.find(([code]) => code === 'eng')?.[0] ??
    ocrLanguageOptions[0]?.[0]) ||
  'eng';

const ocrFields: ToolField[] = [
  {
    key: 'language',
    label: 'Language',
    value: defaultOcrLanguage,
    type: 'select',
    options: ocrLanguageOptions.length
      ? ocrLanguageOptions
      : [['eng', 'English']],
  },
  {
    key: 'resolution',
    label: 'Resolution',
    value: '3',
    type: 'select',
    options: [
      ['2', 'Standard (192 DPI)'],
      ['3', 'High (288 DPI)'],
      ['4', 'Ultra (384 DPI)'],
    ],
    advanced: true,
  },
  {
    key: 'binarize',
    label: 'Binarize image (enhance contrast for clean scans)',
    value: 'false',
    type: 'checkbox',
    advanced: true,
  },
  {
    key: 'embedFullFonts',
    label: 'Embed full fonts (larger file, better compatibility)',
    value: 'false',
    type: 'checkbox',
    advanced: true,
  },
];

const signFields: ToolField[] = [
  {
    key: 'password',
    label: 'Certificate password',
    value: '',
    type: 'password',
  },
  { key: 'reason', label: 'Reason', value: '', type: 'text' },
  {
    key: 'location',
    label: 'Location',
    value: '',
    type: 'text',
    advanced: true,
  },
  {
    key: 'contactInfo',
    label: 'Contact',
    value: '',
    type: 'text',
    advanced: true,
  },
  {
    key: 'visibleSignature',
    label: 'Add a visible signature',
    value: 'false',
    type: 'checkbox',
    advanced: true,
  },
  {
    key: 'signaturePage',
    label: 'Page',
    value: '1',
    type: 'number',
    min: '1',
    advanced: true,
    help: 'Only used when a visible signature is added.',
  },
  {
    key: 'signatureX',
    label: 'Position — X',
    value: '25',
    type: 'number',
    advanced: true,
  },
  {
    key: 'signatureY',
    label: 'Position — Y',
    value: '700',
    type: 'number',
    advanced: true,
  },
  {
    key: 'signatureText',
    label: 'Signature text',
    value: '',
    type: 'text',
    advanced: true,
    placeholder: 'Digitally signed by …',
  },
];

const timestampFields: ToolField[] = [
  {
    key: 'tsaUrl',
    label: 'Timestamp authority (TSA) server',
    value: TIMESTAMP_TSA_PRESETS[0]?.url ?? '',
    type: 'select',
    options: TIMESTAMP_TSA_PRESETS.map((preset) => [preset.url, preset.label]),
  },
];

export function register(): void {
  registerTool({
    id: 'ocr-pdf',
    description:
      'Recognize text in scanned pages and add an invisible, searchable text layer. Runs on this device and may take a while for long documents.',
    fields: ocrFields,
    primaryLabel: 'Recognize text',
    doneLabel: 'Text recognized',
    output: 'revision',
    async run({ files, values, signal, progress }) {
      progress({ label: busyLabel('Recognize text') });
      const { ocrPdf } = await import('../../engines/ocr-pdf.js');
      return ocrPdf(
        files[0],
        {
          languages: [values.language || defaultOcrLanguage],
          resolution: values.resolution ? Number(values.resolution) : undefined,
          binarize: values.binarize === 'true',
          embedFullFonts: values.embedFullFonts === 'true',
        },
        { signal, progress }
      );
    },
  });

  registerTool({
    id: 'digital-sign-pdf',
    preserveOriginal: true,
    description:
      'Add a certificate-based digital signature. Runs on this device — the certificate and its password never leave it.',
    fields: signFields,
    primaryLabel: 'Sign and download',
    doneLabel: 'PDF signed',
    output: 'download',
    extraInput: {
      accept: '.p12,.pfx,application/x-pkcs12',
      multiple: false,
      label: 'Choose certificate (.p12 or .pfx)',
    },
    async run({ files, values, signal, progress }) {
      progress({ label: busyLabel('Sign and download') });
      const { digitalSignPdf } =
        await import('../../engines/digital-sign-pdf.js');
      const visibleSignature =
        values.visibleSignature === 'true'
          ? {
              enabled: true,
              page: values.signaturePage ? Number(values.signaturePage) - 1 : 0,
              x: values.signatureX ? Number(values.signatureX) : undefined,
              y: values.signatureY ? Number(values.signatureY) : undefined,
              text: values.signatureText || undefined,
            }
          : undefined;
      return digitalSignPdf(
        files,
        {
          password: values.password ?? '',
          reason: values.reason,
          location: values.location,
          contactInfo: values.contactInfo,
          visibleSignature,
        },
        { signal, progress }
      );
    },
  });

  registerTool({
    id: 'validate-signature-pdf',
    preserveOriginal: true,
    description:
      'Check digital signatures for validity, document coverage, and certificate details.',
    fields: [],
    primaryLabel: 'Export report',
    doneLabel: 'Report exported',
    output: 'download',
    async inspect(file) {
      const { analyzeSignatures, signatureDetailRows } =
        await import('../../engines/validate-signature-pdf.js');
      const results = await analyzeSignatures(file);
      return { details: signatureDetailRows(results) };
    },
    async run({ files, signal, progress }) {
      progress({ label: busyLabel('Export report') });
      const { exportSignatureReport } =
        await import('../../engines/validate-signature-pdf.js');
      return exportSignatureReport(files[0], {}, { signal, progress });
    },
  });

  registerTool({
    id: 'timestamp-pdf',
    preserveOriginal: true,
    description:
      'Add an RFC 3161 trusted timestamp. Only the document hash — not the file itself — is sent to the chosen timestamp server.',
    fields: timestampFields,
    primaryLabel: 'Timestamp and download',
    doneLabel: 'PDF timestamped',
    output: 'download',
    async run({ files, values, signal, progress }) {
      progress({ label: busyLabel('Timestamp and download') });
      const { timestampPdf } = await import('../../engines/timestamp-pdf.js');
      return timestampPdf(
        files[0],
        { tsaUrl: values.tsaUrl || timestampFields[0].value },
        { signal, progress }
      );
    },
  });
}
