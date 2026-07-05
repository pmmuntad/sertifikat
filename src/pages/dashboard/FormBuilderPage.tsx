import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import { FIELD_TYPE_LABELS } from '@/lib/formTypes';
import type { Database, FormFieldType } from '@/lib/database.types';

type FieldRow = Database['public']['Tables']['event_form_fields']['Row'];

const FIELD_TYPES: FormFieldType[] = ['text', 'textarea', 'select', 'checkbox', 'file'];

export function FormBuilderPage() {
  const { eventId } = useParams();
  const { organization } = useAuth();
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [loading, setLoading] = useState(true);

  // state form tambah field baru
  const [label, setLabel] = useState('');
  const [type, setType] = useState<FormFieldType>('text');
  const [required, setRequired] = useState(true);
  const [optionsText, setOptionsText] = useState('');

  useEffect(() => {
    if (!eventId) return;
    load();
  }, [eventId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('event_form_fields')
      .select('*')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true });
    setFields(data ?? []);
    setLoading(false);
  }

  function slugifyKey(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  async function addField() {
    if (!eventId || !organization || !label.trim()) return;

    const key = slugifyKey(label);
    const options =
      type === 'select' || type === 'checkbox'
        ? optionsText.split('\n').map((s) => s.trim()).filter(Boolean)
        : null;

    const nextOrder = fields.length > 0 ? Math.max(...fields.map((f) => f.sort_order)) + 1 : 100;

    const { data, error } = await supabase
      .from('event_form_fields')
      .insert({
        event_id: eventId,
        organization_id: organization.id,
        key,
        label,
        type,
        options,
        required,
        fixed: false,
        sort_order: nextOrder,
        accept_file_types: type === 'file' ? ['image/*', 'application/pdf'] : null,
        max_file_size_mb: type === 'file' ? 5 : null,
      })
      .select()
      .single();

    if (!error && data) {
      setFields((prev) => [...prev, data]);
      setLabel('');
      setOptionsText('');
      setRequired(true);
      setType('text');
    }
  }

  async function removeField(fieldId: string) {
    await supabase.from('event_form_fields').delete().eq('id', fieldId);
    setFields((prev) => prev.filter((f) => f.id !== fieldId));
  }

  if (loading) return <p>Memuat...</p>;

  return (
    <div>
      <h2>Form Builder</h2>
      <p style={{ color: 'var(--text-muted)' }}>
        Field wajib (Nama, No. WA, Email) selalu tampil di form peserta dan tidak bisa dihapus.
        Tambahkan pertanyaan custom sesuai kebutuhan acara di bawah ini.
      </p>

      <div className="card">
        <h3>Daftar Pertanyaan</h3>
        {fields.map((field) => (
          <div key={field.id} className={'field-row' + (field.fixed ? ' fixed' : '')}>
            <div style={{ flex: 1 }}>
              <strong>{field.label}</strong>{' '}
              <span className="tag">{FIELD_TYPE_LABELS[field.type]}</span>{' '}
              {field.required && <span className="tag">Wajib</span>}
              {field.fixed && <span className="tag">Bawaan Sistem</span>}
              {field.options && field.options.length > 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                  Opsi: {field.options.join(', ')}
                </div>
              )}
            </div>
            {!field.fixed && (
              <button className="danger" onClick={() => removeField(field.id)}>
                Hapus
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Tambah Pertanyaan Custom</h3>
        <label>
          Pertanyaan / Label
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Contoh: Asal Institusi" />
        </label>

        <label>
          Tipe Jawaban
          <select value={type} onChange={(e) => setType(e.target.value as FormFieldType)}>
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {FIELD_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        {(type === 'select' || type === 'checkbox') && (
          <label>
            Daftar Opsi (satu opsi per baris)
            <textarea
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              rows={4}
              placeholder={'Teknik\nEkonomi\nHukum'}
            />
          </label>
        )}

        <label>
          <input
            type="checkbox"
            style={{ width: 'auto', marginRight: 8 }}
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          Wajib diisi
        </label>

        <button onClick={addField} disabled={!label.trim()}>
          + Tambah Pertanyaan
        </button>
      </div>
    </div>
  );
}
