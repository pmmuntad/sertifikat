import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import type { Database } from '@/lib/database.types';

type SessionRow = Database['public']['Tables']['whatsapp_sessions']['Row'];

export function WhatsAppSessionsPage() {
  const { organization } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!organization) return;
    load();
  }, [organization]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('organization_id', organization!.id)
      .order('created_at', { ascending: false });
    setSessions(data ?? []);
    setLoading(false);
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!organization) return;
    setErrorMsg(null);

    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .insert({ organization_id: organization.id, session_id: sessionId, label })
      .select()
      .single();

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setSessions((prev) => [data, ...prev]);
    setLabel('');
    setSessionId('');
  }

  async function checkStatus(session: SessionRow) {
    // Cek status koneksi session lewat Edge Function (server yang panggil gateway WA,
    // supaya API key gateway tidak pernah terekspos ke browser).
    const { data, error } = await supabase.functions.invoke('check-wa-session-status', {
      body: { whatsapp_session_row_id: session.id },
    });
    if (!error && data) {
      setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, status: data.status } : s)));
    }
  }

  async function removeSession(id: string) {
    await supabase.from('whatsapp_sessions').delete().eq('id', id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  if (loading) return <p>Memuat...</p>;

  return (
    <div>
      <h2>Session WhatsApp Lembaga</h2>
      <p style={{ color: 'var(--text-muted)' }}>
        Session ini dipakai untuk mengirim sertifikat otomatis via WhatsApp. Setiap acara bisa
        memilih salah satu session yang sudah didaftarkan di sini.
      </p>

      <div className="card">
        <h3>Tambah Session Baru</h3>
        <form onSubmit={handleAdd}>
          <label>
            Label (nama gampang diingat)
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="WA Panitia Utama" required />
          </label>
          <label>
            Session ID (dari gateway WhatsApp Anda)
            <input value={sessionId} onChange={(e) => setSessionId(e.target.value)} required />
          </label>
          {errorMsg && <p className="form-error">{errorMsg}</p>}
          <button type="submit">+ Tambah Session</button>
        </form>
      </div>

      <div className="card">
        <h3>Daftar Session</h3>
        <table>
          <thead>
            <tr>
              <th>Label</th>
              <th>Session ID</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>{s.label}</td>
                <td><code>{s.session_id}</code></td>
                <td>{s.status}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="secondary" onClick={() => checkStatus(s)}>Cek Status</button>
                  <button className="danger" onClick={() => removeSession(s.id)}>Hapus</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
