import { describe, it, expect } from 'vitest';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
} from 'pdf-lib';
import {
  bookmarkSignature,
  countBookmarks,
  exportBookmarksCsv,
  exportBookmarksJson,
  inspectBookmarks,
  parseBookmarks,
  parseBookmarksCsv,
  parseBookmarksJson,
  readBookmarks,
  writeBookmarks,
  type BookmarkNode,
} from './bookmarks';

async function pdf(pages = 5) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 300]);
  return new File([(await doc.save()) as BlobPart], 'book.pdf', {
    type: 'application/pdf',
  });
}

const node = (
  title: string,
  page: number,
  children: BookmarkNode[] = [],
  extra: Partial<BookmarkNode> = {}
): BookmarkNode => ({ id: title, title, page, children, ...extra });

describe('bookmarks engine', () => {
  it('round-trips a nested outline with page destinations and styles', async () => {
    const tree = [
      node('Intro', 1),
      node(
        'Chapter 1',
        2,
        [node('Section 1.1', 3), node('Section 1.2', 4, [node('Deep', 5)])],
        { bold: true, color: '#ff0000', open: true }
      ),
      node('Appendix — “Ünïcode”', 5, [], { italic: true }),
    ];
    const out = await writeBookmarks(await pdf(), tree);
    expect(out.name).toBe('book.pdf');
    const read = await readBookmarks(out);
    expect(bookmarkSignature(read)).toBe(bookmarkSignature(tree));
    expect(read[1].open).toBe(true);
    expect(read[1].children[1].children[0].page).toBe(5);
    expect(read[0].id).toBe('b0');
    expect(read[1].children[1].children[0].id).toBe('b1-1-0');
    expect(countBookmarks(read)).toBe(6);
  });

  it('writes valid outline links and counts', async () => {
    const out = await writeBookmarks(await pdf(3), [
      node('A', 1, [node('A1', 2), node('A2', 3)]),
      node('B', 3),
    ]);
    const doc = await PDFDocument.load(await out.arrayBuffer());
    const root = doc.catalog.lookup(PDFName.of('Outlines'), PDFDict);
    expect(root.get(PDFName.of('Count'))?.toString()).toBe('2');
    const first = root.lookup(PDFName.of('First'), PDFDict);
    expect(first.get(PDFName.of('Count'))?.toString()).toBe('-2');
    const dest = first.lookup(PDFName.of('Dest'), PDFArray);
    expect(dest.get(0)).toBe(doc.getPage(0).ref);
    const last = root.lookup(PDFName.of('Last'), PDFDict);
    expect(last.lookup(PDFName.of('Prev'), PDFDict)).toBe(first);
  });

  it('replaces an existing outline and removes it when empty', async () => {
    const once = await writeBookmarks(await pdf(), [node('Old', 2)]);
    const twice = await writeBookmarks(once, [node('New', 4)]);
    expect((await readBookmarks(twice)).map((b) => b.title)).toEqual(['New']);
    const cleared = await writeBookmarks(twice, []);
    expect(await readBookmarks(cleared)).toEqual([]);
    expect((await inspectBookmarks(cleared)).pageCount).toBe(5);
  });

  it('resolves named destinations and GoTo actions', async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 4; i++) doc.addPage();
    const { context } = doc;
    const dests = context.obj({
      Names: [
        PDFString.of('chap'),
        context.obj([doc.getPage(2).ref, PDFName.of('Fit')]),
      ],
    });
    doc.catalog.set(
      PDFName.of('Names'),
      context.obj({ Dests: context.register(dests) })
    );
    const root = context.nextRef();
    const a = context.nextRef();
    const b = context.nextRef();
    context.assign(
      a,
      context.obj({
        Title: PDFHexString.fromText('Named'),
        Parent: root,
        Next: b,
        Dest: PDFString.of('chap'),
      })
    );
    context.assign(
      b,
      context.obj({
        Title: PDFString.of('Action'),
        Parent: root,
        Prev: a,
        A: { S: 'GoTo', D: [doc.getPage(3).ref, PDFName.of('Fit')] },
      })
    );
    context.assign(
      root,
      context.obj({ Type: 'Outlines', First: a, Last: b, Count: 2 })
    );
    doc.catalog.set(PDFName.of('Outlines'), root);
    const file = new File([(await doc.save()) as BlobPart], 'x.pdf');
    const read = await readBookmarks(file);
    expect(read.map((n) => [n.title, n.page])).toEqual([
      ['Named', 3],
      ['Action', 4],
    ]);
  });

  it('exports and imports JSON, including the legacy format', () => {
    const tree = [node('A', 1, [node('B', 2, [], { bold: true })])];
    const json = exportBookmarksJson(tree);
    expect(bookmarkSignature(parseBookmarksJson(json))).toBe(
      bookmarkSignature(tree)
    );
    const legacy = JSON.stringify([
      {
        id: 1.5,
        title: 'L',
        page: '9',
        style: 'bold-italic',
        color: 'red',
        children: [],
      },
    ]);
    const [l] = parseBookmarksJson(legacy, 4);
    expect(l).toMatchObject({
      title: 'L',
      page: 4,
      bold: true,
      italic: true,
      color: '#ff0000',
    });
    expect(() => parseBookmarksJson('{nope')).toThrow(/JSON/);
  });

  it('exports and imports CSV with levels, quotes and formula guards', () => {
    const tree = [
      node('Say "hi", friend', 1, [
        node('=SUM', 2),
        node('Two', 3, [node('Three', 4)]),
      ]),
      node('Last', 5),
    ];
    const csv = exportBookmarksCsv(tree);
    expect(csv.split('\n')[0]).toBe('title,page,level');
    expect(csv).toContain(`"'=SUM",2,1`);
    const parsed = parseBookmarksCsv(csv);
    expect(bookmarkSignature(parsed)).toBe(bookmarkSignature(tree));
    expect(parseBookmarks(csv).length).toBe(2);
    expect(parseBookmarks('[{"title":"J","page":2}]')[0].title).toBe('J');
    expect(() => parseBookmarks('   ')).toThrow(/Paste/);
  });
});
