import { describe, it, expect } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import {
  applyPagePlan,
  deleteItems,
  duplicateItems,
  identityPlan,
  insertItem,
  moveItems,
  moveItemsBy,
  normalizeRotation,
  plansEqual,
  rotateItems,
  splitEvery,
  splitPlan,
  type PagePlanItem,
} from './page-plan';

/** A source whose page N is (100 + N) points wide, so order is observable. */
async function source(
  count: number,
  base = 100,
  rotation = 0
): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i++) {
    const page = doc.addPage([base + i, 500]);
    if (rotation) page.setRotation(degrees(rotation));
  }
  const bytes = await doc.save();
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

async function describePages(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => ({
    width: Math.round(p.getWidth()),
    height: Math.round(p.getHeight()),
    rotation: p.getRotation().angle,
  }));
}

const p = (source: number, page: number, rotate: 0 | 90 | 180 | 270 = 0) => ({
  source,
  page,
  rotate,
});

describe('applyPagePlan', () => {
  it('reorders, repeats and drops pages', async () => {
    const a = await source(4);
    const out = await describePages(
      await applyPagePlan([a], [p(0, 3), p(0, 0), p(0, 0), p(0, 2)])
    );
    expect(out.map((x) => x.width)).toEqual([103, 100, 100, 102]);
  });

  it('interleaves pages from several sources', async () => {
    const a = await source(2, 100);
    const b = await source(2, 200);
    const out = await describePages(
      await applyPagePlan([a, b], [p(1, 1), p(0, 0), p(1, 0), p(0, 1)])
    );
    expect(out.map((x) => x.width)).toEqual([201, 100, 200, 101]);
  });

  it('adds rotation to the existing page rotation', async () => {
    const a = await source(3, 100, 90);
    const out = await describePages(
      await applyPagePlan([a], [p(0, 0, 90), p(0, 1, 270), p(0, 2)])
    );
    expect(out.map((x) => x.rotation)).toEqual([180, 0, 90]);
  });

  it('sizes blank pages explicitly or from the nearest neighbour', async () => {
    const a = await source(2, 300);
    const plan: PagePlanItem[] = [
      { blank: true, width: 0, height: 0 },
      p(0, 0),
      { blank: true, width: 200, height: 250 },
      p(0, 1, 90),
      { blank: true, width: 0, height: 0 },
    ];
    const out = await describePages(await applyPagePlan([a], plan));
    expect(out).toHaveLength(5);
    // First blank takes the following page's size.
    expect(out[0]).toMatchObject({ width: 300, height: 500 });
    expect(out[2]).toMatchObject({ width: 200, height: 250 });
    // Last blank follows the rotated neighbour's visual (landscape) size.
    expect(out[4]).toMatchObject({ width: 500, height: 301 });
  });

  it('uses A4 for a plan of only blank pages', async () => {
    const out = await describePages(
      await applyPagePlan([], [{ blank: true, width: 0, height: 0 }])
    );
    expect(out[0]).toMatchObject({ width: 595, height: 842 });
  });

  it('rejects empty plans and out-of-range references', async () => {
    const a = await source(2);
    await expect(applyPagePlan([a], [])).rejects.toThrow(/at least one page/);
    await expect(applyPagePlan([a], [p(0, 5)])).rejects.toThrow(/page 6/);
    await expect(applyPagePlan([a], [p(3, 0)])).rejects.toThrow(/source/);
  });

  it('does not modify the source bytes', async () => {
    const a = await source(2);
    const copy = new Uint8Array(a.slice(0));
    await applyPagePlan([a], [p(0, 1, 90)]);
    expect(new Uint8Array(a)).toEqual(copy);
  });
});

describe('split helpers', () => {
  const plan = identityPlan([6]);
  it('cuts after marker positions and ignores a trailing marker', () => {
    const groups = splitPlan(plan, new Set([1, 3, 5]));
    expect(
      groups.map((g) => g.map((x) => (x as { page: number }).page))
    ).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
  });
  it('returns one group without markers', () => {
    expect(splitPlan(plan, new Set())).toHaveLength(1);
    expect(splitPlan([], new Set([0]))).toEqual([]);
  });
  it('computes every-N cut positions', () => {
    expect([...splitEvery(6, 2)]).toEqual([1, 3]);
    expect([...splitEvery(7, 3)]).toEqual([2, 5]);
    expect([...splitEvery(3, 5)]).toEqual([]);
    expect([...splitEvery(3, 0)]).toEqual([]);
    expect(
      splitPlan(identityPlan([7]), splitEvery(7, 3)).map((g) => g.length)
    ).toEqual([3, 3, 1]);
  });
});

describe('list helpers', () => {
  const letters = ['a', 'b', 'c', 'd', 'e'];
  it('moves a non-contiguous block before a target', () => {
    expect(moveItems(letters, [3, 1], 0)).toEqual({
      items: ['b', 'd', 'a', 'c', 'e'],
      indices: [0, 1],
    });
    expect(moveItems(letters, [0, 1], 5)).toEqual({
      items: ['c', 'd', 'e', 'a', 'b'],
      indices: [3, 4],
    });
    expect(moveItems(letters, [1], 3).items).toEqual(['a', 'c', 'b', 'd', 'e']);
    expect(letters).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('nudges items without passing edges or each other', () => {
    expect(moveItemsBy(letters, [1, 3], -1)).toEqual({
      items: ['b', 'a', 'd', 'c', 'e'],
      indices: [0, 2],
    });
    expect(moveItemsBy(letters, [0, 1], -1).items).toEqual(letters);
    expect(moveItemsBy(letters, [3], 1).items).toEqual([
      'a',
      'b',
      'c',
      'e',
      'd',
    ]);
    expect(moveItemsBy(letters, [0], 3)).toEqual({
      items: ['b', 'c', 'd', 'a', 'e'],
      indices: [3],
    });
  });
  it('duplicates after each original', () => {
    const items = [{ v: 1 }, { v: 2 }];
    const result = duplicateItems(items, [0, 1]);
    expect(result.items.map((x) => x.v)).toEqual([1, 1, 2, 2]);
    expect(result.indices).toEqual([1, 3]);
    expect(result.items[1]).not.toBe(items[0]);
  });
  it('deletes and inserts immutably', () => {
    expect(deleteItems(letters, [0, 4, 9])).toEqual(['b', 'c', 'd']);
    expect(insertItem(letters, 2, 'x')).toEqual(['a', 'b', 'x', 'c', 'd', 'e']);
    expect(insertItem(letters, 99, 'x').at(-1)).toBe('x');
  });
  it('rotates source pages only and normalizes angles', () => {
    const plan: PagePlanItem[] = [
      p(0, 0),
      { blank: true, width: 1, height: 1 },
      p(0, 1, 270),
    ];
    const rotated = rotateItems(plan, [0, 1, 2], 90);
    expect(rotated[0]).toMatchObject({ rotate: 90 });
    expect(rotated[1]).toBe(plan[1]);
    expect(rotated[2]).toMatchObject({ rotate: 0 });
    expect(normalizeRotation(-90)).toBe(270);
    expect(plansEqual(plan, [...plan])).toBe(true);
    expect(plansEqual(plan, rotated)).toBe(false);
  });
});
