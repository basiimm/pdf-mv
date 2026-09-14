import {
  imagesToPdf,
  nativeActions,
  runNativeAction,
} from '../workspace-actions.js';
import type { ToolDefinition, ToolField, ToolOutput } from './types.js';

/** Tools that run in the PDF view. Engines not listed here still use the legacy embedded page. */
export const toolDefinitions = new Map<string, ToolDefinition>();

export function registerTool(definition: ToolDefinition): void {
  toolDefinitions.set(definition.id, definition);
}

/** "Rotate pages" → "Rotating pages…" */
export function busyLabel(primary: string): string {
  const [verb, ...rest] = primary.split(' ');
  const ing = verb.endsWith('e') ? verb.slice(0, -1) + 'ing' : verb + 'ing';
  return [ing, ...rest].join(' ') + '…';
}

const pageScopeHelp = 'Leave blank for all pages. Example: 1, 3-5';

interface NativeMeta {
  output: ToolOutput;
  primaryLabel: string;
  doneLabel: string;
}

// Existing pdf-lib actions, expressed as definitions with explicit output semantics.
const nativeMeta: Record<string, NativeMeta> = {
  'rotate-pdf': {
    output: 'revision',
    primaryLabel: 'Rotate pages',
    doneLabel: 'Pages rotated',
  },
  'extract-pages': {
    output: 'new-document',
    primaryLabel: 'Extract pages',
    doneLabel: 'Pages extracted',
  },
  'delete-pages': {
    output: 'revision',
    primaryLabel: 'Delete pages',
    doneLabel: 'Pages deleted',
  },
  'reverse-pages': {
    output: 'revision',
    primaryLabel: 'Reverse page order',
    doneLabel: 'Page order reversed',
  },
  'add-blank-page': {
    output: 'revision',
    primaryLabel: 'Insert blank page',
    doneLabel: 'Blank page inserted',
  },
  'remove-annotations': {
    output: 'revision',
    primaryLabel: 'Remove annotations',
    doneLabel: 'Annotations removed',
  },
  'remove-metadata': {
    output: 'revision',
    primaryLabel: 'Remove metadata',
    doneLabel: 'Metadata removed',
  },
  'pdf-to-jpg': {
    output: 'download',
    primaryLabel: 'Export JPG images',
    doneLabel: 'JPG images exported',
  },
  'pdf-to-png': {
    output: 'download',
    primaryLabel: 'Export PNG images',
    doneLabel: 'PNG images exported',
  },
  'pdf-to-webp': {
    output: 'download',
    primaryLabel: 'Export WebP images',
    doneLabel: 'WebP images exported',
  },
  'pdf-to-text': {
    output: 'download',
    primaryLabel: 'Export text',
    doneLabel: 'Text exported',
  },
  'jpg-to-pdf': {
    output: 'new-document',
    primaryLabel: 'Create PDF',
    doneLabel: 'PDF created',
  },
  'png-to-pdf': {
    output: 'new-document',
    primaryLabel: 'Create PDF',
    doneLabel: 'PDF created',
  },
  'webp-to-pdf': {
    output: 'new-document',
    primaryLabel: 'Create PDF',
    doneLabel: 'PDF created',
  },
};

for (const [id, action] of Object.entries(nativeActions)) {
  const meta = nativeMeta[id];
  if (!meta) continue;
  const fields: ToolField[] = action.fields.map((field) => ({
    key: field.key,
    label:
      field.key === 'pages' && field.label.startsWith('Pages (')
        ? 'Pages'
        : field.label,
    value: field.value,
    type: field.options
      ? 'select'
      : field.type === 'number'
        ? 'number'
        : 'text',
    options: field.options,
    min: field.min,
    max: field.max,
    placeholder: field.key === 'pages' ? 'All pages' : undefined,
    help: field.key === 'pages' ? pageScopeHelp : undefined,
  }));
  registerTool({
    id,
    description: action.description
      .replace(' from an edited copy', '')
      .replace(' in an edited copy', ''),
    fields,
    ...meta,
    input: action.accept
      ? { accept: action.accept, multiple: true, label: 'Choose images' }
      : undefined,
    async run({ files, values, progress }) {
      progress({ label: busyLabel(meta.primaryLabel) });
      return action.accept
        ? imagesToPdf(files, id)
        : runNativeAction(files[0], id, values);
    },
  });
}

import { register as registerProtectOptimize } from './families/protect-optimize.js';
import { register as registerExports } from './families/exports.js';
import { register as registerCreatePdf } from './families/create-pdf.js';
import { register as registerMarks } from './families/marks.js';
import { register as registerAppearance } from './families/appearance.js';
import { register as registerDocumentInfo } from './families/document-info.js';
import { register as registerSigningOcr } from './families/signing-ocr.js';

registerProtectOptimize();
registerExports();
registerCreatePdf();
registerMarks();
registerAppearance();
registerDocumentInfo();
registerSigningOcr();
