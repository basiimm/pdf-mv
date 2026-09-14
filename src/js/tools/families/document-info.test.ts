import { describe, it, expect, beforeAll } from 'vitest';
import { toolDefinitions } from '../registry.js';
import { register } from './document-info.js';

beforeAll(() => {
  register();
});

const expectedIds = [
  'edit-metadata',
  'view-metadata',
  'page-dimensions',
  'add-attachments',
  'edit-attachments',
  'table-of-contents',
  'alternate-merge',
  'duplex-collate',
  'remove-blank-pages',
  'divide-pages',
  'overlay-pdf',
  'rotate-custom',
];

describe('document-info family registration', () => {
  it('registers every tool for this family', () => {
    for (const id of expectedIds) {
      expect(toolDefinitions.has(id), `expected ${id} to be registered`).toBe(
        true
      );
    }
  });

  it('does not register tools that need dynamic fields or a tree UI', () => {
    expect(toolDefinitions.has('bookmark')).toBe(false);
    expect(toolDefinitions.has('pdf-layers')).toBe(false);
  });

  it('gives every tool a verb-first primary label and a past-tense done label', () => {
    for (const id of expectedIds) {
      const tool = toolDefinitions.get(id)!;
      expect(tool.primaryLabel.length).toBeGreaterThan(0);
      expect(tool.doneLabel.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it('marks revision tools that change the open document, download tools that export, and new-document tools that branch', () => {
    const tool = (id: string) => toolDefinitions.get(id)!;
    expect(tool('edit-metadata').output).toBe('revision');
    expect(tool('view-metadata').output).toBe('download');
    expect(tool('page-dimensions').output).toBe('download');
    expect(tool('add-attachments').output).toBe('revision');
    expect(tool('edit-attachments').output).toBe('revision');
    expect(tool('table-of-contents').output).toBe('revision');
    expect(tool('alternate-merge').output).toBe('new-document');
    expect(tool('duplex-collate').output).toBe('revision');
    expect(tool('remove-blank-pages').output).toBe('revision');
    expect(tool('divide-pages').output).toBe('revision');
    expect(tool('overlay-pdf').output).toBe('revision');
    expect(tool('rotate-custom').output).toBe('revision');
  });

  it('declares extraInput (not input) for tools that need files alongside the open PDF', () => {
    const tool = (id: string) => toolDefinitions.get(id)!;
    for (const id of ['add-attachments', 'alternate-merge', 'overlay-pdf']) {
      expect(tool(id).input, `${id} should not use input`).toBeUndefined();
      expect(
        tool(id).extraInput,
        `${id} should declare extraInput`
      ).toBeDefined();
    }
  });

  it('gives read-only tools an inspect and every other tool sensible field defaults', () => {
    const tool = (id: string) => toolDefinitions.get(id)!;
    expect(typeof tool('view-metadata').inspect).toBe('function');
    expect(typeof tool('page-dimensions').inspect).toBe('function');
    expect(typeof tool('edit-metadata').inspect).toBe('function');
    expect(typeof tool('edit-attachments').inspect).toBe('function');
    expect(typeof tool('table-of-contents').inspect).toBe('function');

    for (const id of expectedIds) {
      for (const field of tool(id).fields) {
        expect(
          field.value,
          `${id}.${field.key} should have a default value`
        ).toBeDefined();
      }
    }
  });
});
