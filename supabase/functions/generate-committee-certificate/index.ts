import { getSupabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';
import { computeVerificationHash } from '../_shared/verificationHash.ts';
import { renderCertificatePdf } from '../_shared/certificatePdf.ts';
import { formatCertificateNumber } from '../_shared/certificateNumber.ts';

/**
 * Dipanggil dari dashboard dosen (tombol "Terbitkan Sertifikat" di halaman
 * Panitia & Jabatan) untuk generate sertifikat panitia — berbeda dari alur
 * peserta karena panitia diinput manual, bukan lewat form submission publik.
 * Mendukung placeholder [Jabatan] dan [TTD] sesuai template panitia yang dipilih.
 */
Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ success: false, message: 'Unauthorized' }, 401);

    const { committee_member_id, signature_id } = await req.json();
    if (!committee_member_id) {
      return jsonResponse({ success: false, message: 'committee_member_id wajib diisi' }, 400);
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: member, error: memberError } = await supabaseAdmin
      .from('committee_members')
      .select('*, events(name, organization_id, certificate_number_enabled, certificate_number_format)')
      .eq('id', committee_member_id)
      .single();

    if (memberError || !member) {
      return jsonResponse({ success: false, message: 'Data panitia tidak ditemukan.' }, 404);
    }
    if (!member.template_id) {
      return jsonResponse({ success: false, message: 'Panitia ini belum memilih template sertifikat.' }, 400);
    }

    const event = member.events as unknown as {
      name: string;
      organization_id: string;
      certificate_number_enabled: boolean;
      certificate_number_format: string;
    };

    const { data: template, error: templateError } = await supabaseAdmin
      .from('certificate_templates')
      .select('*')
      .eq('id', member.template_id)
      .single();

    if (templateError || !template) {
      return jsonResponse({ success: false, message: 'Template sertifikat tidak ditemukan.' }, 404);
    }

    const { data: templateFile, error: downloadError } = await supabaseAdmin.storage
      .from('certificate-templates')
      .download(template.file_path);

    if (downloadError || !templateFile) {
      return jsonResponse({ success: false, message: 'Gagal memuat file template.' }, 500);
    }

    let ttdBytes: Uint8Array | null = null;
    if (signature_id) {
      const { data: signature } = await supabaseAdmin.from('signatures').select('*').eq('id', signature_id).single();
      if (signature) {
        const { data: sigFile } = await supabaseAdmin.storage.from('signatures').download(signature.file_path);
        if (sigFile) ttdBytes = new Uint8Array(await sigFile.arrayBuffer());
      }
    }

    const certificateId = crypto.randomUUID();
    let certificateNumber: string;
    if (event.certificate_number_enabled) {
      const { data: seqResult } = await supabaseAdmin.rpc('next_certificate_sequence', {
        p_event_id: member.event_id,
      });
      certificateNumber = formatCertificateNumber(event.certificate_number_format, seqResult as number);
    } else {
      certificateNumber = `NONUM-${certificateId}`;
    }
    const appBaseUrl = Deno.env.get('APP_BASE_URL') ?? 'https://your-app.vercel.app';
    const verificationSecret = Deno.env.get('CERTIFICATE_VERIFICATION_SECRET') ?? 'change-me';
    const sig = await computeVerificationHash(certificateId, verificationSecret);
    const verificationUrl = `${appBaseUrl}/verify/${certificateId}?sig=${sig}`;

    const templateBytes = new Uint8Array(await templateFile.arrayBuffer());
    const isPng = template.file_path.toLowerCase().endsWith('.png');

    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await renderCertificatePdf({
        templateImageBytes: templateBytes,
        templateImageType: isPng ? 'png' : 'jpg',
        placeholders: template.placeholders as Record<string, { x: number; y: number; fontSize?: number; width?: number; color?: string; enabled?: boolean; align?: 'left' | 'center' | 'right' }>,
        values: {
          nama: member.nama_lengkap,
          jabatan: member.jabatan,
          no_sertifikat: event.certificate_number_enabled ? certificateNumber : undefined,
          qr_verifikasi_url: verificationUrl,
          ttd_image_bytes: ttdBytes,
        },
        pageWidth: template.page_width ?? 1000,
        pageHeight: template.page_height ?? 700,
      });
    } catch (renderErr) {
      console.error('Gagal render PDF sertifikat panitia', committee_member_id, ':', renderErr);
      return jsonResponse({
        success: false,
        message: 'Gagal membuat file PDF sertifikat. Kemungkinan template rusak atau ada karakter tidak didukung pada data panitia.',
      }, 500);
    }

    const filePath = `${event.organization_id}/${member.event_id}/${certificateId}.pdf`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('certificates')
      .upload(filePath, pdfBytes, { contentType: 'application/pdf' });

    if (uploadError) {
      return jsonResponse({ success: false, message: 'Gagal mengunggah file sertifikat.' }, 500);
    }

    const { data: certificate, error: certInsertError } = await supabaseAdmin
      .from('certificates')
      .insert({
        id: certificateId,
        event_id: member.event_id,
        organization_id: event.organization_id,
        committee_member_id: member.id,
        template_id: template.id,
        recipient_type: 'panitia',
        nama_lengkap: member.nama_lengkap,
        no_wa: member.no_wa,
        certificate_number: certificateNumber,
        verification_hash: sig,
        file_path: filePath,
      })
      .select()
      .single();

    if (certInsertError) {
      return jsonResponse({ success: false, message: certInsertError.message }, 500);
    }

    // Kirim WA otomatis (best-effort) jika panitia punya no_wa & event punya session WA.
    if (member.no_wa) {
      try {
        await supabaseAdmin.functions.invoke('send-certificate-wa', { body: { certificate_id: certificate.id } });
      } catch {
        // diamkan, bisa dikirim ulang manual dari dashboard
      }
    }

    const { data: signedUrlData } = await supabaseAdmin.storage
      .from('certificates')
      .createSignedUrl(filePath, 60 * 60 * 24 * 7);

    return jsonResponse({
      success: true,
      certificate_number: event.certificate_number_enabled ? certificateNumber : null,
      certificate_url: signedUrlData?.signedUrl ?? null,
    });
  } catch (err) {
    return jsonResponse({ success: false, message: (err as Error).message }, 500);
  }
});
