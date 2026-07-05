import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { buildWhatsAppLink } from '@/lib/whatsapp';
import { renderTemplate } from '@/lib/templateRenderer';
import type { Database } from '@/lib/database.types';

type CertificateRow = Database['public']['Tables']['certificates']['Row'];
type EventRow = Database['public']['Tables']['events']['Row'];

/**
 * Dashboard real-time dosen: memantau sertifikat yang terbit & status kirim WA
 * menggunakan Supabase Realtime (subscribe ke perubahan tabel `certificates`).
 */
export function LiveMonitorPage() {
  const { eventId } = useParams();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [certificates, setCertificates] = useState<CertificateRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!eventId) return;
    load();

    const channel = supabase
      .channel(`certificates-${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'certificates', filter: `event_id=eq.${eventId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setCertificates((prev) => [payload.new as CertificateRow, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setCertificates((prev) =>
              prev.map((c) => (c.id === payload.new.id ? (payload.new as CertificateRow) : c))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  async function load() {
    setLoading(true);
    const [eventRes, certsRes] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).single(),
      supabase.from('certificates').select('*').eq('event_id', eventId).order('issued_at', { ascending: false }),
    ]);
    setEvent(eventRes.data ?? null);
    setCertificates(certsRes.data ?? []);
    setLoading(false);
  }

  async function markManualRetry(certificateId: string) {
    await supabase.rpc('increment_manual_retry', { p_certificate_id: certificateId });
  }

  if (loading) return <p>Memuat...</p>;

  const totalHadir = certificates.length;
  const totalTerkirim = certificates.filter((c) => c.wa_delivery_status === 'sent').length;
  const totalGagal = certificates.filter((c) => c.wa_delivery_status === 'failed').length;

  return (
    <div>
      <h2>Monitor Real-Time — {event?.name}</h2>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{totalHadir}</div>
          <div>Hadir &amp; Sertifikat Terbit</div>
        </div>
        <div className="card" style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success)' }}>{totalTerkirim}</div>
          <div>WA Terkirim</div>
        </div>
        <div className="card" style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--danger)' }}>{totalGagal}</div>
          <div>WA Gagal</div>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>No. Sertifikat</th>
              <th>Status WA</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {certificates.map((cert) => {
              const link = `${(import.meta.env.VITE_APP_BASE_URL as string) || window.location.origin}/verify/${cert.id}`;
              const message = renderTemplate(event?.wa_message_template ?? '', {
                nama: cert.nama_lengkap,
                event_name: event?.name,
                no_sertifikat: cert.certificate_number,
                link_sertifikat: link,
              });

              return (
                <tr key={cert.id}>
                  <td>{cert.nama_lengkap}</td>
                  <td>{cert.certificate_number}</td>
                  <td>
                    <span className={'status-badge status-' + cert.wa_delivery_status}>
                      {cert.wa_delivery_status === 'sent' && 'Terkirim'}
                      {cert.wa_delivery_status === 'failed' && 'Gagal'}
                      {cert.wa_delivery_status === 'pending' && 'Menunggu'}
                    </span>
                  </td>
                  <td>
                    {cert.no_wa && (
                      <a
                        href={buildWhatsAppLink(cert.no_wa, message)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => markManualRetry(cert.id)}
                      >
                        <button className="secondary">
                          {cert.wa_delivery_status === 'failed' ? '🔁 Kirim Ulang' : '💬 Kirim Manual'}
                        </button>
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
