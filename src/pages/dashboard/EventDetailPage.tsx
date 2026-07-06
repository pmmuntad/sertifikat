import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { APP_BASE_URL } from '@/lib/supabaseClient';
import type { Database } from '@/lib/database.types';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { formatCertificateNumber, CERTIFICATE_NUMBER_TOKENS } from '@/lib/certificateNumber';

type EventRow = Database['public']['Tables']['events']['Row'];

export function EventDetailPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingLock, setSavingLock] = useState(false);
  const [copied, setCopied] = useState(false);

  // State pengaturan Nomor Sertifikat (di-sync dari `event` setiap kali data
  // dimuat/berubah, lalu diedit lokal sebelum disimpan lewat tombol Simpan).
  const [numberEnabled, setNumberEnabled] = useState(true);
  const [numberFormat, setNumberFormat] = useState('{seq:4}/CERT/{year}');
  const [savingNumber, setSavingNumber] = useState(false);
  const [numberSaved, setNumberSaved] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    load();
  }, [eventId]);

  async function load() {
    if (!eventId) return;
    setLoading(true);
    const { data } = await supabase.from('events').select('*').eq('id', eventId).single();
    setEvent(data ?? null);
    if (data) {
      setNumberEnabled(data.certificate_number_enabled);
      setNumberFormat(data.certificate_number_format);
    }
    setLoading(false);
  }

  async function saveNumberSettings() {
    if (!event) return;
    setSavingNumber(true);
    const { data } = await supabase
      .from('events')
      .update({
        certificate_number_enabled: numberEnabled,
        certificate_number_format: numberFormat || '{seq:4}/CERT/{year}',
      })
      .eq('id', event.id)
      .select()
      .single();
    if (data) {
      setEvent(data);
      setNumberSaved(true);
      setTimeout(() => setNumberSaved(false), 2000);
    }
    setSavingNumber(false);
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

  async function copyLink() {
    if (!event) return;
    try {
      await navigator.clipboard.writeText(`${APP_BASE_URL}/attend/${event.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard tidak tersedia, abaikan
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6" aria-busy="true" aria-label="Memuat acara">
        <div className="h-7 w-1/3 animate-pulse rounded-lg bg-gray-200" />
        <div className="h-4 w-2/3 animate-pulse rounded-lg bg-gray-200" />
        <div className="h-24 w-full animate-pulse rounded-xl bg-gray-200" />
        <div className="h-24 w-full animate-pulse rounded-xl bg-gray-200" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-16 text-center text-gray-500">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" strokeLinecap="round" />
        </svg>
        <p>Acara tidak ditemukan.</p>
        <Link to="/dashboard">
          <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Kembali ke Daftar Acara
          </button>
        </Link>
      </div>
    );
  }

  const attendanceLink = `${APP_BASE_URL}/attend/${event.id}`;

  const menuItems = [
    {
      to: `/dashboard/events/${event.id}/form-builder`,
      label: 'Form Builder',
      desc: 'Susun pertanyaan absensi',
      icon: <path d="M4 6h16M4 12h10M4 18h7" strokeLinecap="round" />,
    },
    {
      to: `/dashboard/events/${event.id}/templates`,
      label: 'Template Sertifikat',
      desc: 'Desain sertifikat peserta',
      icon: <path d="M4 4h16v16H4z M8 16l2-2 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />,
    },
    {
      to: `/dashboard/events/${event.id}/committee`,
      label: 'Panitia & Jabatan',
      desc: 'Kelola tim penyelenggara',
      icon: <path d="M17 20a5 5 0 0 0-10 0 M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" strokeLinecap="round" strokeLinejoin="round" />,
    },
    ...(event.mode === 'live'
      ? [
          {
            to: `/dashboard/events/${event.id}/projector`,
            label: 'Tampilkan QR (Proyektor)',
            desc: 'Mode tampilan untuk layar besar',
            icon: <path d="M4 4h16v12H4z M8 20h8" strokeLinecap="round" strokeLinejoin="round" />,
          },
          {
            to: `/dashboard/events/${event.id}/monitor`,
            label: 'Monitor Real-Time',
            desc: 'Pantau kehadiran secara langsung',
            icon: <path d="M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0Z M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />,
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <button
        onClick={() => navigate('/dashboard')}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm transition hover:bg-gray-50"
      >
        <ArrowLeft className="h-4 w-4" /> Kembali ke Daftar Acara
      </button>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{event.name}</h2>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold sm:text-sm ${
              event.is_locked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${event.is_locked ? 'bg-red-600' : 'bg-green-600'}`} />
            {event.is_locked ? 'Terkunci' : 'Terbuka'}
          </span>
        </div>

        {event.mode === 'live' && (
          <button
            onClick={toggleLock}
            disabled={savingLock}
            className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${
              event.is_locked
                ? 'bg-indigo-600 hover:bg-indigo-700'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {savingLock ? 'Menyimpan...' : event.is_locked ? 'Buka Absensi' : 'Kunci Absensi Sekarang'}
          </button>
        )}
      </div>

      {event.description && <p className="text-sm text-gray-500 sm:text-base">{event.description}</p>}

      {/* Menu */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h3 className="mb-3 text-base font-semibold text-gray-900">Menu Pengelolaan</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {menuItems.map((item) => (
            <Link
              to={item.to}
              key={item.to}
              className="group flex items-start gap-3 rounded-xl border border-gray-200 p-3.5 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md active:translate-y-0"
            >
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  {item.icon}
                </svg>
              </span>
              <span className="flex min-w-0 flex-col">
                <strong className="text-sm font-semibold text-gray-900">{item.label}</strong>
                <small className="text-xs text-gray-500">{item.desc}</small>
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Excel mode attendance link */}
      {event.mode === 'excel' && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="mb-1 text-base font-semibold text-gray-900">Link Absensi Peserta</h3>
          <p className="mb-3 text-sm text-gray-500">
            Bagikan link ini ke peserta (tanpa QR dinamis, cocok untuk mode data pasti via Excel).
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-gray-100 px-3 py-2.5 text-xs text-gray-700 sm:text-sm">
              {attendanceLink}
            </code>
            <button
              onClick={copyLink}
              className="shrink-0 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 sm:w-auto"
            >
              {copied ? '✓ Disalin' : 'Salin'}
            </button>
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h3 className="mb-3 text-base font-semibold text-gray-900">Pengaturan Absensi Langsung</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Interval refresh QR</span>
            <span className="text-sm font-semibold text-gray-900">{event.qr_refresh_interval_seconds} detik</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Radius geofencing</span>
            <span className="text-sm font-semibold text-gray-900">{event.geofence_radius_meters} meter</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Status</span>
            <span className="text-sm font-semibold text-gray-900">
              {event.is_locked ? 'Terkunci (tidak menerima absen baru)' : 'Terbuka'}
            </span>
          </div>
        </div>
      </div>

      {/* Nomor Sertifikat */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h3 className="mb-1 text-base font-semibold text-gray-900">Nomor Sertifikat</h3>
        <p className="mb-4 text-sm text-gray-500">
          Sistem bisa menerbitkan nomor sertifikat otomatis dengan format yang Anda atur, atau
          dimatikan sepenuhnya kalau nomor surat sudah tercetak langsung di gambar template Anda.
        </p>

        <label className="mb-4 flex items-center gap-3">
          <input
            type="checkbox"
            checked={numberEnabled}
            onChange={(e) => setNumberEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
          />
          <span className="text-sm font-medium text-gray-800">
            Terbitkan nomor sertifikat otomatis
          </span>
        </label>

        {numberEnabled && (
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Format Nomor</label>
              <input
                value={numberFormat}
                onChange={(e) => setNumberFormat(e.target.value)}
                placeholder="{seq:4}/CERT/{year}"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 font-mono text-sm focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
              />
            </div>

            <div className="rounded-lg bg-gray-50 px-3 py-2.5">
              <span className="text-xs text-gray-500">Contoh hasil: </span>
              <span className="font-mono text-sm font-semibold text-indigo-700">
                {formatCertificateNumber(numberFormat || '{seq:4}/CERT/{year}', 7)}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {CERTIFICATE_NUMBER_TOKENS.map((t) => (
                <button
                  key={t.token}
                  type="button"
                  title={t.desc}
                  onClick={() => setNumberFormat((prev) => prev + t.token)}
                  className="rounded-md border border-gray-200 bg-white px-2 py-1 font-mono text-xs text-gray-600 transition hover:bg-gray-50"
                >
                  {t.token}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={saveNumberSettings}
          disabled={savingNumber}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {savingNumber && <Loader2 className="h-4 w-4 animate-spin" />}
          {savingNumber ? 'Menyimpan...' : numberSaved ? '✓ Tersimpan' : 'Simpan Pengaturan Nomor'}
        </button>
      </div>
    </div>
  );
}
