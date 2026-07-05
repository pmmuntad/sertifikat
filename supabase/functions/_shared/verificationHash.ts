/**
 * HMAC untuk link verifikasi sertifikat. Mencegah orang menebak-nebak nomor
 * sertifikat lain (mis. ubah CERT-2026-00123 -> 00124) dan melihat data
 * peserta lain lewat brute-force URL /verify/:id.
 */
export async function computeVerificationHash(certificateId: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(certificateId));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyHash(certificateId: string, secret: string, providedSig: string | null): Promise<boolean> {
  if (!providedSig) return false;
  const expected = await computeVerificationHash(certificateId, secret);
  return expected === providedSig;
}
