import { describe, it, expect, beforeAll } from 'vitest';
import { toolDefinitions } from '../registry.js';
import { register } from './create-pdf.js';

const ids = [
  'image-to-pdf',
  'bmp-to-pdf',
  'heic-to-pdf',
  'tiff-to-pdf',
  'svg-to-pdf',
  'psd-to-pdf',
  'word-to-pdf',
  'excel-to-pdf',
  'powerpoint-to-pdf',
  'odt-to-pdf',
  'ods-to-pdf',
  'odp-to-pdf',
  'odg-to-pdf',
  'rtf-to-pdf',
  'wpd-to-pdf',
  'wps-to-pdf',
  'pages-to-pdf',
  'pub-to-pdf',
  'vsd-to-pdf',
  'xps-to-pdf',
  'mobi-to-pdf',
  'epub-to-pdf',
  'fb2-to-pdf',
  'cbz-to-pdf',
  'txt-to-pdf',
  'json-to-pdf',
  'csv-to-pdf',
  'xml-to-pdf',
  'email-to-pdf',
];

beforeAll(() => {
  register();
});

describe('create-pdf family registration', () => {
  it('registers every tool in the family', () => {
    for (const id of ids) {
      expect(toolDefinitions.has(id)).toBe(true);
    }
  });

  it('outputs a new document with the "Create PDF" / "PDF created" labels', () => {
    for (const id of ids) {
      const def = toolDefinitions.get(id)!;
      expect(def.output).toBe('new-document');
      expect(def.primaryLabel).toBe('Create PDF');
      expect(def.doneLabel).toBe('PDF created');
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  it('takes source files (not the open PDF), always allowing multiple', () => {
    for (const id of ids) {
      const def = toolDefinitions.get(id)!;
      expect(def.input).toBeDefined();
      expect(def.input!.accept.length).toBeGreaterThan(0);
      expect(def.input!.multiple).toBe(true);
      expect(def.input!.label.length).toBeGreaterThan(0);
    }
  });

  it('names Office/e-book conversions with a fidelity note', () => {
    const officeAndEbookIds = [
      'word-to-pdf',
      'excel-to-pdf',
      'powerpoint-to-pdf',
      'odt-to-pdf',
      'ods-to-pdf',
      'odp-to-pdf',
      'odg-to-pdf',
      'rtf-to-pdf',
      'wpd-to-pdf',
      'wps-to-pdf',
      'pages-to-pdf',
      'pub-to-pdf',
      'vsd-to-pdf',
      'mobi-to-pdf',
      'epub-to-pdf',
      'fb2-to-pdf',
    ];
    for (const id of officeAndEbookIds) {
      const def = toolDefinitions.get(id)!;
      expect(def.description.toLowerCase()).toContain(
        'complex layouts may shift'
      );
    }
  });

  it('gives quality fields (image-to-pdf, tiff-to-pdf, svg-to-pdf) a "medium" default', () => {
    for (const id of ['image-to-pdf', 'tiff-to-pdf', 'svg-to-pdf']) {
      const def = toolDefinitions.get(id)!;
      const quality = def.fields.find((f) => f.key === 'quality');
      expect(quality?.value).toBe('medium');
      expect(quality?.options?.map((o) => o[0])).toEqual([
        'high',
        'medium',
        'low',
      ]);
    }
  });

  it('gives txt-to-pdf sensible defaults with rare options marked advanced', () => {
    const def = toolDefinitions.get('txt-to-pdf')!;
    const fontSize = def.fields.find((f) => f.key === 'fontSize');
    const pageSize = def.fields.find((f) => f.key === 'pageSize');
    const fontName = def.fields.find((f) => f.key === 'fontName');
    const textColor = def.fields.find((f) => f.key === 'textColor');
    expect(fontSize?.value).toBe('12');
    expect(pageSize?.value).toBe('a4');
    expect(fontName?.advanced).toBe(true);
    expect(textColor?.advanced).toBe(true);
  });

  it('gives email-to-pdf a default a4 page size and advanced cc/bcc + attachment toggles', () => {
    const def = toolDefinitions.get('email-to-pdf')!;
    const pageSize = def.fields.find((f) => f.key === 'pageSize');
    const includeCcBcc = def.fields.find((f) => f.key === 'includeCcBcc');
    const includeAttachments = def.fields.find(
      (f) => f.key === 'includeAttachments'
    );
    expect(pageSize?.value).toBe('a4');
    expect(includeCcBcc?.value).toBe('true');
    expect(includeCcBcc?.advanced).toBe(true);
    expect(includeAttachments?.value).toBe('true');
    expect(includeAttachments?.advanced).toBe(true);
  });

  it('leaves image-only formats (bmp, heic, psd) with no fields, matching legacy behavior', () => {
    for (const id of ['bmp-to-pdf', 'heic-to-pdf', 'psd-to-pdf']) {
      expect(toolDefinitions.get(id)!.fields).toEqual([]);
    }
  });
});
