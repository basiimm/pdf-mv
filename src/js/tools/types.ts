/**
 * Contract for tools that run inside the PDF view (no iframe, no separate page).
 * A definition is data plus one headless `run` function; the shared panel
 * renders fields, progress, errors, results and undo consistently.
 */
export interface ToolField {
  key: string;
  label: string;
  value: string;
  type?:
    | 'text'
    | 'password'
    | 'number'
    | 'color'
    | 'select'
    | 'checkbox'
    | 'segmented';
  options?: [value: string, label: string][];
  min?: string;
  max?: string;
  step?: string;
  placeholder?: string;
  help?: string;
  /** Rarely changed settings go into the collapsed Advanced section. */
  advanced?: boolean;
}

/**
 * What the primary action does with the output:
 * - revision: replaces the open document in place, with Undo
 * - new-document: opens the output in a new tab (original untouched)
 * - download: saves non-PDF output (images, text, ZIP)
 */
export type ToolOutput = 'revision' | 'new-document' | 'download';

export interface ToolProgress {
  label: string;
  /** 0–1 when known. */
  value?: number;
  detail?: string;
}

export interface ToolRunContext {
  /** Current document snapshot, or the chosen input files. */
  files: File[];
  values: Record<string, string>;
  signal: AbortSignal;
  progress(update: ToolProgress): void;
}

export interface ToolInspection {
  values?: Record<string, string>;
  /** Fields that exist only for this document (form fields, layers). */
  fields?: ToolField[];
  /** Label/value rows shown above the fields. */
  details?: [label: string, value: string][];
}

export interface ToolDefinition {
  id: string;
  description: string;
  fields: ToolField[];
  /** Verb-first label, e.g. "Rotate pages". */
  primaryLabel: string;
  output: ToolOutput;
  /** Short past-tense label for undo and toasts, e.g. "Pages rotated". */
  doneLabel: string;
  /**
   * Show the result in the PDF view while settings change (debounced), then
   * Apply commits it. Only for `revision` tools whose run is reasonably fast.
   */
  preview?: boolean;
  /**
   * Read the open document before showing fields: prefill values (e.g.
   * current metadata) and/or show read-only details. Runs again after each
   * revision. Tools with only `inspect` and no fields are read-only.
   */
  inspect?(file: File): Promise<ToolInspection>;
  /** Omit to operate on the open PDF. */
  input?: { accept: string; multiple: boolean; label: string };
  /**
   * Extra files used together with the open PDF (attachments, overlay, the
   * second document to interleave). run() receives [openPdf, ...extraFiles].
   */
  extraInput?: {
    accept: string;
    multiple: boolean;
    label: string;
    optional?: boolean;
  };
  run(context: ToolRunContext): Promise<File | File[]>;
}
