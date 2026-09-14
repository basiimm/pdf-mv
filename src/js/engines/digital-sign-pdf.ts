// Pure engine for the digital-sign-pdf tool. See docs/TOOL-MIGRATION-GUIDE.md.
import {
  signPdf,
  parsePfxFile,
  getCertificateInfo,
} from '../logic/digital-sign-pdf.js';
import type { SignatureInfo, VisibleSignatureOptions } from '@/types';

export interface DigitalSignVisibleOptions {
  enabled: boolean;
  page?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
}

export interface DigitalSignPdfOptions {
  password: string;
  reason?: string;
  location?: string;
  contactInfo?: string;
  visibleSignature?: DigitalSignVisibleOptions;
}

export interface EngineContext {
  signal: AbortSignal;
  progress(update: { label: string; value?: number; detail?: string }): void;
}

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

export async function digitalSignPdf(
  files: File[],
  options: DigitalSignPdfOptions,
  ctx: EngineContext
): Promise<File> {
  const [pdfFile, certFile] = files;
  if (!pdfFile) {
    throw new Error('Choose a PDF to sign.');
  }
  if (!certFile) {
    throw new Error('Choose a certificate (.p12 or .pfx) to sign with.');
  }
  if (!options.password) {
    throw new Error('Enter the certificate password.');
  }
  if (ctx.signal.aborted) throw new Error('Cancelled');

  ctx.progress({ label: 'Reading certificate…' });
  const certBytes = await certFile.arrayBuffer();

  let certData;
  try {
    certData = parsePfxFile(certBytes, options.password);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/password/i.test(message)) {
      throw new Error(
        'Incorrect certificate password. Check the password and try again.',
        { cause: error }
      );
    }
    throw new Error('Invalid certificate. Choose a valid .p12 or .pfx file.', {
      cause: error,
    });
  }

  if (ctx.signal.aborted) throw new Error('Cancelled');

  const signatureInfo: SignatureInfo = {};
  if (options.reason?.trim()) signatureInfo.reason = options.reason.trim();
  if (options.location?.trim())
    signatureInfo.location = options.location.trim();
  if (options.contactInfo?.trim())
    signatureInfo.contactInfo = options.contactInfo.trim();

  let visibleSignature: VisibleSignatureOptions | undefined;
  if (options.visibleSignature?.enabled) {
    const vs = options.visibleSignature;
    const text =
      vs.text?.trim() ||
      `Digitally signed by ${getCertificateInfo(certData.certificate).subject}`;
    visibleSignature = {
      enabled: true,
      page: vs.page ?? 0,
      x: vs.x ?? 25,
      y: vs.y ?? 700,
      width: vs.width ?? 150,
      height: vs.height ?? 70,
      text,
    };
  }

  ctx.progress({ label: 'Signing PDF…' });
  const pdfBytes = new Uint8Array(await pdfFile.arrayBuffer());

  let signedBytes: Uint8Array;
  try {
    signedBytes = await signPdf(pdfBytes, certData, {
      signatureInfo,
      visibleSignature,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Signing failed: ${message}`, { cause: error });
  }

  if (ctx.signal.aborted) throw new Error('Cancelled');

  return new File(
    [new Uint8Array(signedBytes)],
    `${baseName(pdfFile.name)}-signed.pdf`,
    { type: 'application/pdf' }
  );
}
