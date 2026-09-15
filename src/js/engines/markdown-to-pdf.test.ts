import { describe, it, expect, vi } from 'vitest';

// html2canvas needs real layout/canvas support that jsdom doesn't provide;
// mock it (and jsPDF's output) so this stays a fast, deterministic smoke
// test of the markdown -> HTML -> PDF plumbing rather than a pixel test.
vi.mock('html2canvas', () => ({
  default: vi.fn(async (el: HTMLElement) => ({
    width: 800,
    height: el.textContent && el.textContent.length > 500 ? 4000 : 400,
    toDataURL: () => 'data:image/png;base64,AAAA',
  })),
}));

const addImage = vi.fn();
const addPage = vi.fn();
const output = vi.fn(() => new Blob(['pdf'], { type: 'application/pdf' }));
class FakeJsPDF {
  addImage = addImage;
  addPage = addPage;
  output = output;
}
vi.mock('jspdf', () => ({ jsPDF: FakeJsPDF }));

const { markdownToPdf, titleSlug, defaultMarkdownToPdfOptions } =
  await import('./markdown-to-pdf.js');

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('titleSlug', () => {
  it('slugifies the first H1', () => {
    expect(titleSlug('# Hello World\n\nBody')).toBe('hello-world');
  });

  it('falls back to "document" without a heading', () => {
    expect(titleSlug('just some text')).toBe('document');
    expect(titleSlug('')).toBe('document');
  });
});

describe('markdownToPdf', () => {
  it('renders Markdown into a named PDF file', async () => {
    const file = await markdownToPdf(
      {
        ...defaultMarkdownToPdfOptions,
        markdown: '# My Doc\n\nHello **world**.',
      },
      ctx
    );
    expect(file.name).toBe('my-doc.pdf');
    expect(file.type).toBe('application/pdf');
    expect(addImage).toHaveBeenCalled();
  });

  it('adds extra pages for long content', async () => {
    addPage.mockClear();
    const longBody = '# Long\n\n' + 'Paragraph of text. '.repeat(200);
    await markdownToPdf(
      { ...defaultMarkdownToPdfOptions, markdown: longBody },
      ctx
    );
    expect(addPage).toHaveBeenCalled();
  });

  it('cleans up its offscreen container', async () => {
    await markdownToPdf(
      { ...defaultMarkdownToPdfOptions, markdown: '# Doc\n\nText' },
      ctx
    );
    expect(
      document.body.querySelector('div[style*="left:-100000px"]')
    ).toBeNull();
  });

  it('throws a plain error for empty input', async () => {
    await expect(
      markdownToPdf({ ...defaultMarkdownToPdfOptions, markdown: '   ' }, ctx)
    ).rejects.toThrow('Enter some Markdown text');
  });

  it('rejects when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      markdownToPdf(
        { ...defaultMarkdownToPdfOptions, markdown: '# Doc' },
        { signal: controller.signal, progress: () => {} }
      )
    ).rejects.toThrow('Cancelled');
  });
});
