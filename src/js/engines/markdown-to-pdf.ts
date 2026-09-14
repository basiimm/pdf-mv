// Pure engine for the Create PDF (from Markdown) tool. See
// docs/TOOL-MIGRATION-GUIDE.md.
//
// The legacy markdown pipeline (src/js/utils/markdown-editor.ts) renders a
// full editor UI and exports via window.print() — there's no headless PDF
// path to call into, and md-to-pdf.ts's html2canvas/jsPDF sketch is fully
// commented out and unused. This engine rebuilds a headless version of that
// same idea: markdown-it renders sanitized HTML into an offscreen container,
// html2canvas rasterizes it, and jsPDF slices the raster into pages. Mermaid
// diagrams, syntax highlighting and the other editor-only plugins (emoji,
// footnotes, task lists, etc.) are dropped — they need the interactive
// editor's async render loop, not a one-shot conversion.
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

export type MarkdownPageSize = 'a4' | 'letter';

export interface MarkdownToPdfOptions {
  markdown?: string;
  pageSize?: MarkdownPageSize;
  /** Points. */
  fontSize?: string;
  /** Millimeters. */
  margin?: string;
}

export const defaultMarkdownToPdfOptions: MarkdownToPdfOptions = {
  markdown: '',
  pageSize: 'a4',
  fontSize: '12',
  margin: '20',
};

export const SAMPLE_MARKDOWN = `# Welcome to PDF.mv

A short tour of what this converter supports.

## Formatting

- **Bold**, *italic* and \`inline code\`
- Nested lists
  - Second level
- [Links](https://example.com)

## A table

| Feature | Supported |
|---------|:---------:|
| Headings | Yes |
| Lists | Yes |
| Tables | Yes |
| Code blocks | Yes |

## Code

\`\`\`js
function greet(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`

Start editing to make this your own document.
`;

const PAGE_SIZES_MM: Record<MarkdownPageSize, [number, number]> = {
  a4: [210, 297],
  letter: [215.9, 279.4],
};

const MM_PER_INCH = 25.4;
const CSS_PIXELS_PER_INCH = 96;

function renderMarkdownHtml(markdown: string): string {
  const md = new MarkdownIt({
    html: false,
    breaks: false,
    linkify: true,
    typographer: true,
  });
  const rawHtml = md.render(markdown || '');
  return DOMPurify.sanitize(rawHtml, { ADD_ATTR: ['target'] });
}

/** First H1 text, slugified, for the output file name; falls back to "document". */
export function titleSlug(markdown: string): string {
  const match = /^#\s+(.+)$/m.exec(markdown || '');
  const title = match?.[1]?.trim();
  if (!title) return 'document';
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'document';
}

const STYLE = `
  body { font-family: Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a1a1a; }
  h1, h2, h3 { margin: 1.2em 0 0.5em; font-weight: 600; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
  h1 { font-size: 2em; } h2 { font-size: 1.5em; } h3 { font-size: 1.2em; }
  p, ul, ol, pre, table, blockquote { margin: 0 0 1em; }
  blockquote { padding: 0 1em; color: #6a737d; border-left: 0.25em solid #dfe2e5; }
  pre { padding: 1em; overflow: auto; background: #f6f8fa; border-radius: 6px; }
  code { font-family: 'Courier New', monospace; background: rgba(27,31,35,0.05); border-radius: 3px; padding: 0.2em 0.4em; }
  pre code { background: none; padding: 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 6px 13px; border: 1px solid #dfe2e5; }
  img { max-width: 100%; }
`;

/** Renders the sanitized HTML into an offscreen container sized for the page's content width. */
function mountOffscreen(
  html: string,
  contentWidthPx: number,
  fontSizePt: number
): HTMLElement {
  const container = document.createElement('div');
  container.style.cssText = `position:fixed; top:0; left:-100000px; width:${contentWidthPx}px; background:#fff; font-size:${fontSizePt}pt;`;
  const style = document.createElement('style');
  style.textContent = STYLE;
  container.appendChild(style);
  const content = document.createElement('div');
  content.innerHTML = html;
  container.appendChild(content);
  document.body.appendChild(container);
  return container;
}

export async function markdownToPdf(
  options: MarkdownToPdfOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  const markdown = (options.markdown ?? '').trim();
  if (!markdown) {
    throw new Error('Enter some Markdown text first.');
  }

  ctx.progress({ label: 'Rendering Markdown…' });
  const html = renderMarkdownHtml(markdown);

  const pageSize = options.pageSize === 'letter' ? 'letter' : 'a4';
  const [pageWidthMm, pageHeightMm] = PAGE_SIZES_MM[pageSize];
  const marginMm = Number(options.margin) || 20;
  const fontSizePt = Number(options.fontSize) || 12;

  const contentWidthMm = pageWidthMm - marginMm * 2;
  const contentWidthPx = Math.round(
    (contentWidthMm / MM_PER_INCH) * CSS_PIXELS_PER_INCH
  );

  let container: HTMLElement | null = null;
  try {
    container = mountOffscreen(html, contentWidthPx, fontSizePt);

    if (ctx.signal.aborted) throw new Error('Cancelled');
    ctx.progress({ label: 'Laying out pages…', value: 0.4 });

    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(container, { scale: 2, useCORS: true });

    if (ctx.signal.aborted) throw new Error('Cancelled');
    ctx.progress({ label: 'Creating PDF…', value: 0.8 });

    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: pageSize,
    });

    const contentHeightMm = pageHeightMm - marginMm * 2;
    const imgWidthMm = contentWidthMm;
    const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;
    const imgData = canvas.toDataURL('image/png');

    let heightLeft = imgHeightMm;
    let position = marginMm;
    pdf.addImage(imgData, 'PNG', marginMm, position, imgWidthMm, imgHeightMm);
    heightLeft -= contentHeightMm;

    while (heightLeft > 0) {
      position -= pageHeightMm;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', marginMm, position, imgWidthMm, imgHeightMm);
      heightLeft -= contentHeightMm;
    }

    const blob = pdf.output('blob') as Blob;
    const name = `${titleSlug(markdown)}.pdf`;
    return new File([blob], name, { type: 'application/pdf' });
  } finally {
    container?.remove();
  }
}
