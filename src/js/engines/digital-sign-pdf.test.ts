import { describe, it, expect, vi } from 'vitest';

const fakeCertificate = {
  subject: { getField: (): undefined => undefined },
};

vi.mock('../logic/digital-sign-pdf.js', () => ({
  parsePfxFile: vi.fn((_bytes: ArrayBuffer, password: string) => {
    if (password !== 'correct') {
      throw new Error('PKCS#12 MAC could not be verified. Invalid password?');
    }
    return { p12Buffer: _bytes, password, certificate: fakeCertificate };
  }),
  signPdf: vi.fn(async (bytes: Uint8Array) => bytes),
  getCertificateInfo: vi.fn(() => ({
    subject: 'Ada Lovelace',
    issuer: 'Test CA',
    validFrom: new Date(0),
    validTo: new Date(0),
    serialNumber: '1',
  })),
}));

const { digitalSignPdf } = await import('./digital-sign-pdf.js');
const { signPdf } =
  (await import('../logic/digital-sign-pdf.js')) as unknown as {
    signPdf: ReturnType<typeof vi.fn>;
  };

function pdfFile(name = 'doc.pdf'): File {
  return new File([new Uint8Array([1, 2, 3])], name, {
    type: 'application/pdf',
  });
}
function certFile(): File {
  return new File([new Uint8Array([4, 5, 6])], 'cert.p12', {
    type: 'application/x-pkcs12',
  });
}

const ctx = () => ({ signal: new AbortController().signal, progress: vi.fn() });

describe('digitalSignPdf engine', () => {
  it('requires a certificate file', async () => {
    await expect(
      digitalSignPdf([pdfFile()], { password: 'x' }, ctx())
    ).rejects.toThrow('certificate');
  });

  it('requires a password', async () => {
    await expect(
      digitalSignPdf([pdfFile(), certFile()], { password: '' }, ctx())
    ).rejects.toThrow('password');
  });

  it('gives a friendly message on a wrong certificate password', async () => {
    await expect(
      digitalSignPdf([pdfFile(), certFile()], { password: 'wrong' }, ctx())
    ).rejects.toThrow('Incorrect certificate password');
  });

  it('signs and names the output with a -signed suffix', async () => {
    const result = await digitalSignPdf(
      [pdfFile('report.pdf'), certFile()],
      { password: 'correct', reason: 'Approval' },
      ctx()
    );
    expect(result.name).toBe('report-signed.pdf');
    expect(result.type).toBe('application/pdf');
    expect(signPdf).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({ password: 'correct' }),
      expect.objectContaining({
        signatureInfo: { reason: 'Approval' },
      })
    );
  });

  it('builds a default visible-signature text from the certificate subject', async () => {
    await digitalSignPdf(
      [pdfFile(), certFile()],
      {
        password: 'correct',
        visibleSignature: { enabled: true },
      },
      ctx()
    );
    const lastCall = signPdf.mock.calls[signPdf.mock.calls.length - 1];
    expect(lastCall[2].visibleSignature.text).toContain('Ada Lovelace');
    expect(lastCall[2].visibleSignature.x).toBe(25);
    expect(lastCall[2].visibleSignature.y).toBe(700);
  });

  it('rejects when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      digitalSignPdf(
        [pdfFile(), certFile()],
        { password: 'correct' },
        { signal: controller.signal, progress: vi.fn() }
      )
    ).rejects.toThrow('Cancelled');
  });
});
