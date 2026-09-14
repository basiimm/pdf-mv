import { describe, it, expect, beforeAll } from 'vitest';
import { toolDefinitions } from '../registry.js';
import { register } from './signing-ocr.js';
import type { ToolField } from '../types.js';

const ids = [
  'ocr-pdf',
  'digital-sign-pdf',
  'validate-signature-pdf',
  'timestamp-pdf',
];

beforeAll(() => {
  register();
});

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

describe('signing-ocr family registration', () => {
  it('registers every tool id in this family', () => {
    for (const id of ids) {
      expect(toolDefinitions.has(id)).toBe(true);
    }
  });

  it('gives every tool non-empty labels, a description and a valid output kind', () => {
    for (const id of ids) {
      const def = toolDefinitions.get(id)!;
      expect(def.primaryLabel.trim().length).toBeGreaterThan(0);
      expect(def.doneLabel.trim().length).toBeGreaterThan(0);
      expect(def.description.trim().length).toBeGreaterThan(0);
      expect(['revision', 'new-document', 'download']).toContain(def.output);
      expect(typeof def.run).toBe('function');
    }
  });

  it('every field default satisfies the field’s own options', () => {
    for (const id of ids) {
      const def = toolDefinitions.get(id)!;
      for (const field of def.fields) {
        expect(fieldSatisfiesOwnDefault(field)).toBe(true);
      }
    }
  });

  it('ocr-pdf revises the open document in place', () => {
    expect(toolDefinitions.get('ocr-pdf')!.output).toBe('revision');
  });

  it('signing, validation and timestamping all download (signatures must not be re-saved)', () => {
    for (const id of [
      'digital-sign-pdf',
      'validate-signature-pdf',
      'timestamp-pdf',
    ]) {
      expect(toolDefinitions.get(id)!.output).toBe('download');
    }
  });

  it('only digital-sign-pdf declares an extraInput for the certificate file', () => {
    for (const id of ids) {
      const def = toolDefinitions.get(id)!;
      if (id === 'digital-sign-pdf') {
        expect(def.extraInput).toEqual({
          accept: '.p12,.pfx,application/x-pkcs12',
          multiple: false,
          label: 'Choose certificate (.p12 or .pfx)',
        });
      } else {
        expect(def.extraInput).toBeUndefined();
      }
      expect(def.input).toBeUndefined();
    }
  });

  it('digital-sign-pdf exposes a password-type field for the certificate password', () => {
    const def = toolDefinitions.get('digital-sign-pdf')!;
    const passwordField = def.fields.find((f) => f.key === 'password');
    expect(passwordField?.type).toBe('password');
    expect(passwordField?.value).toBe('');
  });

  it('only validate-signature-pdf declares inspect() (read-only tool)', () => {
    for (const id of ids) {
      const def = toolDefinitions.get(id)!;
      if (id === 'validate-signature-pdf') {
        expect(typeof def.inspect).toBe('function');
        expect(def.fields).toEqual([]);
      } else {
        expect(def.inspect).toBeUndefined();
      }
    }
  });

  it('ocr-pdf defaults its language field to English when available', () => {
    const def = toolDefinitions.get('ocr-pdf')!;
    const languageField = def.fields.find((f) => f.key === 'language');
    expect(languageField?.type).toBe('select');
    expect(languageField?.value).toBe('eng');
    expect(languageField?.options?.length).toBeGreaterThan(0);
  });

  it('timestamp-pdf offers a select of TSA servers with a valid default', () => {
    const def = toolDefinitions.get('timestamp-pdf')!;
    const tsaField = def.fields.find((f) => f.key === 'tsaUrl');
    expect(tsaField?.type).toBe('select');
    expect(tsaField?.options?.length).toBeGreaterThan(0);
    expect(tsaField?.options?.some(([value]) => value === tsaField.value)).toBe(
      true
    );
  });
});
