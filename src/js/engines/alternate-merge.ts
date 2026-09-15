// Pure engine for the Alternate Merge tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/alternate-merge-page.ts. No DOM, no showAlert/showLoader.
import {
  interleavePdfs,
  type InterleaveFile,
} from '../utils/alternate-merge.js';

export interface AlternateMergeOptions {
  retainPageLabels?: boolean;
}

export const defaultAlternateMergeOptions: AlternateMergeOptions = {
  retainPageLabels: false,
};

/**
 * Interleaves pages from the given PDFs in order (the open document plus any
 * extra PDFs chosen via `extraInput`).
 */
export async function alternateMerge(
  files: File[],
  options: AlternateMergeOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');
  if (files.length < 2) {
    throw new Error(
      'Choose at least one more PDF to interleave with the open document.'
    );
  }

  ctx.progress({ label: 'Reading files…' });
  const interleaveFiles: InterleaveFile[] = [];
  for (const file of files) {
    interleaveFiles.push({ name: file.name, data: await file.arrayBuffer() });
  }

  ctx.progress({ label: 'Alternating and mixing pages…', value: 0.5 });
  const bytes = await interleavePdfs(interleaveFiles, {
    retainPageLabels: options.retainPageLabels === true,
  });

  return new File([new Uint8Array(bytes)], 'alternated-mixed.pdf', {
    type: 'application/pdf',
  });
}
