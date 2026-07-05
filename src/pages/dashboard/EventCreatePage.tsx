import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import { DEFAULT_WA_MESSAGE_TEMPLATE } from '@/lib/templateRenderer';
import { FIXED_FIELDS } from '@/lib/formTypes';
import { ArrowLeft, Loader2, QrCode, FileSpreadsheet, AlertCircle } from 'lucide-react';

export function EventCreatePage() {
  const { organization, user } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'excel' | 'live'>('live');
  const [qrInterval, setQrInterval] = useState(20);
  const [radius, setRadius] = useState(75);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!organization || !user) return;
    setSubmitting(true);
    setErrorMsg(null);

    const { data, error } = await supabase
      .from('events')
      .insert({
        organization_id: organization.id,
        name,
        description: description || null,
        mode,
        qr_refresh_interval_seconds: qrInterval,
        geofence_radius_meters: radius,
        wa_message_template: DEFAULT_WA_MESSAGE_TEMPLATE,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      setErrorMsg(
        error.message.includes('max_events')
          ? 'Kuota jumlah acara pada paket lembaga Anda sudah tercapai.'
          : error.message
      );
      setSubmitting(false);
      return;
    }

    // Insert field wajib default (Nama, No. WA, Email) ke event baru.
    await supabase.from('event_form_fields').insert(
      FIXED_FIELDS.map((f) => ({
        event_id: data.id,
        organization_id: organization.id,
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        fixed: f.fixed,
        sort_order: f.sort_order,
      }))
    );

    navigate(`/dashboard/events/${data.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm transition hover:bg-gray-50"
      >
        <ArrowLeft className="h-4 w-4" /> Kembali
      </button>

      <div>
        <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Buat Acara Baru</h2>
        <p className="mt-1 text-sm text-gray-500">
          Isi detail acara Anda, lalu lanjutkan mengatur form dan template sertifikat setelah acara dibuat.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Nama Acara</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Contoh: Seminar Nasional Teknologi 2026"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Deskripsi <span className="font-normal text-gray-400">(opsional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Deskripsi singkat acara Anda"
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Mode Pendaftaran</label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode('live')}
              className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
                mode === 'live'
                  ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                  mode === 'live' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                <QrCode className="h-[18px] w-[18px]" />
              </span>
              <span>
                <p className="text-sm font-semibold text-gray-900">Absensi Langsung</p>
                <p className="text-xs text-gray-500">Scan QR di lokasi, tanpa Excel</p>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMode('excel')}
              className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
                mode === 'excel'
                  ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                  mode === 'excel' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                <FileSpreadsheet className="h-[18px] w-[18px]" />
              </span>
              <span>
                <p className="text-sm font-semibold text-gray-900">Upload Excel</p>
                <p className="text-xs text-gray-500">Data peserta sudah pasti</p>
              </span>
            </button>
          </div>
        </div>

        {mode === 'live' && (
          <div className="grid grid-cols-1 gap-4 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Interval Refresh QR (detik)</label>
              <input
                type="number"
                min={5}
                max={300}
                value={qrInterval}
                onChange={(e) => setQrInterval(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Radius Geofencing (meter)</label>
              <input
                type="number"
                min={10}
                max={1000}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
              />
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            {errorMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Menyimpan...
            </>
          ) : (
            'Buat Acara'
          )}
        </button>
      </form>
    </div>
  );
}
