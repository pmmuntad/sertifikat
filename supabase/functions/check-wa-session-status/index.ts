import { getSupabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';

/**
 * Cek status koneksi session WA lewat gateway (dipanggil dari dashboard dosen,
 * WhatsAppSessionsPage.tsx). Endpoint gateway aktual bisa berbeda tergantung
 * provider — sesuaikan path `/api/session/{id}/status` bila gateway Anda
 * menyediakan endpoint status yang berbeda.
 */
Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

    const { whatsapp_session_row_id } = await req.json();
    if (!whatsapp_session_row_id) return jsonResponse({ error: 'whatsapp_session_row_id wajib diisi' }, 400);

    const supabaseAdmin = getSupabaseAdmin();
    const { data: session, error } = await supabaseAdmin
      .from('whatsapp_sessions')
      .select('*')
      .eq('id', whatsapp_session_row_id)
      .single();

    if (error || !session) return jsonResponse({ error: 'Session tidak ditemukan' }, 404);

    const gatewayBaseUrl = Deno.env.get('WA_GATEWAY_BASE_URL') ?? 'https://whatsapp.venusverse.me';
    const apiKey = Deno.env.get('WA_API_KEY') ?? '';

    let status = 'unknown';
    try {
      const res = await fetch(`${gatewayBaseUrl}/api/session/${session.session_id}/status`, {
        headers: { 'x-api-key': apiKey },
      });
      if (res.ok) {
        const body = await res.json();
        status = body?.status ?? 'connected';
      } else {
        status = 'disconnected';
      }
    } catch {
      status = 'disconnected';
    }

    await supabaseAdmin
      .from('whatsapp_sessions')
      .update({ status, last_checked_at: new Date().toISOString() })
      .eq('id', whatsapp_session_row_id);

    return jsonResponse({ status });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
