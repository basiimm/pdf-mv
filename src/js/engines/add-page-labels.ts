// Pure engine for the Add page labels tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/add-page-labels-page.ts. Uses the CoherentPDF
// (cpdf) WASM library to set PDF page-label dictionary entries. No DOM, no
// showAlert/showLoader; cpdf is loaded lazily inside the engine function.
import { loadPdfDocument } from '../utils/load-pdf-document.js';
import {
  normalizePageLabelStartValue,
  resolvePageLabelStyle,
} from '../utils/page-labels.js';
import type { PageLabelStyleName } from '../utils/page-labels.js';
import type { CpdfInstance } from '../types/utils-types.js';

export type { PageLabelStyleName } from '../utils/page-labels.js';

export interface PageLabelRuleOptions {
  /** Page range, e.g. "1-4, 7, odd". Blank = all pages. */
  pageRange?: string;
  style?: PageLabelStyleName;
  /** Optional label prefix, e.g. "A-". */
  prefix?: string;
  /** First numeric value applied within the range. */
  startValue?: number;
  /** Continue numbering across disjoint ranges within this rule. */
  progress?: boolean;
}

export interface AddPageLabelsOptions {
  rules?: PageLabelRuleOptions[];
  /** Clear any existing page labels before applying the rules. */
  removeExistingLabels?: boolean;
}

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

export const defaultPageLabelRule: Required<PageLabelRuleOptions> = {
  pageRange: '',
  style: 'DecimalArabic',
  prefix: '',
  startValue: 1,
  progress: false,
};

export const defaultAddPageLabelsOptions: Required<AddPageLabelsOptions> = {
  rules: [defaultPageLabelRule],
  removeExistingLabels: true,
};

function resolveOptions(
  options: AddPageLabelsOptions
): Required<AddPageLabelsOptions> {
  const rules =
    options.rules && options.rules.length > 0
      ? options.rules.map((rule) => ({ ...defaultPageLabelRule, ...rule }))
      : [defaultPageLabelRule];
  return {
    rules,
    removeExistingLabels:
      options.removeExistingLabels ??
      defaultAddPageLabelsOptions.removeExistingLabels,
  };
}

export async function addPageLabels(
  file: File,
  options: AddPageLabelsOptions,
  ctx: EngineContext
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  const opts = resolveOptions(options);

  // Load lazily: cpdf is a heavy WASM module and may not be configured.
  const { isCpdfAvailable, getCpdf } = await import('../utils/cpdf-helper.js');

  if (!isCpdfAvailable()) {
    throw new Error(
      'This feature requires an additional component. Configure it in WASM Settings.'
    );
  }

  ctx.progress({ label: 'Loading document', value: 0 });
  const arrayBuffer = await file.arrayBuffer();

  let pdfLibDoc;
  try {
    pdfLibDoc = await loadPdfDocument(arrayBuffer);
  } catch (error) {
    throw new Error('Could not read this PDF file.', { cause: error });
  }
  if (pdfLibDoc.isEncrypted) {
    throw new Error(
      'This PDF is password-protected. Remove the password and try again.'
    );
  }

  if (ctx.signal.aborted) throw new Error('Cancelled');
  ctx.progress({ label: 'Loading engine…', value: 0.05 });
  const cpdf: CpdfInstance = await getCpdf();
  cpdf.setSlow?.();

  let pdf: unknown = null;
  try {
    const inputBytes = new Uint8Array(arrayBuffer);
    pdf = cpdf.fromMemory(inputBytes, '');

    if (opts.removeExistingLabels) {
      cpdf.removePageLabels(pdf);
    }

    for (let index = 0; index < opts.rules.length; index++) {
      if (ctx.signal.aborted) throw new Error('Cancelled');
      const rule = opts.rules[index];
      ctx.progress({
        label: `Rule ${index + 1} of ${opts.rules.length}`,
        value: 0.1 + (0.8 * index) / opts.rules.length,
      });

      const trimmedRange = (rule.pageRange ?? '').trim();
      let range: unknown;
      try {
        range = trimmedRange
          ? cpdf.parsePagespec(pdf, trimmedRange)
          : cpdf.all(pdf);
      } catch (error) {
        throw new Error(
          `Rule ${index + 1} has an invalid page range: ${trimmedRange || 'all pages'}`,
          { cause: error }
        );
      }

      cpdf.addPageLabels(
        pdf,
        resolvePageLabelStyle(cpdf, rule.style ?? 'DecimalArabic'),
        (rule.prefix ?? '').trim(),
        normalizePageLabelStartValue(rule.startValue ?? 1),
        range,
        rule.progress ?? false
      );
    }

    ctx.progress({ label: 'Saving document', value: 0.95 });
    const outputBytes = new Uint8Array(cpdf.toMemory(pdf, false, false));
    if (!outputBytes || outputBytes.length === 0) {
      throw new Error('CoherentPDF produced an empty file.');
    }

    return new File([outputBytes], file.name || 'document.pdf', {
      type: 'application/pdf',
    });
  } finally {
    if (pdf) {
      try {
        cpdf.deletePdf(pdf);
      } catch (cleanupError) {
        console.warn(
          '[add-page-labels] Failed to cleanup CoherentPDF document:',
          cleanupError
        );
      }
    }
  }
}
