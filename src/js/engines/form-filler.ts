// Pure engine for the Fill form tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Reads and fills AcroForm fields with pdf-lib. The legacy page
// (src/js/logic/form-filler-page.ts) just embedded the pdfjs viewer in an
// iframe and clicked its own download button — there was no real fill logic
// to reuse, so this is a fresh implementation.
import {
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from 'pdf-lib';
import { loadPdfDocument } from '../utils/load-pdf-document.js';
import type { ToolField } from '../tools/types.js';

/** Dynamic field keys are namespaced so they never collide with `flatten`. */
const FIELD_KEY_PREFIX = 'field:';

/** "invoice_number" / "invoice.number" / "invoiceNumber" -> "Invoice number". */
function humanizeFieldName(name: string): string {
  const words = name
    .split(/[._]+/)
    .flatMap((part) => part.split(/(?=[A-Z][a-z])|(?<=[a-z0-9])(?=[A-Z])/))
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length === 0) return name;
  const label = words.join(' ').toLowerCase();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export interface FormFillerInspection {
  fields: ToolField[];
  values: Record<string, string>;
  details: [label: string, value: string][];
}

/**
 * Detects XFA forms via a plain byte scan for "/XFA" near the AcroForm
 * dictionary. Good enough as a hint; pdf-lib has no structured XFA reader.
 */
function hasXfa(bytes: ArrayBuffer): boolean {
  const text = new TextDecoder('latin1').decode(bytes);
  return /\/AcroForm[\s\S]{0,500}\/XFA/.test(text);
}

export async function inspectFormFields(
  file: File
): Promise<FormFillerInspection> {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(bytes);
  const form = pdfDoc.getForm();
  const allFields = form.getFields();
  const fillable = allFields.filter((f) => !f.isReadOnly());
  const xfa = hasXfa(bytes);

  if (fillable.length === 0) {
    const details: [string, string][] = [
      [
        'Form fields',
        allFields.length > 0 ? 'All fields are read-only' : 'None found',
      ],
    ];
    if (xfa) {
      details.push(['XFA', "This form uses XFA and can't be filled here."]);
    }
    return { fields: [], values: {}, details };
  }

  const seen = new Map<string, number>();
  const fields: ToolField[] = [];
  const values: Record<string, string> = {};

  for (const field of fillable) {
    const rawName = field.getName();
    const count = seen.get(rawName) ?? 0;
    seen.set(rawName, count + 1);
    const key = `${FIELD_KEY_PREFIX}${rawName}${count > 0 ? `#${count}` : ''}`;
    const label = humanizeFieldName(rawName);
    const help =
      label.toLowerCase() !== rawName.toLowerCase() ? rawName : undefined;

    if (field instanceof PDFCheckBox) {
      fields.push({ key, label, value: '', type: 'checkbox', help });
      values[key] = field.isChecked() ? 'true' : 'false';
      continue;
    }

    if (field instanceof PDFRadioGroup) {
      const options = field.getOptions();
      fields.push({
        key,
        label,
        value: '',
        type: options.length <= 4 ? 'segmented' : 'select',
        options: options.map((o) => [o, o]),
        help,
      });
      values[key] = field.getSelected() ?? '';
      continue;
    }

    if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      const options = field.getOptions();
      fields.push({
        key,
        label,
        value: '',
        type: 'select',
        options: options.map((o) => [o, o]),
        help,
      });
      values[key] = field.getSelected()[0] ?? '';
      continue;
    }

    if (field instanceof PDFTextField) {
      fields.push({
        key,
        label,
        value: '',
        type: field.isMultiline() ? 'textarea' : 'text',
        help,
      });
      values[key] = field.getText() ?? '';
      continue;
    }

    // Buttons, signatures and other field kinds aren't fillable text/choice
    // inputs; skip them.
  }

  return {
    fields,
    values,
    details: [['Form fields', `${fillable.length} fields`]],
  };
}

export interface FormFillerOptions {
  /** Whether to flatten the form after filling (static field key `flatten`). */
  flatten?: string;
  [key: string]: string | undefined;
}

export async function fillForm(
  file: File,
  options: FormFillerOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  ctx.progress({ label: 'Filling form…' });
  const bytes = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(bytes);
  const form = pdfDoc.getForm();
  const fields = form.getFields().filter((f) => !f.isReadOnly());

  const seen = new Map<string, number>();
  for (const field of fields) {
    if (ctx.signal.aborted) throw new Error('Cancelled');
    const rawName = field.getName();
    const count = seen.get(rawName) ?? 0;
    seen.set(rawName, count + 1);
    const key = `${FIELD_KEY_PREFIX}${rawName}${count > 0 ? `#${count}` : ''}`;
    if (!(key in options)) continue;
    const value = options[key] ?? '';

    try {
      if (field instanceof PDFCheckBox) {
        if (value === 'true') field.check();
        else field.uncheck();
      } else if (field instanceof PDFRadioGroup) {
        if (value) field.select(value);
        else field.clear();
      } else if (
        field instanceof PDFDropdown ||
        field instanceof PDFOptionList
      ) {
        if (value) field.select(value);
        else field.clear();
      } else if (field instanceof PDFTextField) {
        field.setText(value || undefined);
      }
    } catch (error) {
      throw new Error(`Could not set the "${rawName}" field.`, {
        cause: error,
      });
    }
  }

  if (options.flatten === 'true') {
    ctx.progress({ label: 'Flattening form…', value: 0.9 });
    form.flatten();
  }

  const outBytes = await pdfDoc.save();
  return new File([new Uint8Array(outBytes)], file.name, {
    type: 'application/pdf',
  });
}
