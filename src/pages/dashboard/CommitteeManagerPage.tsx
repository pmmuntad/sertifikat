import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import { cleanWhatsAppNumber, isValidWhatsAppNumber } from '@/lib/whatsapp';
import type { Database } from '@/lib/database.types';

type CommitteeRow = Database['public']['Tables']['committee_members']['Row'];
type TemplateRow = Database['public']['Tables']['certificate_templates']['Row'];

export function CommitteeManagerPage() {
  const { eventId } = useParams();
  const { organization } = useAuth();
  const [members, setMembers] = useState<CommitteeRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [nama, setNama] = useState('');
  const [jabatan, setJabatan] = useState('');
  const [noWa, setNoWa] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    load();
  }, [eventId]);

  async function load() {
    setLoading(true);
    const [membersRes, templatesRes] = await Promise.all([
      supabase.from('committee_members').select('*').eq('event_id', eventId).order('created_at', { ascending: false }),
      supabase.from('certificate_templates').select('*').eq('event_id', eventId).eq('recipient_type', 'panitia'),
    ]);
    setMembers(membersRes.data ?? []);
    setTemplates(templatesRes.data ?? []);
    setLoading(false);
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!eventId || !organization) return;
    setErrorMsg(null);

    const cleanedWa = noWa ? cleanWhatsAppNumber(noWa) : null;
    if (cleanedWa && !isValidWhatsAppNumber(cleanedWa)) {
      setErrorMsg('Format No. WA tidak valid. Contoh yang benar: 081234567890');
      return;
    }

    const { data, error } = await supabase
      .from('committee_members')
      .insert({
        event_id: eventId,
        organization_id: organization.id,
        nama_lengkap: nama,
        jabatan,
        no_wa: cleanedWa,
        template_id: templateId || null,
      })
      .select()
      .single();

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setMembers((prev) => [data, ...prev]);
    setNama('');
    setJabatan('');
    setNoWa('');
    setTemplateId('');
  }

  async function removeMember(id: string) {
    await supabase.from('committee_members').delete().eq('id', id);
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  async function issueCertificate(member: CommitteeRow) {
    if (!member.template_id) {
      alert('Pilih template sertifikat untuk panitia ini terlebih dahulu (edit data panitia).');
      return;
    }
    const { data, error } = await supabase.functions.invoke('generate-committee-certificate', {
      body: { committee_member_id: member.id },
    });
    if (error || !data?.success) {
      alert('Gagal menerbitkan sertifikat: ' + (data?.message || error?.message));
      return;
    }
    alert(`Sertifikat berhasil terbit: ${data.certificate_number}`);
  }

  if (loading) return <p>Memuat...</p>;

  return (
    <div>
      <h2>Panitia & Jabatan</h2>
      <p style={{ color: 'var(--text-muted)' }}>
        Data panitia biasanya sudah pasti jumlahnya — input manual di sini, pilih template & jabatan
        masing-masing untuk penerbitan sertifikat panitia.
      </p>

      <div className="card">
        <h3>Tambah Panitia</h3>
        <form onSubmit={handleAdd}>
          <label>
            Nama Lengkap
            <input value={nama} onChange={(e) => setNama(e.target.value)} required />
          </label>
          <label>
            Jabatan
            <input value={jabatan} onChange={(e) => setJabatan(e.target.value)} placeholder="Ketua Panitia" required />
          </label>
          <label>
            No. WhatsApp (opsional, untuk kirim sertifikat)
            <input value={noWa} onChange={(e) => setNoWa(e.target.value)} placeholder="08xxxxxxxxxx" />
          </label>
          <label>
            Template Sertifikat Panitia
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">— Pilih template —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.jabatan ? t.jabatan : 'Template Umum Panitia'}
                </option>
              ))}
            </select>
          </label>
          {errorMsg && <p className="form-error">{errorMsg}</p>}
          <button type="submit">+ Tambah Panitia</button>
        </form>
      </div>

      <div className="card">
        <h3>Daftar Panitia</h3>
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Jabatan</th>
              <th>No. WA</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.nama_lengkap}</td>
                <td>{m.jabatan}</td>
                <td>{m.no_wa ?? '—'}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="secondary" onClick={() => issueCertificate(m)}>
                    Terbitkan Sertifikat
                  </button>
                  <button className="danger" onClick={() => removeMember(m.id)}>
                    Hapus
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
