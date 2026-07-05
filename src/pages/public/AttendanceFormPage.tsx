import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { cleanWhatsAppNumber, isValidWhatsAppNumber } from '@/lib/whatsapp';
import { getCurrentPosition } from '@/lib/geolocation';
import { triggerDownload } from '@/lib/download';
import type { Database } from '@/lib/database.types';

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
      .then(() => setLocationHint('Lokasi terdeteksi ✓'))
      .catch((e) => setLocationHint((e as Error).message));
  }, [eventId]);

  async function load() {
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

  if (loading) {
    return (
      <div className="public-page">
        <div className="public-card"><p>Memuat...</p></div>
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className="public-page">
        <div className="public-card"><h2>Acara tidak ditemukan</h2></div>
      </div>
    );
  }

  if (event.is_locked) {
    return (
      <div className="public-page">
        <div className="public-card">
          <h2>Absensi Ditutup</h2>
          <p>Sesi absensi untuk acara ini sudah dikunci oleh penyelenggara.</p>
        </div>
      </div>
    );
  }

  if (submitState === 'success') {
    return (
      <div className="public-page">
        <div className="public-card">
          <h2>🎉 Absensi Berhasil</h2>
          <p className="form-success">{submitMessage}</p>
          {certificateUrl && (
            <a href={certificateUrl} target="_blank" rel="noopener noreferrer">
              <button style={{ width: '100%', marginTop: 8 }}>Buka / Unduh Ulang Sertifikat</button>
            </a>
          )}
        </div>
      </div>
    );
  }

  const customFields = fields.filter((f) => !f.fixed);

  return (
    <div className="public-page">
      <div className="public-card">
        <h2>{event.name}</h2>
        <p style={{ color: 'var(--text-muted)' }}>Isi data berikut untuk absen &amp; ambil sertifikat.</p>

        <form onSubmit={handleSubmit}>
          <label>
            Nama Lengkap &amp; Gelar
            <input value={namaLengkap} onChange={(e) => setNamaLengkap(e.target.value)} required />
          </label>

          <label>
            No. WhatsApp
            <input
              value={noWa}
              onChange={(e) => setNoWa(e.target.value)}
              placeholder="08xxxxxxxxxx"
              required
              inputMode="numeric"
            />
            {waError && <span className="form-error">{waError}</span>}
          </label>

          <label>
            Email (opsional)
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>

          {customFields.map((field) => (
            <div key={field.id}>
              {field.type === 'text' && (
                <label>
                  {field.label}
                  <input
                    required={field.required}
                    onChange={(e) => updateAnswer(field.key, e.target.value)}
                  />
                </label>
              )}
              {field.type === 'textarea' && (
                <label>
                  {field.label}
                  <textarea
                    required={field.required}
                    rows={3}
                    onChange={(e) => updateAnswer(field.key, e.target.value)}
                  />
                </label>
              )}
              {field.type === 'select' && (
                <label>
                  {field.label}
                  <select required={field.required} onChange={(e) => updateAnswer(field.key, e.target.value)}>
                    <option value="">— Pilih —</option>
                    {(field.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {field.type === 'checkbox' && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 6 }}>{field.label}</div>
                  {(field.options ?? []).map((opt) => (
                    <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                      <input
                        type="checkbox"
                        style={{ width: 'auto' }}
                        onChange={(e) => updateCheckbox(field.key, opt, e.target.checked)}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              )}
              {field.type === 'file' && (
                <label>
                  {field.label}
                  <input
                    type="file"
                    accept={(field.accept_file_types ?? []).join(',')}
                    required={field.required}
                    onChange={(e) => setFiles((prev) => ({ ...prev, [field.key]: e.target.files?.[0] ?? null }))}
                  />
                </label>
              )}
            </div>
          ))}

          {locationHint && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{locationHint}</p>}
          {submitState === 'error' && <p className="form-error">{submitMessage}</p>}

          <button type="submit" disabled={submitState === 'submitting'} style={{ width: '100%' }}>
            {submitState === 'submitting' ? 'Memproses...' : 'Hadir & Ambil Sertifikat'}
          </button>
        </form>
      </div>
    </div>
  );
}
