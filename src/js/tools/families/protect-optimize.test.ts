import { describe, it, expect } from 'vitest';
import { toolDefinitions } from '../registry.js';
import type { ToolField } from '../types.js';

const PROTECT_OPTIMIZE_IDS = [
  'compress-pdf',
  'encrypt-pdf',
  'decrypt-pdf',
  'change-permissions',
  'remove-restrictions',
  'sanitize-pdf',
  'repair-pdf',
  'linearize-pdf',
  'flatten-pdf',
  'edit-metadata',
  'pdf-to-pdfa',
  'rasterize-pdf',
  'font-to-outline',
  'deskew-pdf',
  'fix-page-size',
];

function fieldSatisfiesOwnDefault(field: ToolField): boolean {
  if (field.type === 'checkbox') {
    return field.value === 'true' || field.value === 'false';
  }
  if (
    (field.type === 'select' || field.type === 'segmented') &&
    field.options
  ) {
    return field.options.some(([value]) => value === field.value);
  }
  return true;
}

describe('protect-optimize family registration', () => {
  it('registers every tool id in this family', () => {
    for (const id of PROTECT_OPTIMIZE_IDS) {
      expect(toolDefinitions.has(id)).toBe(true);
    }
  });

  it.each(PROTECT_OPTIMIZE_IDS)(
    '%s has non-empty labels and a valid output kind',
    (id) => {
      const def = toolDefinitions.get(id)!;
      expect(def).toBeDefined();
      expect(def.primaryLabel.trim().length).toBeGreaterThan(0);
      expect(def.doneLabel.trim().length).toBeGreaterThan(0);
      expect(def.description.trim().length).toBeGreaterThan(0);
      expect(['revision', 'new-document', 'download']).toContain(def.output);
      expect(typeof def.run).toBe('function');
    }
  );

  it.each(PROTECT_OPTIMIZE_IDS)(
    "%s field defaults satisfy each field's own options",
    (id) => {
      const def = toolDefinitions.get(id)!;
      for (const field of def.fields) {
        expect(fieldSatisfiesOwnDefault(field)).toBe(true);
      }
    }
  );

  it('archival copies open as new documents, encrypted files download, the rest are revisions', () => {
    for (const id of PROTECT_OPTIMIZE_IDS) {
      const def = toolDefinitions.get(id)!;
      if (id === 'pdf-to-pdfa') {
        expect(def.output).toBe('new-document');
      } else if (id === 'encrypt-pdf' || id === 'change-permissions') {
        expect(def.output).toBe('download');
      } else {
        expect(def.output).toBe('revision');
      }
    }
  });

  it('none of these tools require a separate input source (they operate on the open PDF)', () => {
    for (const id of PROTECT_OPTIMIZE_IDS) {
      const def = toolDefinitions.get(id)!;
      expect(def.input).toBeUndefined();
    }
  });
});
