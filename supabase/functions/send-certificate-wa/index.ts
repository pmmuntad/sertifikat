import { getSupabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';
import { renderTemplate, sendWhatsAppMessage } from '../_shared/whatsapp.ts';

/**
 * Dipanggil setelah sertifikat berhasil dibuat (dari submit-attendance, atau
 * dipanggil manual/ulang dari dashboard dosen untuk kasus panitia).
 * Mengambil session WA organisasi terkait event, merender template pesan,
 * lalu mengirim lewat gateway WA custom. API key gateway HANYA disimpan
 * sebagai Supabase secret di sisi server — tidak pernah dikirim ke client.
 */
Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const { certificate_id } = await req.json();
    if (!certificate_id) return jsonResponse({ success: false, message: 'certificate_id wajib diisi' }, 400);

    const supabaseAdmin = getSupabaseAdmin();

    const { data: certificate, error: certError } = await supabaseAdmin
      .from('certificates')
      .select('*, events(name, wa_session_id, wa_message_template)')
      .eq('id', certificate_id)
      .single();

    if (certError || !certificate) {
      return jsonResponse({ success: false, message: 'Sertifikat tidak ditemukan.' }, 404);
    }

    if (!certificate.no_wa) {
      return jsonResponse({ success: false, message: 'Tidak ada No. WA untuk penerima ini.' }, 400);
    }

    const event = certificate.events as unknown as {
      name: string;
      wa_session_id: string | null;
      wa_message_template: string;
    };

    if (!event.wa_session_id) {
      await supabaseAdmin
        .from('certificates')
        .update({ wa_delivery_status: 'failed', wa_error_message: 'Belum ada session WA yang dipilih untuk acara ini.' })
        .eq('id', certificate_id);
      return jsonResponse({ success: false, message: 'Session WA belum diatur untuk acara ini.' }, 400);
    }

    const { data: waSession } = await supabaseAdmin
      .from('whatsapp_sessions')
      .select('*')
      .eq('id', event.wa_session_id)
      .single();

    if (!waSession) {
      await supabaseAdmin
        .from('certificates')
        .update({ wa_delivery_status: 'failed', wa_error_message: 'Session WA tidak ditemukan.' })
        .eq('id', certificate_id);
      return jsonResponse({ success: false, message: 'Session WA tidak ditemukan.' }, 404);
    }

    const { data: signedUrlData } = await supabaseAdmin.storage
      .from('certificates')
      .createSignedUrl(certificate.file_path, 60 * 60 * 24 * 7);

    const appBaseUrl = Deno.env.get('APP_BASE_URL') ?? 'https://your-app.vercel.app';
    const verificationLink = `${appBaseUrl}/verify/${certificate.id}?sig=${certificate.verification_hash}`;

    const message = renderTemplate(event.wa_message_template, {
      nama: certificate.nama_lengkap,
      event_name: event.name,
      no_sertifikat: certificate.certificate_number,
      link_sertifikat: verificationLink,
    });

    const gatewayBaseUrl = Deno.env.get('WA_GATEWAY_BASE_URL') ?? 'https://whatsapp.venusverse.me';
    const apiKey = Deno.env.get('WA_API_KEY') ?? '';

    if (!apiKey) {
      await supabaseAdmin
        .from('certificates')
        .update({ wa_delivery_status: 'failed', wa_error_message: 'WA_API_KEY belum dikonfigurasi di server.' })
        .eq('id', certificate_id);
      return jsonResponse({ success: false, message: 'Konfigurasi WA_API_KEY belum diset di Supabase secrets.' }, 500);
    }

    const result = await sendWhatsAppMessage({
      gatewayBaseUrl,
      apiKey,
      sessionId: waSession.session_id,
      to: certificate.no_wa,
      message,
      media: signedUrlData?.signedUrl
        ? [{ url: signedUrlData.signedUrl, filename: `sertifikat-${certificate.certificate_number}.pdf` }]
        : [],
    });

    if (result.ok) {
      await supabaseAdmin
        .from('certificates')
        .update({ wa_delivery_status: 'sent', wa_sent_at: new Date().toISOString(), wa_error_message: null })
        .eq('id', certificate_id);

      return jsonResponse({ success: true });
    } else {
      await supabaseAdmin
        .from('certificates')
        .update({ wa_delivery_status: 'failed', wa_error_message: result.error })
        .eq('id', certificate_id);
      return jsonResponse({ success: false, message: result.error }, 502);
    }
  } catch (err) {
    return jsonResponse({ success: false, message: (err as Error).message }, 500);
  }
});
