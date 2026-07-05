import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

/**
 * Client dengan SERVICE ROLE KEY — bypass RLS. HANYA dipakai di dalam Edge
 * Function (server), TIDAK PERNAH diekspos ke frontend/browser.
 * Semua keputusan sensitif (geofencing, dedup, quota, generate sertifikat)
 * harus lewat client ini setelah divalidasi manual di kode function.
 */
export function getSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
