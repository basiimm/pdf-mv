// Pure engine for Edit bookmarks. See docs/TOOL-MIGRATION-GUIDE.md.
// Reads and writes the document outline with pdf-lib's low-level objects.
// Ported from src/js/logic/bookmark-pdf.ts (outline writing, JSON/CSV formats).
// No DOM.
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFObject,
  PDFRef,
  PDFString,
} from 'pdf-lib';

export interface BookmarkNode {
  id: string;
  title: string;
  /** 1-based page number. */
  page: number;
  children: BookmarkNode[];
  bold?: boolean;
  italic?: boolean;
  /** `#rrggbb`. */
  color?: string;
  /** Children shown expanded when the PDF opens. */
  open?: boolean;
}

export interface BookmarkDocument {
  bookmarks: BookmarkNode[];
  pageCount: number;
}

type Source = File | Blob | ArrayBuffer | Uint8Array;

let idSeed = 0;
/** Id for bookmarks created in the editor (read bookmarks use path ids). */
export function createBookmarkId(): string {
  idSeed += 1;
  return `new-${Date.now().toString(36)}-${idSeed}`;
}

async function bytesOf(source: Source): Promise<Uint8Array> {
  if (source instanceof Uint8Array) return source;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  return new Uint8Array(await source.arrayBuffer());
}

async function loadDocument(source: Source) {
  const doc = await PDFDocument.load(await bytesOf(source), {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
    updateMetadata: false,
  });
  if (doc.isEncrypted)
    throw new Error(
      'This PDF is password-protected. Remove the password, then edit its bookmarks.'
    );
  return doc;
}

// ---------- Reading ----------

function decodeTitle(value: PDFObject | undefined): string {
  if (value instanceof PDFString || value instanceof PDFHexString)
    return cleanTitle(value.decodeText());
  return '';
}

