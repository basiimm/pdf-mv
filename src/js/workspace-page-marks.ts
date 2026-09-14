import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
} from 'pdf-lib';

export interface PageMarks {
  kind: 'add-watermark' | 'header-footer';
  text: string;
  header: string;
  footer: string;
  size: number;
  opacity: number;
  angle: number;
  color: string;
  pages: string;
  align: 'left' | 'center' | 'right';
}
export function selectedPages(range: string, total: number): Set<number> {
  if (!range.trim() || range.trim().toLowerCase() === 'all')
    return new Set(Array.from({ length: total }, (_, i) => i + 1));
  const pages = new Set<number>();
  for (const part of range.split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match)
      throw new Error(
        'Use page numbers like 1, 3-5, or leave blank for all pages.'
      );
    const first = Number(match[1]),
      last = Number(match[2] || match[1]);
    if (first < 1 || last > total || first > last)
      throw new Error(`Page range must be between 1 and ${total}.`);
    for (let n = first; n <= last; n++) pages.add(n);
  }
  return pages;
}
export async function applyPageMarks(
  bytes: ArrayBuffer,
  options: PageMarks
): Promise<Uint8Array<ArrayBuffer>> {
  const pdf = await PDFDocument.load(bytes);
  const pages = selectedPages(options.pages, pdf.getPageCount());
  if (
    !(options.size >= 6 && options.size <= 144) ||
    !Number.isFinite(options.angle) ||
    options.opacity < 0 ||
    options.opacity > 100
  )
    throw new Error('Check the font size, angle and opacity.');
  if (
    !(options.kind === 'add-watermark'
      ? options.text.trim()
      : options.header.trim() || options.footer.trim())
  )
    throw new Error('Enter some text first.');
  if (!/^#[0-9a-f]{6}$/i.test(options.color))
    throw new Error('Choose a valid color.');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const color = rgb(
    ...([1, 3, 5].map(
      (i) => parseInt(options.color.slice(i, i + 2), 16) / 255
    ) as [number, number, number])
  );
  for (const [index, page] of pdf.getPages().entries()) {
    if (!pages.has(index + 1)) continue;
    const box = page.getCropBox(),
      rotation = ((page.getRotation().angle % 360) + 360) % 360;
    const width = rotation % 180 ? box.height : box.width;
    const height = rotation % 180 ? box.width : box.height;
    const matrix: [number, number, number, number, number, number] =
      rotation === 90
        ? [0, 1, -1, 0, box.x + box.width, box.y]
        : rotation === 180
          ? [-1, 0, 0, -1, box.x + box.width, box.y + box.height]
          : rotation === 270
            ? [0, -1, 1, 0, box.x, box.y + box.height]
            : [1, 0, 0, 1, box.x, box.y];
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(...matrix)
    );
    const draw = (template: string, y: number, watermark = false) => {
      const text = template
        .replaceAll('{page}', String(index + 1))
        .replaceAll('{total}', String(pdf.getPageCount()));
      if (!text) return;
      let textWidth: number;
      try {
        textWidth = font.widthOfTextAtSize(text, options.size);
      } catch {
        throw new Error(
          'This font does not support one of your characters. Use Latin text for now.'
        );
      }
      const size = Math.min(
        options.size,
        (options.size * (width - 48)) / Math.max(textWidth, 1)
      );
      textWidth = font.widthOfTextAtSize(text, size);
      const angle = watermark ? options.angle : 0,
        rad = (angle * Math.PI) / 180;
      const x = watermark
        ? width / 2 -
          (Math.cos(rad) * textWidth) / 2 +
          (Math.sin(rad) * size) / 3
        : options.align === 'left'
          ? 24
          : options.align === 'right'
            ? width - 24 - textWidth
            : (width - textWidth) / 2;
      page.drawText(text, {
        x,
        y: watermark
          ? height / 2 -
            (Math.sin(rad) * textWidth) / 2 -
            (Math.cos(rad) * size) / 3
          : y,
        size,
        font,
        color,
        opacity: watermark ? options.opacity / 100 : 1,
        rotate: degrees(angle),
      });
    };
    if (options.kind === 'add-watermark') draw(options.text, 0, true);
    else {
      draw(options.header, height - 24 - options.size);
      draw(options.footer, 24);
    }
    page.pushOperators(popGraphicsState());
  }
  return new Uint8Array(await pdf.save());
}
