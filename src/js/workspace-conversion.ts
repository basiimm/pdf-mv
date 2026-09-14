const aliases: Record<string, string> = {
  jpeg: 'jpg',
  doc: 'word',
  docx: 'word',
  xls: 'excel',
  xlsx: 'excel',
  ppt: 'powerpoint',
  pptx: 'powerpoint',
  md: 'markdown',
  tif: 'tiff',
  heif: 'heic',
  eml: 'email',
  msg: 'email',
};
const formats = new Set(
  'jpg png webp svg bmp heic tiff txt markdown json odt csv rtf word excel powerpoint xps mobi epub fb2 cbz wpd wps xml pages odg ods odp pub vsd psd email'.split(
    ' '
  )
);
const images = new Set('jpg png webp svg bmp heic tiff'.split(' '));

/** Infer the engine without reading or transmitting file contents. */
export function detectConversion(files: File[]): string {
  if (!files.length) throw new Error('Choose a file to convert.');
  const inputs = files.map((file) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    return file.type === 'application/pdf' ? 'pdf' : (aliases[ext] ?? ext);
  });
  if (inputs.every((format) => format === 'pdf')) {
    if (files.length > 1)
      throw new Error('Choose one PDF to export, or combine the PDFs first.');
    return 'pdf-to-png';
  }
  if (inputs.some((format) => !formats.has(format)))
    throw new Error(
      'This file format is not supported. Choose a PDF, image or supported document.'
    );
  if (inputs.every((format) => images.has(format)))
    return new Set(inputs).size > 1 ? 'image-to-pdf' : `${inputs[0]}-to-pdf`;
  if (files.length > 1)
    throw new Error(
      'Convert one document at a time. Multiple images can be combined into a PDF.'
    );
  return `${inputs[0]}-to-pdf`;
}
