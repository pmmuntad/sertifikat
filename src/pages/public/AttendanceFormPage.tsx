import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { cleanWhatsAppNumber, isValidWhatsAppNumber } from '@/lib/whatsapp';
import { getCurrentPosition } from '@/lib/geolocation';
import { triggerDownload } from '@/lib/download';
import type { Database } from '@/lib/database.types';
import {
  Sparkles,
  Lock,
  AlertCircle,
  MapPin,
  Loader2,
  PartyPopper,
  Download,
  User,
  Phone,
  Mail,
} from 'lucide-react';

type EventRow = Database['public']['Tables']['events']['Row'];
type FieldRow = Database['public']['Tables']['event_form_fields']['Row'];

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

/**
 * Halaman publik yang dibuka peserta setelah scan QR di proyektor.
 * Didesain ringan (mobile-first) untuk kondisi sinyal apa pun di lokasi acara.
 *
 * Alur:
 *  1. Load definisi event & form fields (fixed + custom).
 *  2. Peserta isi form. Lokasi GPS diminta paralel saat form diisi (tidak blocking).
 *  3. Submit -> panggil Edge Function `submit-attendance` yang melakukan SEMUA
 *     validasi sensitif di server: token QR masih valid?, dalam radius geofence?,
 *     dalam jendela waktu?, belum submit ganda?, lalu generate certificate + trigger WA.
 *  4. Begitu URL PDF diterima, trigger download SEGERA di dalam handler klik yang
 *     sama (gesture-safe) supaya tidak diblokir browser (terutama iOS Safari).
 */
