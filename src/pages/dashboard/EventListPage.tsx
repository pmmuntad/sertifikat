import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import type { Database } from '@/lib/database.types';

type EventRow = Database['public']['Tables']['events']['Row'];

export function EventListPage() {
  const { organization } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!organization) return;
    const organizationId = organization.id;
    let active = true;

    async function load() {
      setLoading(true);
      // RLS otomatis membatasi ke organization_id milik user, filter di sini
      // ditambahkan juga untuk kejelasan & mengurangi round-trip data.
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (!active) return;
      if (error) {
        setErrorMsg(error.message);
      } else {
        setEvents(data ?? []);
      }
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [organization]);

  return (
    <div>
      <div className="card-header">
        <h2>Daftar Acara</h2>
        <Link to="/dashboard/events/new">
          <button>+ Buat Acara Baru</button>
        </Link>
      </div>

      {errorMsg && <p className="form-error">{errorMsg}</p>}
      {loading && <p>Memuat...</p>}

      {!loading && events.length === 0 && (
        <div className="card">
          <p>Belum ada acara. Klik "Buat Acara Baru" untuk mulai.</p>
        </div>
      )}

      {events.map((event) => (
        <div className="card" key={event.id}>
          <div className="card-header">
            <div>
              <h3 style={{ margin: 0 }}>{event.name}</h3>
              <span className="tag">{event.mode === 'live' ? 'Absensi Langsung (QR)' : 'Upload Excel'}</span>
              {event.is_locked && <span className="tag" style={{ marginLeft: 6 }}>Terkunci</span>}
            </div>
            <Link to={`/dashboard/events/${event.id}`}>
              <button className="secondary">Kelola</button>
            </Link>
          </div>
          {event.description && <p style={{ color: 'var(--text-muted)' }}>{event.description}</p>}
        </div>
      ))}
    </div>
  );
}