/** Strip control characters that break outline titles in viewers. */
export function cleanTitle(title: string): string {
  return Array.from(title, (char) => {
    const code = char.charCodeAt(0);
    const whitespace = code === 9 || code === 10 || code === 13;
    return (code < 32 && !whitespace) || code === 127 ? '' : char;
  })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function componentHex(value: number) {
  const n = Math.round(Math.min(1, Math.max(0, value)) * 255);
  return n.toString(16).padStart(2, '0');
}

function nameTreeLookup(
  doc: PDFDocument,
  node: PDFDict | undefined,
  key: string,
  depth = 0
): PDFObject | undefined {
  if (!node || depth > 32) return undefined;
  const names = node.lookupMaybe(PDFName.of('Names'), PDFArray);
  if (names) {
    for (let i = 0; i + 1 < names.size(); i += 2) {
      const name = names.lookup(i);
      const text =
        name instanceof PDFString || name instanceof PDFHexString
          ? name.decodeText()
          : undefined;
      if (text === key) return names.lookup(i + 1);
    }
  }
  const kids = node.lookupMaybe(PDFName.of('Kids'), PDFArray);
  if (kids) {
    for (let i = 0; i < kids.size(); i++) {
      const kid = kids.lookup(i);
      if (!(kid instanceof PDFDict)) continue;
      const limits = kid.lookupMaybe(PDFName.of('Limits'), PDFArray);
      if (limits && limits.size() === 2) {
        const lo = limits.lookup(0);
        const hi = limits.lookup(1);
        const loText =
          lo instanceof PDFString || lo instanceof PDFHexString
            ? lo.decodeText()
            : '';
        const hiText =
          hi instanceof PDFString || hi instanceof PDFHexString
            ? hi.decodeText()
            : '';
        if (loText && hiText && (key < loText || key > hiText)) continue;
      }
      const found = nameTreeLookup(doc, kid, key, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

/** Resolve an explicit or named destination to its destination array. */
function resolveDestination(
  doc: PDFDocument,
  dest: PDFObject | undefined
): PDFArray | undefined {
  const resolved = dest instanceof PDFRef ? doc.context.lookup(dest) : dest;
  if (resolved instanceof PDFArray) return resolved;
  if (resolved instanceof PDFDict)
    return resolveDestination(doc, resolved.get(PDFName.of('D')));
  if (resolved instanceof PDFName) {
    const dests = doc.catalog.lookupMaybe(PDFName.of('Dests'), PDFDict);
    return resolveDestination(doc, dests?.get(resolved));
  }
  if (resolved instanceof PDFString || resolved instanceof PDFHexString) {
    const names = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
    const tree = names?.lookupMaybe(PDFName.of('Dests'), PDFDict);
    return resolveDestination(
      doc,
      nameTreeLookup(doc, tree, resolved.decodeText())
    );
  }
  return undefined;
}

function destinationPage(
  doc: PDFDocument,
  item: PDFDict,
  pageIndex: Map<string, number>
): number {
  let dest = item.get(PDFName.of('Dest'));
  if (!dest) {
    const action = item.lookupMaybe(PDFName.of('A'), PDFDict);
    const kind = action?.lookupMaybe(PDFName.of('S'), PDFName);
    if (action && kind === PDFName.of('GoTo'))
      dest = action.get(PDFName.of('D'));
  }
  const array = resolveDestination(doc, dest);
  const target = array?.get(0);
  if (target instanceof PDFRef) {
    const index = pageIndex.get(target.toString());
    if (index !== undefined) return index + 1;
  }
  if (target instanceof PDFNumber) {
    const index = Math.trunc(target.asNumber());
    if (index >= 0 && index < doc.getPageCount()) return index + 1;
  }
  return 1;
}

function readItems(
  doc: PDFDocument,
  first: PDFObject | undefined,
  pageIndex: Map<string, number>,
  path: string,
  visited: Set<string>,
  refs: PDFRef[],
  depth: number
): BookmarkNode[] {
  const nodes: BookmarkNode[] = [];
  let ref = first;
  let index = 0;
  while (ref instanceof PDFRef && depth < 64) {
    const key = ref.toString();
    if (visited.has(key)) break;
    visited.add(key);
    refs.push(ref);
    const item = doc.context.lookup(ref);
    if (!(item instanceof PDFDict)) break;
    const id = `${path}${index}`;
    const node: BookmarkNode = {
      id,
      title: decodeTitle(item.lookup(PDFName.of('Title'))) || 'Untitled',
      page: destinationPage(doc, item, pageIndex),
      children: readItems(
        doc,
        item.get(PDFName.of('First')),
        pageIndex,
        `${id}-`,
        visited,
        refs,
        depth + 1
      ),
    };
    const flags = item.lookupMaybe(PDFName.of('F'), PDFNumber)?.asNumber() ?? 0;
    if (flags & 1) node.italic = true;
    if (flags & 2) node.bold = true;
    const color = item.lookupMaybe(PDFName.of('C'), PDFArray);
    if (color && color.size() === 3) {
      const parts = [0, 1, 2].map(
        (i) => color.lookupMaybe(i, PDFNumber)?.asNumber() ?? 0
      );
      const hex = `#${parts.map(componentHex).join('')}`;
      if (hex !== '#000000') node.color = hex;
    }
    const count = item.lookupMaybe(PDFName.of('Count'), PDFNumber)?.asNumber();
    if (node.children.length && count !== undefined && count > 0)
      node.open = true;
    nodes.push(node);
    ref = item.get(PDFName.of('Next'));
    index += 1;
  }
  return nodes;
}

function readOutline(doc: PDFDocument) {
  const refs: PDFRef[] = [];
  const outlines = doc.catalog.lookupMaybe(PDFName.of('Outlines'), PDFDict);
  if (!outlines) return { bookmarks: [] as BookmarkNode[], refs };
  const pageIndex = new Map<string, number>();
  doc.getPages().forEach((page, i) => pageIndex.set(page.ref.toString(), i));
  const bookmarks = readItems(
    doc,
    outlines.get(PDFName.of('First')),
    pageIndex,
    'b',
    new Set(),
    refs,
    0
  );
  return { bookmarks, refs };
}

/** Bookmarks and page count of a PDF. Ids are stable paths (`b0-2-1`). */
export async function inspectBookmarks(
  source: Source
): Promise<BookmarkDocument> {
  const doc = await loadDocument(source);
  return {
    bookmarks: readOutline(doc).bookmarks,
    pageCount: doc.getPageCount(),
  };
}

export async function readBookmarks(source: Source): Promise<BookmarkNode[]> {
  return (await inspectBookmarks(source)).bookmarks;
}

// ---------- Writing ----------

function hexToRgb(color: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const hex =
    match[1].length === 3
      ? match[1]
          .split('')
          .map((c) => c + c)
          .join('')
      : match[1];
  return [0, 2, 4].map(
    (i) => Math.round((parseInt(hex.slice(i, i + 2), 16) / 255) * 1000) / 1000
  ) as [number, number, number];
}

/** Number of items visible below `node` when the outline is shown. */
function visibleDescendants(node: BookmarkNode): number {
  if (!node.open) return 0;
  return node.children.reduce(
    (sum, child) => sum + 1 + visibleDescendants(child),
    0
  );
}

function writeItems(
  doc: PDFDocument,
  nodes: BookmarkNode[],
  parent: PDFRef
): PDFRef[] {
  const { context } = doc;
  const pages = doc.getPages();
  const refs = nodes.map(() => context.nextRef());
  nodes.forEach((node, i) => {
    const page =
      pages[Math.max(0, Math.min(Math.trunc(node.page) - 1, pages.length - 1))];
    const box = page.getCropBox();
    const dict = context.obj({});
    dict.set(
      PDFName.of('Title'),
      PDFHexString.fromText(cleanTitle(node.title) || 'Untitled')
    );
    dict.set(PDFName.of('Parent'), parent);
    dict.set(
      PDFName.of('Dest'),
      context.obj([
        page.ref,
        PDFName.of('XYZ'),
        PDFNumber.of(box.x),
        PDFNumber.of(box.y + box.height),
        PDFNull,
      ])
    );
    if (i > 0) dict.set(PDFName.of('Prev'), refs[i - 1]);
    if (i < nodes.length - 1) dict.set(PDFName.of('Next'), refs[i + 1]);
    if (node.children.length) {
      const children = writeItems(doc, node.children, refs[i]);
      dict.set(PDFName.of('First'), children[0]);
      dict.set(PDFName.of('Last'), children[children.length - 1]);
      const open = visibleDescendants(node);
      dict.set(
        PDFName.of('Count'),
        PDFNumber.of(
          node.open
            ? open
            : -visibleDescendants({ ...node, open: true } as BookmarkNode)
        )
      );
    }
    const flags = (node.italic ? 1 : 0) | (node.bold ? 2 : 0);
    if (flags) dict.set(PDFName.of('F'), PDFNumber.of(flags));
    const rgb = node.color ? hexToRgb(node.color) : null;
    if (rgb) dict.set(PDFName.of('C'), context.obj(rgb));
    context.assign(refs[i], dict);
  });
  return refs;
}

/** Replace the outline of `doc` in place. An empty list removes it. */
export function writeOutline(doc: PDFDocument, nodes: BookmarkNode[]) {
  const { refs } = readOutline(doc);
  const previous = doc.catalog.get(PDFName.of('Outlines'));
  for (const ref of refs) doc.context.delete(ref);
  if (previous instanceof PDFRef) doc.context.delete(previous);
  doc.catalog.delete(PDFName.of('Outlines'));
  if (!nodes.length || !doc.getPageCount()) return;
  const rootRef = doc.context.nextRef();
  const items = writeItems(doc, nodes, rootRef);
  const total = nodes.reduce(
    (sum, node) => sum + 1 + visibleDescendants(node),
    0
  );
  doc.context.assign(
    rootRef,
    doc.context.obj({
      Type: 'Outlines',
      First: items[0],
      Last: items[items.length - 1],
      Count: total,
    })
  );
  doc.catalog.set(PDFName.of('Outlines'), rootRef);
}

/** A copy of the PDF whose outline is exactly `nodes`. */
export async function writeBookmarks(
  file: File,
  nodes: BookmarkNode[]
): Promise<File> {
  const doc = await loadDocument(file);
  writeOutline(doc, nodes);
  const bytes = await doc.save();
  return new File([bytes as BlobPart], file.name || 'document.pdf', {
    type: 'application/pdf',
  });
}

// ---------- Tree helpers ----------

export function countBookmarks(nodes: BookmarkNode[]): number {
  return nodes.reduce(
    (sum, node) => sum + 1 + countBookmarks(node.children),
    0
  );
}

export function cloneBookmarks(nodes: BookmarkNode[]): BookmarkNode[] {
  return nodes.map((node) => ({
    ...node,
    children: cloneBookmarks(node.children),
  }));
}

/** Structural signature used to detect unsaved edits (ignores ids). */
export function bookmarkSignature(nodes: BookmarkNode[]): string {
  const strip = (list: BookmarkNode[]): unknown[] =>
    list.map((n) => [
      n.title,
      n.page,
      !!n.bold,
      !!n.italic,
      n.color ?? '',
      strip(n.children),
    ]);
  return JSON.stringify(strip(nodes));
}

export interface FlatBookmark {
  title: string;
  page: number;
  /** 0 for top level. */
  level: number;
}

export function flattenBookmarks(
  nodes: BookmarkNode[],
  level = 0
): FlatBookmark[] {
  return nodes.flatMap((node) => [
    { title: node.title, page: node.page, level },
    ...flattenBookmarks(node.children, level + 1),
  ]);
}

// ---------- Import and export ----------

const legacyColors: Record<string, string> = {
  red: '#ff0000',
  blue: '#0000ff',
  green: '#00ff00',
  yellow: '#ffff00',
  purple: '#800080',
};

function toPage(value: unknown, pageCount?: number): number {
  const n = Math.trunc(Number(value));
  const page = Number.isFinite(n) && n >= 1 ? n : 1;
  return pageCount ? Math.min(page, pageCount) : page;
}

/** JSON in the editor format; also reads the legacy BookmarkTree format. */
export function exportBookmarksJson(nodes: BookmarkNode[]): string {
  const plain = (list: BookmarkNode[]): unknown[] =>
    list.map((node) => ({
      title: node.title,
      page: node.page,
      ...(node.bold ? { bold: true } : {}),
      ...(node.italic ? { italic: true } : {}),
      ...(node.color ? { color: node.color } : {}),
      children: plain(node.children),
    }));
  return JSON.stringify(plain(nodes), null, 2);
}

export function parseBookmarksJson(
  text: string,
  pageCount?: number
): BookmarkNode[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The JSON could not be read. Check it and try again.');
  }
  const list = Array.isArray(data)
    ? data
    : data &&
        typeof data === 'object' &&
        Array.isArray((data as { bookmarks?: unknown }).bookmarks)
      ? (data as { bookmarks: unknown[] }).bookmarks
      : null;
  if (!list)
    throw new Error(
      'The JSON must be a list of bookmarks with title and page.'
    );
  const convert = (items: unknown[], depth: number): BookmarkNode[] =>
    depth > 64
      ? []
      : items
          .filter(
            (item): item is Record<string, unknown> =>
              !!item && typeof item === 'object'
          )
          .map((item) => {
            const style = typeof item.style === 'string' ? item.style : '';
            const rawColor = typeof item.color === 'string' ? item.color : '';
            const color = legacyColors[rawColor] ?? rawColor;
            const node: BookmarkNode = {
              id: createBookmarkId(),
              title: cleanTitle(String(item.title ?? '')) || 'Untitled',
              page: toPage(item.page, pageCount),
              children: convert(
                Array.isArray(item.children) ? item.children : [],
                depth + 1
              ),
            };
            if (item.bold === true || /bold/.test(style)) node.bold = true;
            if (item.italic === true || /italic/.test(style))
              node.italic = true;
            if (/^#[0-9a-f]{6}$/i.test(color)) node.color = color.toLowerCase();
            return node;
          });
  return convert(list, 0);
}

/** CSV with a `title,page,level` header (level 0 = top level). */
export function exportBookmarksCsv(nodes: BookmarkNode[]): string {
  const rows = flattenBookmarks(nodes).map(({ title, page, level }) => {
    // Neutralise spreadsheet formulas.
    const safe = /^[=+\-@\t\r]/.test(title) ? `'${title}` : title;
    return `"${safe.replace(/"/g, '""')}",${page},${level}`;
  });
  return ['title,page,level', ...rows].join('\n');
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      cells.push(cell);
      cell = '';
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

export function parseBookmarksCsv(
  text: string,
  pageCount?: number
): BookmarkNode[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length && /^\s*"?title"?\s*,/i.test(lines[0])) lines.shift();
  const roots: BookmarkNode[] = [];
  const stack: { level: number; children: BookmarkNode[] }[] = [
    { level: -1, children: roots },
  ];
  for (const line of lines) {
    const cells = splitCsvLine(line);
    if (cells.length < 2) continue;
    const [rawTitle, rawPage, rawLevel] = cells;
    const title = cleanTitle(rawTitle.replace(/^'(?=[=+\-@])/, ''));
    if (!title || !/^\s*\d+\s*$/.test(rawPage)) continue;
    const level = Math.max(0, Math.trunc(Number(rawLevel)) || 0);
    const node: BookmarkNode = {
      id: createBookmarkId(),
      title,
      page: toPage(rawPage, pageCount),
      children: [],
    };
    while (stack.length > 1 && stack[stack.length - 1].level >= level)
      stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push({ level, children: node.children });
  }
  if (!roots.length && lines.length)
    throw new Error('No bookmarks found. Use rows of title,page,level.');
  return roots;
}

/** Detects JSON or CSV. */
export function parseBookmarks(
  text: string,
  pageCount?: number
): BookmarkNode[] {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Paste bookmarks as JSON or CSV first.');
  return /^[[{]/.test(trimmed)
    ? parseBookmarksJson(trimmed, pageCount)
    : parseBookmarksCsv(trimmed, pageCount);
}
