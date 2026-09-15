// Pure engine for the validate-signature-pdf tool. See docs/TOOL-MIGRATION-GUIDE.md.
import { validatePdfSignatures } from '../logic/validate-signature-pdf.js';
import type { SignatureValidationResult } from '@/types';

export interface ValidateSignaturePdfOptions {
  [key: string]: never;
}

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

function formatDate(date?: Date): string {
  if (!date || date.getTime() === 0) return 'Unknown';
  return date.toISOString();
}

/** Read-only status label used both in the inspect() rows and the report. */
export function signatureStatus(
  result: SignatureValidationResult
): 'valid' | 'invalid' | 'unknown' {
  if (result.usesInsecureDigest) return 'invalid';
  if (!result.isValid) return 'invalid';
  if (result.isExpired) return 'unknown';
  return 'valid';
}

export async function analyzeSignatures(
  file: File
): Promise<SignatureValidationResult[]> {
  const pdfBytes = new Uint8Array(await file.arrayBuffer());
  return validatePdfSignatures(pdfBytes);
}

/** Pure formatting: turns parsed results into the inspect() details rows. */
export function signatureDetailRows(
  results: SignatureValidationResult[]
): [label: string, value: string][] {
  if (results.length === 0) {
    return [['Signatures', 'None found']];
  }

  const validCount = results.filter(
    (r) => signatureStatus(r) === 'valid'
  ).length;
  const rows: [string, string][] = [
    [
      'Summary',
      `${results.length} signature${results.length === 1 ? '' : 's'} · ${validCount} valid`,
    ],
  ];

  results.forEach((result, i) => {
    const suffix = results.length > 1 ? ` ${i + 1}` : '';
    rows.push([`Signer${suffix}`, result.signerName]);
    rows.push([`Signed at${suffix}`, formatDate(result.signatureDate)]);
    rows.push([`Status${suffix}`, signatureStatus(result)]);
    const reason = result.errorMessage || result.unsupportedAlgorithmReason;
    if (reason) rows.push([`Reason${suffix}`, reason]);
    rows.push([
      `Covers whole document${suffix}`,
      result.coverageStatus === 'full' ? 'Yes' : 'No',
    ]);
    rows.push([`Certificate issuer${suffix}`, result.issuer]);
    rows.push([`Certificate expiry${suffix}`, formatDate(result.validTo)]);
  });

  return rows;
}

/** Pure formatting: turns parsed results into the exported JSON report. */
export function buildSignatureReport(
  documentName: string,
  results: SignatureValidationResult[]
): Record<string, unknown> {
  return {
    document: documentName,
    generatedAt: new Date().toISOString(),
    signatureCount: results.length,
    validCount: results.filter((r) => signatureStatus(r) === 'valid').length,
    signatures: results.map((r) => ({
      signer: r.signerName,
      signerOrganization: r.signerOrg ?? null,
      signerEmail: r.signerEmail ?? null,
      issuer: r.issuer,
      issuerOrganization: r.issuerOrg ?? null,
      signedAt: r.signatureDate ? r.signatureDate.toISOString() : null,
      status: signatureStatus(r),
      reason: r.errorMessage || r.unsupportedAlgorithmReason || null,
      coversWholeDocument: r.coverageStatus === 'full',
      certificateValidFrom: formatDate(r.validFrom),
      certificateValidTo: formatDate(r.validTo),
      digestAlgorithm: r.algorithms.digest,
      signatureAlgorithm: r.algorithms.signature,
    })),
  };
}

export async function exportSignatureReport(
  file: File,
  _options: ValidateSignaturePdfOptions,
  ctx: EngineContext
): Promise<File> {
  ctx.progress({ label: 'Analyzing signatures…' });
  const results = await analyzeSignatures(file);
  if (ctx.signal.aborted) throw new Error('Cancelled');

  const report = buildSignatureReport(file.name, results);
  const json = JSON.stringify(report, null, 2);

  return new File([json], `${baseName(file.name)}-signature-report.json`, {
    type: 'application/json',
  });
}
