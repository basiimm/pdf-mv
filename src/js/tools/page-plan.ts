import { PDFDocument, degrees } from 'pdf-lib';

/**
 * A page plan describes an output document as an ordered list of pages taken
 * from one or more source PDFs, plus inserted blank pages. It is the single
 * data model behind organize, split, extract and the multi-tool.
 */
export type Rotation = 0 | 90 | 180 | 270;
export type SourcePageItem = {
  /** Index into the sources array. */
  source: number;
  /** 0-based page index within that source. */
  page: number;
  /** Extra clockwise rotation, added to the page's existing rotation. */
  rotate: Rotation;
};
export type BlankPageItem = {
  blank: true;
  /** PDF points. Zero or less means "same size as the nearest page". */
  width: number;
  height: number;
};
export type PagePlanItem = SourcePageItem | BlankPageItem;

const A4: [number, number] = [595.28, 841.89];

export function isBlank(item: PagePlanItem): item is BlankPageItem {
  return 'blank' in item && item.blank === true;
}

export function normalizeRotation(value: number): Rotation {
  return ((((Math.round(value / 90) * 90) % 360) + 360) % 360) as Rotation;
}

/** The identity plan for sources with the given page counts. */
export function identityPlan(pageCounts: number[]): PagePlanItem[] {
  return pageCounts.flatMap((count, source) =>
    Array.from({ length: count }, (_, page) => ({
      source,
      page,
      rotate: 0 as Rotation,
    }))
  );
}

/** Build the output PDF described by `plan`. Sources are never mutated. */
export async function applyPagePlan(
  sources: ArrayBuffer[],
  plan: PagePlanItem[]
): Promise<Uint8Array> {
  if (!plan.length) throw new Error('Keep at least one page in the document.');
  const output = await PDFDocument.create();
  output.setCreator('PDF.mv');
  output.setProducer('PDF.mv');

  // Copy each source's pages in one pass so shared resources stay shared.
  const needed = new Map<number, number[]>();
  plan.forEach((item) => {
    if (isBlank(item)) return;
    if (item.source < 0 || item.source >= sources.length)
      throw new Error(`Page plan refers to a missing source (${item.source}).`);
    const list = needed.get(item.source) ?? [];
    list.push(item.page);
    needed.set(item.source, list);
  });
  const copied = new Map<number, ReturnType<typeof output.addPage>[]>();
  for (const [source, pages] of needed) {
    const doc = await PDFDocument.load(sources[source], {
      updateMetadata: false,
    });
    const count = doc.getPageCount();
    for (const page of pages)
      if (!Number.isInteger(page) || page < 0 || page >= count)
        throw new Error(
          `Page plan refers to page ${page + 1}, but the source has ${count} pages.`
        );
    copied.set(source, await output.copyPages(doc, pages));
  }
  const cursor = new Map<number, number>();
  const placed: (ReturnType<typeof output.addPage> | null)[] = [];
  for (const item of plan) {
    if (isBlank(item)) {
      placed.push(null);
      continue;
    }
    const index = cursor.get(item.source) ?? 0;
    cursor.set(item.source, index + 1);
    const page = copied.get(item.source)![index];
    const next = normalizeRotation(page.getRotation().angle + item.rotate);
    page.setRotation(degrees(next));
    placed.push(page);
  }

  // Visual size of a placed page (swap when turned sideways).
  const visualSize = (i: number): [number, number] | null => {
    const page = placed[i];
    if (!page) return null;
    const { width, height } = page.getSize();
    return page.getRotation().angle % 180 === 0
      ? [width, height]
      : [height, width];
  };
  const neighborSize = (i: number): [number, number] => {
    for (let d = 1; d < plan.length; d++) {
      const before = i - d >= 0 ? visualSize(i - d) : null;
      if (before) return before;
      const after = i + d < plan.length ? visualSize(i + d) : null;
      if (after) return after;
    }
    return A4;
  };

  plan.forEach((item, i) => {
    if (isBlank(item)) {
      const size: [number, number] =
        item.width > 0 && item.height > 0
          ? [item.width, item.height]
          : neighborSize(i);
      output.addPage(size);
    } else output.addPage(placed[i]!);
  });
  return output.save();
}

/** Split a plan into groups, cutting after each position in `splitAfter`. Empty groups are dropped. */
export function splitPlan<T>(plan: T[], splitAfter: Set<number>): T[][] {
  const groups: T[][] = [];
  let current: T[] = [];
  plan.forEach((item, index) => {
    current.push(item);
    if (splitAfter.has(index) && index < plan.length - 1) {
      groups.push(current);
      current = [];
    }
  });
  if (current.length) groups.push(current);
  return groups;
}

