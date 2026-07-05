import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import type { Database } from '@/lib/database.types';
import { Plus, Lock, QrCode, FileSpreadsheet, Loader2, CalendarX2, AlertCircle } from 'lucide-react';

type EventRow = Database['public']['Tables']['events']['Row'];

export function EventListPage() {
  const { organization } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!organization) return;
    let active = true;

    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('organization_id', organization.id)
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
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Daftar Acara</h2>
          <p className="mt-1 text-sm text-gray-500">Kelola acara, absensi, dan sertifikat lembaga Anda.</p>
        </div>
        <Link
          to="/dashboard/events/new"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Buat Acara Baru
        </Link>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          {errorMsg}
        </div>
      )}

      {loading && (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      )}

      {!loading && events.length === 0 && !errorMsg && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 text-indigo-500">
            <CalendarX2 className="h-7 w-7" />
          </span>
          <h3 className="text-base font-semibold text-gray-900">Belum ada acara</h3>
          <p className="max-w-xs text-sm text-gray-500">
            Mulai buat acara pertama Anda untuk mengelola absensi dan menerbitkan sertifikat.
          </p>
          <Link
            to="/dashboard/events/new"
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" /> Buat Acara Baru
          </Link>
        </div>
      )}

      {!loading && events.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <Link
              to={`/dashboard/events/${event.id}`}
              key={event.id}
              className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-semibold text-gray-900 group-hover:text-indigo-700">
                  {event.name}
                </h3>
                {event.is_locked && (
                  <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                    <Lock className="h-3 w-3" /> Terkunci
                  </span>
                )}
              </div>

              {event.description && (
                <p className="mt-1.5 line-clamp-2 text-sm text-gray-500">{event.description}</p>
              )}

              <div className="mt-4 flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                    event.mode === 'live'
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {event.mode === 'live' ? (
                    <>
                      <QrCode className="h-3.5 w-3.5" /> Absensi Langsung
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="h-3.5 w-3.5" /> Upload Excel
                    </>
                  )}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