export function AttendanceFormPage() {
  const { eventId } = useParams();
  const [searchParams] = useSearchParams();
  const qrToken = searchParams.get('t');

  const [event, setEvent] = useState<EventRow | null>(null);
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [namaLengkap, setNamaLengkap] = useState('');
  const [noWa, setNoWa] = useState('');
  const [email, setEmail] = useState('');
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});

  const [waError, setWaError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [certificateUrl, setCertificateUrl] = useState<string | null>(null);
  const [locationHint, setLocationHint] = useState<string>('');

  useEffect(() => {
    if (!eventId) return;
    load();
    // Minta izin lokasi lebih awal (paralel, tidak menghalangi pengisian form).
    getCurrentPosition()
      .then(() => setLocationHint('Lokasi terdeteksi'))
      .catch((e) => setLocationHint((e as Error).message));
  }, [eventId]);

  async function load() {
    if (!eventId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [eventRes, fieldsRes] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).single(),
      supabase.from('event_form_fields').select('*').eq('event_id', eventId).order('sort_order'),
    ]);

    if (!eventRes.data) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setEvent(eventRes.data);
    setFields(fieldsRes.data ?? []);
    setLoading(false);
  }

  function updateAnswer(key: string, value: string | string[]) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function updateCheckbox(key: string, option: string, checked: boolean) {
    setAnswers((prev) => {
      const current = Array.isArray(prev[key]) ? (prev[key] as string[]) : [];
      const next = checked ? [...current, option] : current.filter((v) => v !== option);
      return { ...prev, [key]: next };
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!eventId) return;

    const cleanedWa = cleanWhatsAppNumber(noWa);
    if (!isValidWhatsAppNumber(cleanedWa)) {
      setWaError('Format No. WhatsApp tidak valid. Contoh: 081234567890');
      return;
    }
    setWaError(null);
    setSubmitState('submitting');
    setSubmitMessage(null);

    try {
      // Ambil lokasi terkini (bila gagal, tetap kirim tanpa lokasi — server yang
      // memutuskan apakah geofencing wajib gagal-total atau ditandai untuk review).
      let lat: number | null = null;
      let lng: number | null = null;
      try {
        const pos = await getCurrentPosition();
        lat = pos.lat;
        lng = pos.lng;
      } catch {
        // lanjut tanpa lokasi
      }

      // Upload file custom field (jika ada) ke storage sebelum submit jawaban.
      const uploadedFileMeta: Record<string, string> = {};
      for (const field of fields) {
        if (field.type === 'file' && files[field.key]) {
          const file = files[field.key]!;
          const path = `pending/${eventId}/${Date.now()}_${field.key}_${file.name}`;
          const { error: uploadErr } = await supabase.storage.from('submission-files').upload(path, file);
          if (!uploadErr) uploadedFileMeta[field.key] = path;
        }
      }

      const { data, error } = await supabase.functions.invoke('submit-attendance', {
        body: {
          event_id: eventId,
          qr_token: qrToken,
          nama_lengkap: namaLengkap,
          no_wa: cleanedWa,
          email: email || null,
          answers: { ...answers, ...uploadedFileMeta },
          lat,
          lng,
        },
      });

      if (error || !data?.success) {
        setSubmitState('error');
        setSubmitMessage(data?.message || error?.message || 'Gagal mengirim absensi. Silakan coba lagi.');
        return;
      }

      setSubmitState('success');
      setSubmitMessage('Absensi berhasil! Sertifikat Anda sedang disiapkan...');
      setCertificateUrl(data.certificate_url);

      // Trigger auto-download SEGERA (masih dalam rangkaian dari klik submit).
      if (data.certificate_url) {
        triggerDownload(data.certificate_url, `sertifikat-${data.certificate_number || 'anda'}.pdf`);
        setSubmitMessage('Absensi berhasil! Sertifikat sedang diunduh & juga dikirim ke WhatsApp Anda.');
      }
    } catch (err) {
      setSubmitState('error');
      setSubmitMessage((err as Error).message);
    }
  }

  // ============ Loading ============
  if (loading) {
    return (
      <PageShell>
        <div className="flex flex-col items-center gap-3 py-10">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
          <p className="text-sm text-gray-500">Memuat acara...</p>
        </div>
      </PageShell>
    );
  }

  // ============ Not found ============
  if (notFound || !event) {
    return (
      <PageShell>
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <AlertCircle className="h-7 w-7" />
          </span>
          <h2 className="text-lg font-bold text-gray-900">Acara tidak ditemukan</h2>
          <p className="text-sm text-gray-500">Tautan yang Anda buka mungkin sudah tidak berlaku.</p>
        </div>
      </PageShell>
    );
  }

  // ============ Locked ============
  if (event.is_locked) {
    return (
      <PageShell>
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-500">
            <Lock className="h-7 w-7" />
          </span>
          <h2 className="text-lg font-bold text-gray-900">Absensi Ditutup</h2>
          <p className="text-sm text-gray-500">Sesi absensi untuk acara ini sudah dikunci oleh penyelenggara.</p>
        </div>
      </PageShell>
    );
  }

  // ============ Success ============
  if (submitState === 'success') {
    return (
      <PageShell>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
            <PartyPopper className="h-8 w-8" />
          </span>
          <h2 className="text-xl font-bold text-gray-900">Absensi Berhasil</h2>
          <p className="text-sm leading-relaxed text-gray-600">{submitMessage}</p>
          {certificateUrl && (
            <a href={certificateUrl} target="_blank" rel="noopener noreferrer" className="mt-2 w-full">
              <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">
                <Download className="h-4 w-4" /> Buka / Unduh Ulang Sertifikat
              </button>
            </a>
          )}
        </div>
      </PageShell>
    );
  }

  // ============ Form ============
  const customFields = fields.filter((f) => !f.fixed);

  return (
    <PageShell>
      <div className="mb-5 text-center">
        <h2 className="text-lg font-bold text-gray-900 sm:text-xl">{event.name}</h2>
        <p className="mt-1 text-sm text-gray-500">Isi data berikut untuk absen &amp; ambil sertifikat.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FieldWrapper label="Nama Lengkap & Gelar" icon={<User className="h-4 w-4" />}>
          <input
            value={namaLengkap}
            onChange={(e) => setNamaLengkap(e.target.value)}
            required
            placeholder="Nama sesuai yang ingin tercetak di sertifikat"
            className="w-full rounded-xl border border-gray-300 px-3.5 py-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
          />
        </FieldWrapper>

        <FieldWrapper label="No. WhatsApp" icon={<Phone className="h-4 w-4" />}>
          <input
            value={noWa}
            onChange={(e) => setNoWa(e.target.value)}
            placeholder="08xxxxxxxxxx"
            required
            inputMode="numeric"
            className="w-full rounded-xl border border-gray-300 px-3.5 py-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
          />
          {waError && <p className="mt-1.5 text-xs text-red-600">{waError}</p>}
        </FieldWrapper>

        <FieldWrapper label="Email" optional icon={<Mail className="h-4 w-4" />}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3.5 py-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
          />
        </FieldWrapper>

        {customFields.map((field) => (
          <div key={field.id}>
            {field.type === 'text' && (
              <FieldWrapper label={field.label} optional={!field.required}>
                <input
                  required={field.required}
                  onChange={(e) => updateAnswer(field.key, e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3.5 py-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                />
              </FieldWrapper>
            )}
            {field.type === 'textarea' && (
              <FieldWrapper label={field.label} optional={!field.required}>
                <textarea
                  required={field.required}
                  rows={3}
                  onChange={(e) => updateAnswer(field.key, e.target.value)}
                  className="w-full resize-none rounded-xl border border-gray-300 px-3.5 py-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                />
              </FieldWrapper>
            )}
            {field.type === 'select' && (
              <FieldWrapper label={field.label} optional={!field.required}>
                <select
                  required={field.required}
                  onChange={(e) => updateAnswer(field.key, e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3.5 py-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                >
                  <option value="">— Pilih —</option>
                  {(field.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </FieldWrapper>
            )}
            {field.type === 'checkbox' && (
              <div className="mb-1">
                <p className="mb-2 text-sm font-medium text-gray-700">
                  {field.label} {!field.required && <span className="font-normal text-gray-400">(opsional)</span>}
                </p>
                <div className="space-y-2 rounded-xl border border-gray-200 p-3">
                  {(field.options ?? []).map((opt) => (
                    <label key={opt} className="flex items-center gap-2.5 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        onChange={(e) => updateCheckbox(field.key, opt, e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {field.type === 'file' && (
              <FieldWrapper label={field.label} optional={!field.required}>
                <input
                  type="file"
                  accept={(field.accept_file_types ?? []).join(',')}
                  required={field.required}
                  onChange={(e) => setFiles((prev) => ({ ...prev, [field.key]: e.target.files?.[0] ?? null }))}
                  className="block w-full rounded-xl border border-gray-300 bg-gray-50 p-2 text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700"
                />
              </FieldWrapper>
            )}
          </div>
        ))}

        {locationHint && (
          <p className="flex items-center gap-1.5 text-xs text-gray-400">
            <MapPin className="h-3.5 w-3.5" /> {locationHint}
          </p>
        )}

        {submitState === 'error' && (
          <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            {submitMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={submitState === 'submitting'}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:from-indigo-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.99]"
        >
          {submitState === 'submitting' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Memproses...
            </>
          ) : (
            'Hadir & Ambil Sertifikat'
          )}
        </button>
      </form>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-gray-50 px-4 py-8 sm:py-12">
      <div className="mb-5 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-purple-700">
          <Sparkles className="h-4 w-4 text-white" />
        </span>
        <span className="text-sm font-bold tracking-tight text-gray-700">SertifikatLive</span>
      </div>
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-5 shadow-xl shadow-gray-200/50 sm:p-7">
        {children}
      </div>
    </div>
  );
}

function FieldWrapper({
  label,
  children,
  optional,
  icon,
}: {
  label: string;
  children: React.ReactNode;
  optional?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
        {icon}
        {label} {optional && <span className="font-normal text-gray-400">(opsional)</span>}
      </label>
      {children}
    </div>
  );
}
