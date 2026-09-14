// Pure engine for the Edit Metadata (Save metadata) tool. See docs/TOOL-MIGRATION-GUIDE.md.
// Extracted from src/js/logic/edit-metadata-page.ts. No DOM, no showAlert/showLoader.
//
// The panel cannot prefill fields from the open document (see docs/TOOL-MIGRATION-GUIDE.md
// and the family registration), so every field defaults to blank. Blank means "keep the
// current value" for title/author/subject/creator/producer/keywords.
import { loadPdfDocument } from '../utils/load-pdf-document.js';

export interface EditMetadataOptions {
  title?: string;
  author?: string;
  subject?: string;
  /** Comma-separated. Blank keeps the current keywords. */
  keywords?: string;
  creator?: string;
  producer?: string;
}

export const defaultEditMetadataOptions: EditMetadataOptions = {
  title: '',
  author: '',
  subject: '',
  keywords: '',
  creator: '',
  producer: '',
};

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

export async function editMetadata(
  file: File,
  options: EditMetadataOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  ctx.progress({ label: 'Updating metadata…' });
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(arrayBuffer);

  if (options.title) pdfDoc.setTitle(options.title);
  if (options.author) pdfDoc.setAuthor(options.author);
  if (options.subject) pdfDoc.setSubject(options.subject);
  if (options.creator) pdfDoc.setCreator(options.creator);
  if (options.producer) pdfDoc.setProducer(options.producer);
  if (options.keywords) {
    pdfDoc.setKeywords(
      options.keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
    );
  }

  pdfDoc.setModificationDate(new Date());

  const newPdfBytes = await pdfDoc.save();
  return new File([new Uint8Array(newPdfBytes)], `${baseName(file.name)}.pdf`, {
    type: 'application/pdf',
  });
}
