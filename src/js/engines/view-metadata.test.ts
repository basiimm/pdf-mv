import { describe, it, expect } from 'vitest';
import {
  metadataDetails,
  type DocumentMetadataResult,
} from './view-metadata.js';

describe('metadataDetails', () => {
  it('leads with pages, PDF version and encryption state', () => {
    const result: DocumentMetadataResult = {
      info: { Title: 'Report', Author: '' },
      pdfVersion: '1.7',
      pageCount: 3,
      encrypted: false,
    };
    const rows = metadataDetails(result);
    expect(rows[0]).toEqual(['Pages', '3']);
    expect(rows[1]).toEqual(['PDF version', '1.7']);
    expect(rows[2]).toEqual(['Encrypted', 'No']);
    expect(rows).toContainEqual(['Title', 'Report']);
  });

  it('skips empty values', () => {
    const result: DocumentMetadataResult = {
      info: { Author: '', Subject: undefined as unknown as string },
      pdfVersion: '1.4',
      pageCount: 1,
      encrypted: true,
    };
    const rows = metadataDetails(result);
    expect(rows.find(([k]) => k === 'Author')).toBeUndefined();
    expect(rows.find(([k]) => k === 'Subject')).toBeUndefined();
    expect(rows.find(([k]) => k === 'Encrypted')).toEqual(['Encrypted', 'Yes']);
  });
});
