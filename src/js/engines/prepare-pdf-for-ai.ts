// Pure engine for the prepare-pdf-for-ai tool. See docs/TOOL-MIGRATION-GUIDE.md.
import { loadPyMuPDF, isPyMuPDFAvailable } from '../utils/pymupdf-loader.js';
import type { PyMuPDFInstance } from '@/types';

export interface PreparePdfForAiOptions {
  [key: string]: never;
}

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

export function llmJsonNameFor(sourceName: string): string {
  return sourceName.replace(/\.pdf$/i, '') + '_llm.json';
}

export async function preparePdfForAi(
  file: File,
  _options: PreparePdfForAiOptions,
  ctx: EngineContext
): Promise<File> {
  if (!isPyMuPDFAvailable()) {
    throw new Error(
      'The PyMuPDF WASM engine is not configured. Configure it in WASM Settings.'
    );
  }
  ctx.progress({ label: 'Loading engine…' });
  const pymupdf = (await loadPyMuPDF()) as PyMuPDFInstance;

  ctx.progress({ label: 'Extracting for AI…', value: 0.5 });
  const llamaDocs = await pymupdf.pdfToLlamaIndex(file);
  const jsonContent = JSON.stringify(llamaDocs, null, 2);
  return new File([jsonContent], llmJsonNameFor(file.name), {
    type: 'application/json',
  });
}
