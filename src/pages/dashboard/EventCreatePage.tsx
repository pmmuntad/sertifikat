import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import { DEFAULT_WA_MESSAGE_TEMPLATE } from '@/lib/templateRenderer';
import { FIXED_FIELDS } from '@/lib/formTypes';

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
    <div className="card" style={{ maxWidth: 560 }}>
      <h2>Buat Acara Baru</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Nama Acara
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <label>
          Deskripsi (opsional)
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </label>

        <label>
          Mode Pendaftaran
          <select value={mode} onChange={(e) => setMode(e.target.value as 'excel' | 'live')}>
            <option value="live">Absensi Langsung (Scan QR, Tanpa Excel)</option>
            <option value="excel">Upload Excel (data peserta sudah pasti)</option>
          </select>
        </label>

        {mode === 'live' && (
          <>
            <label>
              Interval Refresh QR (detik)
              <input
                type="number"
                min={5}
                max={300}
                value={qrInterval}
                onChange={(e) => setQrInterval(Number(e.target.value))}
              />
            </label>

            <label>
              Radius Geofencing (meter)
              <input
                type="number"
                min={10}
                max={1000}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
              />
            </label>
          </>
        )}

        {errorMsg && <p className="form-error">{errorMsg}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Menyimpan...' : 'Buat Acara'}
        </button>
      </form>
    </div>
  );
}
