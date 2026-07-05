import { getSupabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';
import { verifyHash } from '../_shared/verificationHash.ts';

/**
 * Endpoint publik (dituju QR di setiap sertifikat). Dilakukan di server
 * (bukan query langsung dari client dengan RLS anon) supaya:
 *  - Bisa validasi HMAC signature (mencegah brute-force ID sertifikat lain)
 *  - Bisa generate signed URL storage tanpa membuat bucket sertifikat public permanen
 */
Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const { certificate_id, sig } = await req.json();
    if (!certificate_id) {
      return jsonResponse({ valid: false, message: 'ID sertifikat tidak ada.' }, 400);
    }

    const secret = Deno.env.get('CERTIFICATE_VERIFICATION_SECRET') ?? 'change-me';
    const hashValid = await verifyHash(certificate_id, secret, sig ?? null);

    if (!hashValid) {
      return jsonResponse({ valid: false, message: 'Tanda tangan verifikasi tidak cocok.' }, 200);
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: certificate, error } = await supabaseAdmin
      .from('certificates')
      .select('*, events(name)')
      .eq('id', certificate_id)
      .single();

    if (error || !certificate) {
      return jsonResponse({ valid: false, message: 'Sertifikat tidak ditemukan.' }, 200);
    }

    const { data: signedUrlData } = await supabaseAdmin.storage
      .from('certificates')
      .createSignedUrl(certificate.file_path, 60 * 30); // 30 menit, cukup untuk sekali lihat/unduh

    let jabatan: string | null = null;
    if (certificate.committee_member_id) {
      const { data: committee } = await supabaseAdmin
        .from('committee_members')
        .select('jabatan')
        .eq('id', certificate.committee_member_id)
        .single();
      jabatan = committee?.jabatan ?? null;
    }

    return jsonResponse({
      valid: true,
      nama_lengkap: certificate.nama_lengkap,
      event_name: (certificate.events as unknown as { name: string })?.name,
      certificate_number: certificate.certificate_number,
      issued_at: certificate.issued_at,
      recipient_type: certificate.recipient_type,
      jabatan,
      file_url: signedUrlData?.signedUrl ?? null,
    });
  } catch (err) {
    return jsonResponse({ valid: false, message: (err as Error).message }, 500);
  }
});
