import { describe, it, expect, vi } from 'vitest';
import type { SignatureValidationResult } from '@/types';

vi.mock('../logic/validate-signature-pdf.js', () => ({
  validatePdfSignatures: vi.fn(async () => mockResults),
}));

const {
  signatureStatus,
  signatureDetailRows,
  buildSignatureReport,
  exportSignatureReport,
} = await import('./validate-signature-pdf.js');

function baseResult(
  overrides: Partial<SignatureValidationResult>
): SignatureValidationResult {
  return {
    signatureIndex: 0,
    isValid: true,
    signerName: 'Ada Lovelace',
    issuer: 'Test CA',
    validFrom: new Date('2020-01-01T00:00:00Z'),
    validTo: new Date('2030-01-01T00:00:00Z'),
    isExpired: false,
    isSelfSigned: false,
    isTrusted: false,
    algorithms: { digest: 'SHA-256', signature: 'RSA with SHA-256' },
    serialNumber: '01',
    coverageStatus: 'full',
    ...overrides,
  };
}

let mockResults: SignatureValidationResult[] = [];

function pdfFile(): File {
  return new File([new Uint8Array([1, 2, 3])], 'signed.pdf', {
    type: 'application/pdf',
  });
}

describe('signatureStatus', () => {
  it('is valid for a fully-verified, unexpired signature', () => {
    expect(signatureStatus(baseResult({}))).toBe('valid');
  });

  it('is invalid when verification failed', () => {
    expect(signatureStatus(baseResult({ isValid: false }))).toBe('invalid');
  });

  it('is invalid when the digest is insecure even if otherwise valid', () => {
    expect(signatureStatus(baseResult({ usesInsecureDigest: true }))).toBe(
      'invalid'
    );
  });

  it('is unknown for an expired certificate on an otherwise valid signature', () => {
    expect(signatureStatus(baseResult({ isExpired: true }))).toBe('unknown');
  });
});

describe('signatureDetailRows', () => {
  it('reports "None found" for a document with no signatures', () => {
    expect(signatureDetailRows([])).toEqual([['Signatures', 'None found']]);
  });

  it('builds a summary row and per-signature rows', () => {
    const rows = signatureDetailRows([
      baseResult({}),
      baseResult({ isValid: false, errorMessage: 'Tampered' }),
    ]);
    expect(rows[0]).toEqual(['Summary', '2 signatures · 1 valid']);
    const labels = rows.map(([label]) => label);
    expect(labels).toContain('Signer 1');
    expect(labels).toContain('Signer 2');
    expect(labels).toContain('Certificate issuer 1');
    expect(labels).toContain('Reason 2');
  });

  it('omits the numeric suffix for a single signature', () => {
    const rows = signatureDetailRows([baseResult({})]);
    const labels = rows.map(([label]) => label);
    expect(labels).toContain('Signer');
    expect(labels).not.toContain('Signer 1');
  });
});

describe('buildSignatureReport', () => {
  it('shapes a JSON-serializable report from validation results', () => {
    const report = buildSignatureReport('doc.pdf', [baseResult({})]);
    expect(report.document).toBe('doc.pdf');
    expect(report.signatureCount).toBe(1);
    expect(report.validCount).toBe(1);
    expect(() => JSON.stringify(report)).not.toThrow();
  });
});

describe('exportSignatureReport engine', () => {
  it('produces a JSON report file named after the source document', async () => {
    mockResults = [baseResult({})];
    const result = await exportSignatureReport(
      pdfFile(),
      {},
      { signal: new AbortController().signal, progress: vi.fn() }
    );
    expect(result.name).toBe('signed-signature-report.json');
    expect(result.type).toBe('application/json');
    const text = await result.text();
    const parsed = JSON.parse(text);
    expect(parsed.signatureCount).toBe(1);
  });
});
