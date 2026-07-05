import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { APP_BASE_URL } from '@/lib/supabaseClient';
import type { Database } from '@/lib/database.types';

type EventRow = Database['public']['Tables']['events']['Row'];

export function EventDetailPage() {
  const { eventId } = useParams();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingLock, setSavingLock] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    load();
  }, [eventId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('events').select('*').eq('id', eventId).single();
    setEvent(data ?? null);
    setLoading(false);
  }

  async function toggleLock() {
    if (!event) return;
    setSavingLock(true);
    const { data } = await supabase
      .from('events')
      .update({ is_locked: !event.is_locked })
      .eq('id', event.id)
      .select()
      .single();
    if (data) setEvent(data);
    setSavingLock(false);
  }

  if (loading) return <p>Memuat...</p>;
  if (!event) return <p>Acara tidak ditemukan.</p>;

  const attendanceLink = `${APP_BASE_URL}/attend/${event.id}`;

  return (
    <div>
      <div className="card-header">
        <h2>{event.name}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {event.mode === 'live' && (
            <button className={event.is_locked ? '' : 'danger'} onClick={toggleLock} disabled={savingLock}>
              {event.is_locked ? 'Buka Absensi' : 'Kunci Absensi Sekarang'}
            </button>
          )}
        </div>
      </div>

      {event.description && <p style={{ color: 'var(--text-muted)' }}>{event.description}</p>}

      <div className="card">
        <h3>Menu Pengelolaan</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link to={`/dashboard/events/${event.id}/form-builder`}><button className="secondary">Form Builder</button></Link>
          <Link to={`/dashboard/events/${event.id}/templates`}><button className="secondary">Template Sertifikat</button></Link>
          <Link to={`/dashboard/events/${event.id}/committee`}><button className="secondary">Panitia & Jabatan</button></Link>
          {event.mode === 'live' && (
            <>
              <Link to={`/dashboard/events/${event.id}/projector`}><button className="secondary">Tampilkan QR (Proyektor)</button></Link>
              <Link to={`/dashboard/events/${event.id}/monitor`}><button className="secondary">Monitor Real-Time</button></Link>
            </>
          )}
        </div>
      </div>

      {event.mode === 'excel' && (
        <div className="card">
          <h3>Link Absensi Peserta</h3>
          <p style={{ color: 'var(--text-muted)' }}>
            Bagikan link ini ke peserta (tanpa QR dinamis, cocok untuk mode data pasti via Excel).
          </p>
          <code>{attendanceLink}</code>
        </div>
      )}

      <div className="card">
        <h3>Pengaturan Absensi Langsung</h3>
        <p>Interval refresh QR: <strong>{event.qr_refresh_interval_seconds} detik</strong></p>
        <p>Radius geofencing: <strong>{event.geofence_radius_meters} meter</strong></p>
        <p>Status: <strong>{event.is_locked ? 'Terkunci (tidak menerima absen baru)' : 'Terbuka'}</strong></p>
      </div>
    </div>
  );
}
