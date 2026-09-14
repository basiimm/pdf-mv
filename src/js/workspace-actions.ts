import { PDFDocument, degrees, PDFName, PDFDict, PDFRef } from 'pdf-lib';
import { selectedPages } from './workspace-page-marks.js';
export interface ActionField {
  key: string;
  label: string;
  value: string;
  type?: string;
  options?: [string, string][];
  min?: string;
  max?: string;
}
export interface NativeAction {
  description: string;
  fields: ActionField[];
  button?: string;
  accept?: string;
}
const ranges = (): ActionField => ({
  key: 'pages',
  label: 'Pages (blank means all)',
  value: '',
  type: 'text',
});
export const nativeActions: Record<string, NativeAction> = {
  'rotate-pdf': {
    description: 'Turn selected pages while keeping their content editable.',
    fields: [
      ranges(),
      {
        key: 'angle',
        label: 'Rotation',
        value: '90',
        options: [
          ['90', '90° clockwise'],
          ['180', '180°'],
          ['270', '90° counterclockwise'],
        ],
      },
    ],
  },
  'extract-pages': {
    description: 'Save selected pages together in a new PDF.',
    fields: [ranges()],
  },
  'delete-pages': {
    description: 'Remove selected pages from an edited copy.',
    fields: [{ ...ranges(), label: 'Pages to remove', value: '1' }],
  },
  'reverse-pages': {
    description: 'Reverse the page order in an edited copy.',
    fields: [],
  },
  'add-blank-page': {
    description:
      'Insert a blank page matching the size of its neighboring page.',
    fields: [
      {
        key: 'after',
        label: 'Insert after page (0 = beginning)',
        value: '0',
        type: 'number',
        min: '0',
      },
    ],
  },
  'remove-annotations': {
    description:
      'Remove comments, highlights and links from selected pages. Form widgets are preserved.',
    fields: [ranges()],
  },
  'remove-metadata': {
    description:
      'Remove document information and the document-level XMP metadata stream.',
    fields: [],
  },
  'pdf-to-jpg': {
    description:
      'Export selected pages as JPG images. Multiple pages download as a ZIP.',
    fields: [
      ranges(),
      {
        key: 'scale',
        label: 'Resolution',
        value: '1.5',
        options: [
          ['1', 'Standard (72 dpi)'],
          ['1.5', 'Clear (108 dpi)'],
          ['2', 'High (144 dpi)'],
        ],
      },
    ],
    button: 'Convert & download',
  },
  'pdf-to-png': {
    description:
      'Export selected pages as PNG images. Multiple pages download as a ZIP.',
    fields: [
      ranges(),
      {
        key: 'scale',
        label: 'Resolution',
        value: '1.5',
        options: [
          ['1', 'Standard (72 dpi)'],
          ['1.5', 'Clear (108 dpi)'],
          ['2', 'High (144 dpi)'],
        ],
      },
    ],
    button: 'Convert & download',
  },
  'pdf-to-webp': {
    description:
      'Export selected pages as WebP images. Multiple pages download as a ZIP.',
    fields: [
      ranges(),
      {
        key: 'scale',
        label: 'Resolution',
        value: '1.5',
        options: [
          ['1', 'Standard (72 dpi)'],
          ['1.5', 'Clear (108 dpi)'],
          ['2', 'High (144 dpi)'],
        ],
      },
    ],
    button: 'Convert & download',
  },
  'pdf-to-text': {
    description:
      'Extract selectable text. For scanned pages, run Recognize text first.',
    fields: [ranges()],
    button: 'Convert & download',
  },
  'jpg-to-pdf': {
    description: 'Combine JPG images into a PDF in the order shown.',
    fields: [],
    accept: 'image/jpeg,.jpg,.jpeg',
  },
  'png-to-pdf': {
    description: 'Combine PNG images into a PDF in the order shown.',
    fields: [],
    accept: 'image/png,.png',
  },
  'webp-to-pdf': {
    description: 'Combine WebP images into a PDF in the order shown.',
    fields: [],
    accept: 'image/webp,.webp',
  },
};
export async function modifyPages(
  bytes: ArrayBuffer,
  action: string,
  values: Record<string, string>
) {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const total = pdf.getPageCount();
  const indices = [...selectedPages(values.pages ?? '', total)].map(
    (n) => n - 1
  );
  if (action === 'rotate-pdf') {
    const angle = Number(values.angle);
    if (![90, 180, 270].includes(angle)) throw new Error('Choose a rotation.');
    for (const index of indices) {
      const page = pdf.getPage(index);
      page.setRotation(degrees((page.getRotation().angle + angle) % 360));
    }
  } else if (action === 'extract-pages') {
    if (!indices.length) throw new Error('Select at least one page.');
    const copy = await PDFDocument.create();
    for (const page of await copy.copyPages(pdf, indices)) copy.addPage(page);
    return new Uint8Array(await copy.save());
  } else if (action === 'delete-pages') {
    if (indices.length === total)
      throw new Error('Keep at least one page in the PDF.');
    for (const index of indices.sort((a, b) => b - a)) pdf.removePage(index);
  } else if (action === 'reverse-pages') {
    const pages = pdf.getPages();
    for (let i = total - 1; i >= 0; i--) pdf.removePage(i);
    for (const page of pages.reverse()) pdf.addPage(page);
  } else if (action === 'add-blank-page') {
    const after = Number(values.after);
    if (!Number.isInteger(after) || after < 0 || after > total)
      throw new Error(`Choose a position from 0 to ${total}.`);
    const reference = pdf.getPage(Math.max(0, after - 1));
    const { width, height } = reference.getCropBox();
    const rotated = reference.getRotation().angle % 180 !== 0;
    pdf.insertPage(after, rotated ? [height, width] : [width, height]);
  } else if (action === 'remove-annotations') {
    for (const i of indices) {
      const page = pdf.getPage(i),
        annotations = page.node.Annots();
      if (!annotations) continue;
      for (let j = annotations.size() - 1; j >= 0; j--) {
        const annotation = pdf.context.lookup(annotations.get(j));
        if (
          annotation instanceof PDFDict &&
          String(annotation.get(PDFName.of('Subtype'))) !== '/Widget'
        )
          annotations.remove(j);
      }
    }
  } else if (action === 'remove-metadata') {
    const info = pdf.context.trailerInfo.Info,
      metadata = pdf.catalog.get(PDFName.of('Metadata'));
    if (info instanceof PDFRef) pdf.context.delete(info);
    if (metadata instanceof PDFRef) pdf.context.delete(metadata);
    pdf.context.trailerInfo.Info = undefined;
    pdf.catalog.delete(PDFName.of('Metadata'));
  } else throw new Error('Unknown document action.');
  return new Uint8Array(await pdf.save());
}
export async function runNativeAction(
  file: File,
  action: string,
  values: Record<string, string>
): Promise<File> {
  const base = file.name.replace(/\.[^.]+$/, '');
  if (['jpg-to-pdf', 'png-to-pdf', 'webp-to-pdf'].includes(action)) {
    const pdf = await PDFDocument.create();
    let bytes = await file.arrayBuffer();
    if (action === 'webp-to-pdf') {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
      bitmap.close();
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b ? resolve(b) : reject(new Error('Could not read this image.')),
          'image/png'
        )
      );
      bytes = await blob.arrayBuffer();
      canvas.width = canvas.height = 0;
    }
    const image =
      action === 'jpg-to-pdf'
        ? await pdf.embedJpg(bytes)
        : await pdf.embedPng(bytes);
    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
    return new File([new Uint8Array(await pdf.save())], base + '.pdf', {
      type: 'application/pdf',
    });
  }
  if (
    ['pdf-to-jpg', 'pdf-to-png', 'pdf-to-webp', 'pdf-to-text'].includes(action)
  ) {
    const pdfjs = await import('pdfjs-dist');
    await import('./utils/setup-pdf-worker.js');
    const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
    try {
      const pdf = await task.promise,
        pages = selectedPages(values.pages ?? '', pdf.numPages);
      if (action === 'pdf-to-text') {
        const parts: string[] = [];
        for (const number of pages) {
          const page = await pdf.getPage(number),
            text = await page.getTextContent();
          parts.push(
            text.items
              .map((item) =>
                'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''
              )
              .join('')
          );
          page.cleanup();
        }
        return new File([parts.join('\n\n')], base + '.txt', {
          type: 'text/plain',
        });
      }
      const extension = action.replace('pdf-to-', ''),
        mime = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      let only: Blob | undefined;
      for (const number of pages) {
        const page = await pdf.getPage(number),
          viewport = page.getViewport({ scale: Number(values.scale) || 1.5 });
        if (viewport.width * viewport.height > 32_000_000)
          throw new Error(
            'This page is too large at this resolution. Choose a lower resolution.'
          );
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({
          canvas,
          canvasContext: canvas.getContext('2d')!,
          viewport,
        }).promise;
        only = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) =>
              b ? resolve(b) : reject(new Error('Could not render this page.')),
            mime,
            0.92
          )
        );
        if (only.type !== mime)
          throw new Error(
            'This browser does not support that image format. Choose PNG or JPG.'
          );
        zip.file(
          `${base} - page ${number}.${extension}`,
          await only.arrayBuffer()
        );
        canvas.width = canvas.height = 0;
        page.cleanup();
      }
      return pages.size === 1
        ? new File([only!], `${base}.${extension}`, { type: mime })
        : new File([await zip.generateAsync({ type: 'blob' })], base + '.zip', {
            type: 'application/zip',
          });
    } finally {
      await task.destroy();
    }
  }
  return new File(
    [await modifyPages(await file.arrayBuffer(), action, values)],
    `${base} - ${action}.pdf`,
    { type: 'application/pdf' }
  );
}

export async function imagesToPdf(
  files: File[],
  action: string
): Promise<File> {
  const output = await PDFDocument.create();
  for (const file of files) {
    const converted = await runNativeAction(file, action, {});
    const pdf = await PDFDocument.load(await converted.arrayBuffer());
    for (const page of await output.copyPages(pdf, pdf.getPageIndices()))
      output.addPage(page);
  }
  return new File(
    [new Uint8Array(await output.save())],
    files.length === 1
      ? files[0].name.replace(/\.[^.]+$/, '') + '.pdf'
      : 'images.pdf',
    { type: 'application/pdf' }
  );
}
