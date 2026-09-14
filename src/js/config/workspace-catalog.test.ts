import { describe, it, expect } from 'vitest';
import {
  engines,
  groups,
  groupForEngine,
  conversionTo,
  conversionFrom,
  matchesGroup,
} from './workspace-catalog';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
describe('workspace tool catalog', () => {
  it('retains all 118 engines exactly once under a valid task group', () => {
    expect(engines.size).toBe(118);
    const mapped = groups.flatMap((g) => g.members);
    expect(mapped.length).toBe(engines.size);
    expect(new Set(mapped).size).toBe(mapped.length);
    for (const [id, engine] of engines) {
      expect(groupForEngine.has(id), id).toBe(true);
      expect(
        existsSync(resolve('src/pages', engine.href.split('/').pop()!)),
        id
      ).toBe(true);
    }
  });
  it('finds grouped features by their original tool names', () => {
    for (const [id, engine] of engines)
      expect(
        matchesGroup(groupForEngine.get(id)!, engine.name),
        engine.name
      ).toBe(true);
  });
  it('keeps visual PDF changes out of format conversion', () => {
    expect(conversionFrom).not.toContain('pdf-to-greyscale');
    expect(conversionFrom).not.toContain('ocr-pdf');
    expect(conversionTo).toContain('word-to-pdf');
    expect(conversionFrom).toContain('pdf-to-docx');
  });
});
