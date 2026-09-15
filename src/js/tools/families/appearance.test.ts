import { describe, expect, it } from 'vitest';
import { toolDefinitions } from '../registry.js';

const revisions = [
  'page-numbers',
  'bates-numbering',
  'add-page-labels',
  'invert-colors',
  'scanner-effect',
  'adjust-colors',
  'background-color',
  'text-color',
];
const newDocuments = [
  'posterize-pdf',
  'n-up-pdf',
  'pdf-booklet',
  'combine-single-page',
];

describe('appearance family registration', () => {
  it('registers every tool with the right output', () => {
    for (const id of revisions)
      expect(toolDefinitions.get(id)?.output, id).toBe('revision');
    for (const id of newDocuments)
      expect(toolDefinitions.get(id)?.output, id).toBe('new-document');
  });

  it('previews only fast vector tools live', () => {
    const previewed = [...revisions, ...newDocuments].filter(
      (id) => toolDefinitions.get(id)?.preview
    );
    expect(previewed.sort()).toEqual(
      ['background-color', 'bates-numbering', 'page-numbers'].sort()
    );
  });

  it('uses verb-first labels and valid defaults', () => {
    for (const id of [...revisions, ...newDocuments]) {
      const tool = toolDefinitions.get(id)!;
      expect(tool.primaryLabel, id).toMatch(/^[A-Z][a-z]+ /);
      expect(tool.doneLabel.length, id).toBeGreaterThan(3);
      for (const field of tool.fields) {
        if (field.options)
          expect(
            field.options.map(([value]) => value),
            `${id}.${field.key}`
          ).toContain(field.value);
        expect(field.label, `${id}.${field.key}`).not.toMatch(
          /\b[A-Z][a-z]+ [A-Z][a-z]+\b(?<!New Roman)/
        );
      }
    }
  });
});
