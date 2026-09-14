import { describe, it, expect, beforeAll } from 'vitest';
import { toolDefinitions } from '../registry.js';
import { register } from './exports.js';

const ids = [
  'pdf-to-bmp',
  'pdf-to-tiff',
  'pdf-to-svg',
  'pdf-to-cbz',
  'pdf-to-docx',
  'pdf-to-excel',
  'pdf-to-csv',
  'pdf-to-markdown',
  'pdf-to-json',
  'pdf-to-greyscale',
  'extract-images',
  'extract-tables',
  'prepare-pdf-for-ai',
  'extract-attachments',
  'pdf-to-zip',
];

beforeAll(() => {
  register();
});

describe('exports family registration', () => {
  it('registers every tool in the family', () => {
    for (const id of ids) {
      expect(toolDefinitions.has(id)).toBe(true);
    }
  });

  it('gives every tool a verb-first primary label and a past-tense done label', () => {
    for (const id of ids) {
      const def = toolDefinitions.get(id)!;
      expect(def.primaryLabel.length).toBeGreaterThan(0);
      expect(def.doneLabel.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  it('outputs a revision only for the grayscale conversion; everything else downloads', () => {
    for (const id of ids) {
      const def = toolDefinitions.get(id)!;
      if (id === 'pdf-to-greyscale') {
        expect(def.output).toBe('revision');
      } else {
        expect(def.output).toBe('download');
      }
    }
  });

  it('only pdf-to-zip declares its own multi-file input', () => {
    for (const id of ids) {
      const def = toolDefinitions.get(id)!;
      if (id === 'pdf-to-zip') {
        expect(def.input).toEqual({
          accept: 'application/pdf,.pdf',
          multiple: true,
          label: 'Choose PDFs',
        });
      } else {
        expect(def.input).toBeUndefined();
      }
    }
  });

  it('gives every field a valid, in-range default value', () => {
    for (const id of ids) {
      const def = toolDefinitions.get(id)!;
      for (const field of def.fields) {
        expect(field.key.length).toBeGreaterThan(0);
        if (field.type === 'select' || field.type === 'segmented') {
          expect(field.options?.some(([value]) => value === field.value)).toBe(
            true
          );
        }
        if (field.type === 'checkbox') {
          expect(['true', 'false']).toContain(field.value);
        }
        if (field.type === 'number') {
          expect(Number.isNaN(Number(field.value))).toBe(false);
          if (field.min !== undefined)
            expect(Number(field.value)).toBeGreaterThanOrEqual(
              Number(field.min)
            );
          if (field.max !== undefined)
            expect(Number(field.value)).toBeLessThanOrEqual(Number(field.max));
        }
      }
    }
  });
});
