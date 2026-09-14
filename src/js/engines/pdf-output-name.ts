// Shared, side-effect-free naming helper for the create-pdf family's
// engines. Kept in its own module (rather than inside images-to-pdf.ts) so
// engines that only need naming don't pull in heic2any's import-time Worker.

/** "photo.jpg" + 1 file -> "photo.pdf"; N files -> "photo-and-(N-1)-more.pdf" */
export function pdfOutputName(files: File[]): string {
  const base = files[0].name.replace(/\.[^.]+$/, '');
  if (files.length <= 1) return `${base}.pdf`;
  return `${base}-and-${files.length - 1}-more.pdf`;
}
