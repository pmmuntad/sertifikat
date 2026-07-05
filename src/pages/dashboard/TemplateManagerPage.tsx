import { useEffect, useState, type ChangeEvent } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import type { CertificateRecipientType, Database } from '@/lib/database.types';

type TemplateRow = Database['public']['Tables']['certificate_templates']['Row'];

/**
 * Placeholder posisi disimpan sebagai JSON { x, y, fontSize, width } per key.
 * Editor visual drag-and-drop di atas preview gambar adalah pengembangan lanjutan;
 * di scaffold ini disediakan input koordinat manual sebagai fallback yang tetap
 * fungsional sambil UI drag-and-drop bisa ditambahkan kemudian.
 */
const PLACEHOLDER_KEYS_PESERTA = ['nama', 'no_sertifikat', 'qr_verifikasi'];
const PLACEHOLDER_KEYS_PANITIA = ['nama', 'jabatan', 'ttd', 'no_sertifikat', 'qr_verifikasi'];

export function TemplateManagerPage() {
  const { eventId } = useParams();
  const { organization } = useAuth();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [recipientType, setRecipientType] = useState<CertificateRecipientType>('peserta');
  const [jabatan, setJabatan] = useState('');

  useEffect(() => {
    if (!eventId) return;
    load();
  }, [eventId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('certificate_templates')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });
    setTemplates(data ?? []);
    setLoading(false);
  }

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !eventId || !organization) return;

    setUploading(true);
    const path = `${organization.id}/${eventId}/template_${recipientType}_${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('certificate-templates')
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (uploadError) {
      alert('Gagal upload template: ' + uploadError.message);
      setUploading(false);
      return;
    }

    const defaultPlaceholders = Object.fromEntries(
      (recipientType === 'panitia' ? PLACEHOLDER_KEYS_PANITIA : PLACEHOLDER_KEYS_PESERTA).map((key, i) => [
        key,
        { x: 400, y: 250 + i * 60, fontSize: 28, width: key === 'ttd' ? 150 : undefined },
      ])
    );

    const { data, error } = await supabase
      .from('certificate_templates')
      .insert({
        event_id: eventId,
        organization_id: organization.id,
        recipient_type: recipientType,
        jabatan: recipientType === 'panitia' ? jabatan || null : null,
        file_path: path,
        placeholders: defaultPlaceholders,
      })
      .select()
      .single();

    if (!error && data) {
      setTemplates((prev) => [data, ...prev]);
    } else if (error) {
      alert('Gagal simpan data template: ' + error.message);
    }

    setUploading(false);
    setJabatan('');
    e.target.value = '';
  }

  async function removeTemplate(template: TemplateRow) {
    await supabase.storage.from('certificate-templates').remove([template.file_path]);
    await supabase.from('certificate_templates').delete().eq('id', template.id);
    setTemplates((prev) => prev.filter((t) => t.id !== template.id));
  }

  if (loading) return <p>Memuat...</p>;

  return (
    <div>
      <h2>Template Sertifikat</h2>
      <p style={{ color: 'var(--text-muted)' }}>
        Upload template untuk peserta dan (opsional) template khusus panitia per jabatan.
        Placeholder posisi bisa disesuaikan lebih lanjut lewat editor visual pada pengembangan berikutnya.
      </p>

      <div className="card">
        <h3>Upload Template Baru</h3>
        <label>
          Jenis Penerima
          <select value={recipientType} onChange={(e) => setRecipientType(e.target.value as CertificateRecipientType)}>
            <option value="peserta">Peserta</option>
            <option value="panitia">Panitia</option>
          </select>
        </label>

        {recipientType === 'panitia' && (
          <label>
            Nama Jabatan (opsional, kosongkan jika template ini untuk semua jabatan)
            <input value={jabatan} onChange={(e) => setJabatan(e.target.value)} placeholder="Contoh: Ketua Panitia" />
          </label>
        )}

        <label>
          File Template (PNG/JPG, disarankan resolusi tinggi)
          <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} />
        </label>
        {uploading && <p>Mengunggah...</p>}
      </div>

      <div className="card">
        <h3>Template Terpasang</h3>
        {templates.length === 0 && <p>Belum ada template diunggah.</p>}
        {templates.map((t) => (
          <div key={t.id} className="field-row">
            <div style={{ flex: 1 }}>
              <strong>{t.recipient_type === 'peserta' ? 'Peserta' : `Panitia${t.jabatan ? ' — ' + t.jabatan : ''}`}</strong>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t.file_path}</div>
            </div>
            <button className="danger" onClick={() => removeTemplate(t)}>
              Hapus
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
