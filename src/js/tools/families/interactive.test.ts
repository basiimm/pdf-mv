import { describe, it, expect, beforeAll } from 'vitest';
import { toolDefinitions } from '../registry.js';
import { register } from './interactive.js';

beforeAll(() => {
  register();
});

const expectedIds = ['crop-pdf', 'form-filler', 'pdf-layers'];

describe('interactive family registration', () => {
  it('registers every tool for this family', () => {
    for (const id of expectedIds) {
      expect(toolDefinitions.has(id), `expected ${id} to be registered`).toBe(
        true
      );
    }
  });

  it('gives every tool a verb-first primary label and a past-tense done label', () => {
    for (const id of expectedIds) {
      const tool = toolDefinitions.get(id)!;
      expect(tool.primaryLabel.length).toBeGreaterThan(0);
      expect(tool.doneLabel.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it('marks the document-revising tools as revision output', () => {
    const tool = (id: string) => toolDefinitions.get(id)!;
    expect(tool('crop-pdf').output).toBe('revision');
    expect(tool('form-filler').output).toBe('revision');
    expect(tool('pdf-layers').output).toBe('revision');
  });

  it('enables live preview for the revision tools', () => {
    const tool = (id: string) => toolDefinitions.get(id)!;
    expect(tool('crop-pdf').preview).toBe(true);
    expect(tool('form-filler').preview).toBe(true);
    expect(tool('pdf-layers').preview).toBe(true);
  });

  it('gives form-filler and pdf-layers an inspect() for dynamic, document-specific fields', () => {
    const tool = (id: string) => toolDefinitions.get(id)!;
    expect(typeof tool('form-filler').inspect).toBe('function');
    expect(typeof tool('pdf-layers').inspect).toBe('function');
    expect(typeof tool('crop-pdf').inspect).toBe('function');
  });

  it('gives crop-pdf percent/mm unit and margin fields with a page-scope field', () => {
    const tool = toolDefinitions.get('crop-pdf')!;
    const keys = tool.fields.map((f) => f.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'unit',
        'top',
        'right',
        'bottom',
        'left',
        'pages',
      ])
    );
    const unit = tool.fields.find((f) => f.key === 'unit')!;
    expect(unit.type).toBe('segmented');
    expect(unit.value).toBe('percent');
  });

  it('gives form-filler a static advanced flatten checkbox', () => {
    const tool = toolDefinitions.get('form-filler')!;
    const flatten = tool.fields.find((f) => f.key === 'flatten');
    expect(flatten).toBeDefined();
    expect(flatten!.type).toBe('checkbox');
    expect(flatten!.advanced).toBe(true);
  });

  it('gives pdf-layers no static fields (all fields are dynamic, from inspect)', () => {
    const tool = toolDefinitions.get('pdf-layers')!;
    expect(tool.fields).toEqual([]);
  });

  it('keeps the full Markdown editor until the native renderer reaches parity', () => {
    expect(toolDefinitions.has('markdown-to-pdf')).toBe(false);
  });
});