/** Cut positions for fixed-size parts of `n` pages. */
export function splitEvery(length: number, n: number): Set<number> {
  const result = new Set<number>();
  const size = Math.floor(n);
  if (!(size >= 1)) return result;
  for (let i = size - 1; i < length - 1; i += size) result.add(i);
  return result;
}

// ---------- Immutable list helpers (work for plan items and view models) ----------

function indexSet(length: number, indices: Iterable<number>) {
  return new Set([...indices].filter((i) => i >= 0 && i < length));
}

/**
 * Move the items at `indices` as one block (keeping their relative order) so
 * the block lands before the item that was at `to` (0..length, in original
 * positions). Returns the new list and the block's new positions.
 */
export function moveItems<T>(
  items: T[],
  indices: Iterable<number>,
  to: number
): { items: T[]; indices: number[] } {
  const chosen = indexSet(items.length, indices);
  if (!chosen.size) return { items: [...items], indices: [] };
  const target = Math.max(0, Math.min(items.length, to));
  const moved = items.filter((_, i) => chosen.has(i));
  const before = items.slice(0, target).filter((_, i) => !chosen.has(i));
  const after = items.slice(target).filter((_, i) => !chosen.has(i + target));
  return {
    items: [...before, ...moved, ...after],
    indices: moved.map((_, i) => before.length + i),
  };
}

/**
 * Nudge the chosen items by `delta` positions. Items stop at either edge and
 * never jump over each other, like Alt+Arrow in a page organizer.
 */
export function moveItemsBy<T>(
  items: T[],
  indices: Iterable<number>,
  delta: number
): { items: T[]; indices: number[] } {
  const next = [...items];
  const flags = next.map(() => false);
  for (const i of indexSet(items.length, indices)) flags[i] = true;
  const step = delta < 0 ? -1 : 1;
  for (let n = 0; n < Math.abs(delta); n++) {
    const order = flags.map((_, i) => i);
    if (step > 0) order.reverse();
    for (const i of order) {
      const j = i + step;
      if (!flags[i] || j < 0 || j >= next.length || flags[j]) continue;
      [next[i], next[j]] = [next[j], next[i]];
      [flags[i], flags[j]] = [flags[j], flags[i]];
    }
  }
  return {
    items: next,
    indices: flags.flatMap((f, i) => (f ? [i] : [])),
  };
}

/** Insert a copy right after each chosen item. Returns positions of the copies. */
export function duplicateItems<T>(
  items: T[],
  indices: Iterable<number>,
  clone: (item: T) => T = (item) =>
    typeof item === 'object' && item ? ({ ...item } as T) : item
): { items: T[]; indices: number[] } {
  const chosen = indexSet(items.length, indices);
  const result: T[] = [];
  const copies: number[] = [];
  items.forEach((item, i) => {
    result.push(item);
    if (chosen.has(i)) {
      copies.push(result.length);
      result.push(clone(item));
    }
  });
  return { items: result, indices: copies };
}

export function deleteItems<T>(items: T[], indices: Iterable<number>): T[] {
  const chosen = indexSet(items.length, indices);
  return items.filter((_, i) => !chosen.has(i));
}

export function insertItem<T>(items: T[], at: number, item: T): T[] {
  const index = Math.max(0, Math.min(items.length, at));
  return [...items.slice(0, index), item, ...items.slice(index)];
}

/** Rotate chosen source pages by `delta` degrees (blank pages are unaffected). */
export function rotateItems(
  plan: PagePlanItem[],
  indices: Iterable<number>,
  delta: number
): PagePlanItem[] {
  const chosen = indexSet(plan.length, indices);
  return plan.map((item, i) =>
    chosen.has(i) && !isBlank(item)
      ? { ...item, rotate: normalizeRotation(item.rotate + delta) }
      : item
  );
}

export function plansEqual(a: PagePlanItem[], b: PagePlanItem[]): boolean {
  return (
    a.length === b.length &&
    a.every((item, i) => {
      const other = b[i];
      if (isBlank(item) || isBlank(other))
        return (
          isBlank(item) &&
          isBlank(other) &&
          item.width === other.width &&
          item.height === other.height
        );
      return (
        item.source === other.source &&
        item.page === other.page &&
        item.rotate === other.rotate
      );
    })
  );
}
