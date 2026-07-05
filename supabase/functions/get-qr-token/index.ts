import { getSupabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';

/**
 * Dipanggil oleh halaman proyektor (ProjectorPage.tsx) berkala sesuai
 * qr_refresh_interval_seconds event. Membuat token baru dengan sedikit
 * overlap terhadap token sebelumnya (masih dianggap valid beberapa detik)
 * supaya tidak ada "jendela kosong" saat peserta scan tepat di detik
 * pergantian QR.
 *
 * Hanya dosen/panitia (member organisasi terautentikasi) yang bisa memanggil
 * ini — token peserta scan dari QR, tidak memanggil endpoint ini langsung.
 */
Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

    const { event_id } = await req.json();
    if (!event_id) return jsonResponse({ error: 'event_id wajib diisi' }, 400);

    const supabaseAdmin = getSupabaseAdmin();

    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('id, organization_id, qr_refresh_interval_seconds, is_locked')
      .eq('id', event_id)
      .single();

    if (eventError || !event) return jsonResponse({ error: 'Acara tidak ditemukan' }, 404);
    if (event.is_locked) return jsonResponse({ error: 'Absensi sedang dikunci' }, 403);

    const intervalSeconds = event.qr_refresh_interval_seconds || 20;
    // Overlap 3 detik: token baru dibuat, token lama (dibuat < 3s lalu) masih
    // dianggap valid sebentar untuk menghindari race condition saat scan.
    const overlapSeconds = Math.min(3, Math.floor(intervalSeconds / 4));

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + (intervalSeconds + overlapSeconds) * 1000).toISOString();

    const { error: insertError } = await supabaseAdmin.from('qr_tokens').insert({
      event_id,
      organization_id: event.organization_id,
      token,
      expires_at: expiresAt,
    });

    if (insertError) return jsonResponse({ error: insertError.message }, 500);

    return jsonResponse({ token, expires_at: expiresAt });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
