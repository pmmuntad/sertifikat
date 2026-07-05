import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import { FIELD_TYPE_LABELS } from '@/lib/formTypes';
import type { Database, FormFieldType } from '@/lib/database.types';
import { 
  Trash2, 
  Plus, 
  Lock, 
  Info, 
  Type, 
  AlignLeft, 
  List, 
  CheckSquare, 
  FileUp,
  Loader2
} from 'lucide-react';

type FieldRow = Database['public']['Tables']['event_form_fields']['Row'];

const FIELD_TYPES: FormFieldType[] = ['text', 'textarea', 'select', 'checkbox', 'file'];

// Helper untuk menampilkan ikon berdasarkan tipe field
const getFieldIcon = (type: FormFieldType) => {
  switch (type) {
    case 'text': return <Type className="w-4 h-4" />;
    case 'textarea': return <AlignLeft className="w-4 h-4" />;
    case 'select': return <List className="w-4 h-4" />;
    case 'checkbox': return <CheckSquare className="w-4 h-4" />;
    case 'file': return <FileUp className="w-4 h-4" />;
    default: return <Type className="w-4 h-4" />;
  }
};

export function FormBuilderPage() {
  const { eventId } = useParams();
  const { organization } = useAuth();
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // State form tambah field baru
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
    setSubmitting(true);

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
    setSubmitting(false);
  }

  async function removeField(fieldId: string) {
    if (!confirm('Yakin ingin menghapus pertanyaan ini?')) return;
    await supabase.from('event_form_fields').delete().eq('id', fieldId);
    setFields((prev) => prev.filter((f) => f.id !== fieldId));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div>
          <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Form Builder</h2>
          <div className="mt-3 flex items-start gap-3 bg-indigo-50/80 border border-indigo-100 p-4 rounded-xl">
            <Info className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-indigo-900 leading-relaxed">
              Field wajib (Nama, No. WA, Email) selalu tampil di form peserta dan tidak bisa dihapus. 
              Tambahkan pertanyaan custom sesuai kebutuhan acara Anda di bawah ini.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Kolom Kiri: Daftar Pertanyaan */}
          <div className="lg:col-span-7 space-y-4">
            <h3 className="text-lg font-semibold text-slate-800 px-1">Daftar Pertanyaan</h3>
            
            <div className="space-y-3">
              {fields.map((field) => (
                <div 
                  key={field.id} 
                  className={`group flex items-start justify-between p-4 bg-white border rounded-xl shadow-sm transition-all duration-200 ${
                    field.fixed ? 'border-slate-200 bg-slate-50/50' : 'border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <strong className="text-slate-800 text-sm font-medium truncate">
                        {field.label}
                      </strong>
                      {field.required && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-100">
                          Wajib
                        </span>
                      )}
                      {field.fixed && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          <Lock className="w-3 h-3" /> Bawaan Sistem
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-2">
                      {getFieldIcon(field.type)}
                      <span>{FIELD_TYPE_LABELS[field.type]}</span>
                    </div>

                    {field.options && field.options.length > 0 && (
                      <div className="mt-3">
                        <div className="flex flex-wrap gap-1.5">
                          {field.options.map((opt, idx) => (
                            <span key={idx} className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-slate-100 text-slate-600">
                              {opt}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {!field.fixed && (
                    <button 
                      onClick={() => removeField(field.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                      title="Hapus Pertanyaan"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Kolom Kanan: Tambah Pertanyaan Custom */}
          <div className="lg:col-span-5">
            <div className="sticky top-8 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-800 mb-5">Tambah Pertanyaan Custom</h3>
              
              <div className="space-y-4">
                {/* Input Label */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Pertanyaan / Label
                  </label>
                  <input 
                    type="text"
                    value={label} 
                    onChange={(e) => setLabel(e.target.value)} 
                    placeholder="Contoh: Asal Institusi" 
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm transition-colors"
                  />
                </div>

                {/* Select Tipe */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Tipe Jawaban
                  </label>
                  <div className="relative">
                    <select 
                      value={type} 
                      onChange={(e) => setType(e.target.value as FormFieldType)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm appearance-none transition-colors"
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {FIELD_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                      {getFieldIcon(type)}
                    </div>
                  </div>
                </div>

                {/* Textarea Opsi (Muncul kondisional) */}
                {(type === 'select' || type === 'checkbox') && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center justify-between">
                      Daftar Opsi
                      <span className="text-xs text-slate-400 font-normal">Satu opsi per baris</span>
                    </label>
                    <textarea
                      value={optionsText}
                      onChange={(e) => setOptionsText(e.target.value)}
                      rows={4}
                      placeholder="Teknik&#10;Ekonomi&#10;Hukum"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm transition-colors resize-none"
                    />
                  </div>
                )}

                {/* Checkbox Required */}
                <div className="pt-2">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={required}
                        onChange={(e) => setRequired(e.target.checked)}
                        className="peer sr-only"
                      />
                      <div className="w-5 h-5 border-2 border-slate-300 rounded peer-checked:bg-indigo-600 peer-checked:border-indigo-600 peer-focus:ring-2 peer-focus:ring-indigo-600 peer-focus:ring-offset-2 transition-all"></div>
                      <CheckSquare className="w-3.5 h-3.5 text-white absolute opacity-0 peer-checked:opacity-100 transition-opacity" strokeWidth={3} />
                    </div>
                    <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">
                      Wajib diisi oleh peserta
                    </span>
                  </label>
                </div>

                {/* Tombol Submit */}
                <div className="pt-4 mt-4 border-t border-slate-100">
                  <button 
                    onClick={addField} 
                    disabled={!label.trim() || submitting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    {submitting ? 'Menambahkan...' : 'Tambah Pertanyaan'}
                  </button>
                </div>
                
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}