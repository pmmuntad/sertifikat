import { useEffect, useState, useRef, type FormEvent, type ChangeEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import { cleanWhatsAppNumber, isValidWhatsAppNumber } from '@/lib/whatsapp';
import type { Database } from '@/lib/database.types';
// FIX: Gunakan named imports agar kompatibel dan bebas error di Vite
import { read, utils, writeFile } from 'xlsx';
import { 
  ArrowLeft, Loader2, Trash2, Award, Plus, 
  FileSpreadsheet, Download, UploadCloud, Users 
} from 'lucide-react';

type CommitteeRow = Database['public']['Tables']['committee_members']['Row'];
type TemplateRow = Database['public']['Tables']['certificate_templates']['Row'];

export function CommitteeManagerPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { organization } = useAuth();
  
  const [members, setMembers] = useState<CommitteeRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // FIX: Gunakan useRef untuk input file agar tidak kena isu "Lost Event Target"
  const fileInputRef = useRef<HTMLInputElement>(null);

  // UI State: Tab aktif
  const [activeTab, setActiveTab] = useState<'manual' | 'excel'>('manual');

  // State Input Manual
  const [nama, setNama] = useState('');
  const [jabatan, setJabatan] = useState('');
  const [noWa, setNoWa] = useState('');
  const [templateId, setTemplateId] = useState('');

  // State Upload Excel
  const [batchTemplateId, setBatchTemplateId] = useState('');

  useEffect(() => {
    if (!eventId) return;
    load();
  }, [eventId]);

  async function load() {
    if (!eventId) return;
    setLoading(true);
    const [membersRes, templatesRes] = await Promise.all([
      supabase.from('committee_members').select('*').eq('event_id', eventId).order('created_at', { ascending: false }),
      supabase.from('certificate_templates').select('*').eq('event_id', eventId).eq('recipient_type', 'panitia'),
    ]);
    setMembers(membersRes.data ?? []);
    setTemplates(templatesRes.data ?? []);
    setLoading(false);
  }

  // --- HANDLER MANUAL INPUT ---
  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!eventId || !organization) return;
    setErrorMsg(null);
    setSubmitting(true);

    const cleanedWa = noWa ? cleanWhatsAppNumber(String(noWa)) : null;
    if (cleanedWa && !isValidWhatsAppNumber(cleanedWa)) {
      setErrorMsg('Format No. WA tidak valid. Contoh yang benar: 081234567890');
      setSubmitting(false);
      return;
    }

    const { data, error } = await supabase.from('committee_members').insert({
      event_id: eventId,
      organization_id: organization.id,
      nama_lengkap: nama,
      jabatan,
      no_wa: cleanedWa,
      template_id: templateId || null,
    }).select().single();

    if (error) {
      setErrorMsg(error.message);
    } else if (data) {
      setMembers((prev) => [data, ...prev]);
      setNama(''); setJabatan(''); setNoWa(''); setTemplateId('');
    }
    setSubmitting(false);
  }

  // --- HANDLER EXCEL UPLOAD ---
  function downloadTemplate() {
    const templateData = [
      { 'Nama Lengkap': 'Budi Santoso', 'Jabatan': 'Ketua Panitia', 'No WA': '081234567890' },
      { 'Nama Lengkap': 'Siti Aminah', 'Jabatan': 'Sekretaris', 'No WA': '089876543210' },
      { 'Nama Lengkap': 'Andi Kurniawan', 'Jabatan': 'Anggota', 'No WA': '' }
    ];
    
    const ws = utils.json_to_sheet(templateData);
    ws['!cols'] = [{ wch: 30 }, { wch: 25 }, { wch: 20 }];
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Template_Panitia');
    writeFile(wb, 'Template_Import_Panitia.xlsx');
  }

  // FIX: Fungsi pencari kolom cerdas (mengabaikan salah ketik besar/kecil & spasi ekstra dari user)
  function findColValue(row: any, possibleKeys: string[]) {
    if (!row) return null;
    const foundKey = Object.keys(row).find(key => 
      possibleKeys.includes(key.toLowerCase().trim())
    );
    return foundKey ? row[foundKey] : null;
  }

  async function handleExcelUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !eventId || !organization) return;

    setSubmitting(true);
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const arrayBuffer = evt.target?.result;
        if (!arrayBuffer) throw new Error("Gagal membaca file.");

        const wb = read(arrayBuffer, { type: 'array' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const jsonData = utils.sheet_to_json(ws);

        if (jsonData.length === 0) throw new Error('File Excel kosong atau format tidak sesuai.');

        // Mapping dengan key finder yang fleksibel
        const toInsert = jsonData.map((row: any) => {
          const rowNama = findColValue(row, ['nama lengkap', 'nama', 'name', 'nama panitia']);
          const rowJabatan = findColValue(row, ['jabatan', 'posisi', 'divisi', 'role']);
          const rowWa = findColValue(row, ['no wa', 'no. wa', 'no_wa', 'whatsapp', 'no whatsapp', 'telepon', 'no telp']);

          if (!rowNama || !rowJabatan) return null; 

          // Pastikan nomor menjadi string (Jika di Excel formatnya Number)
          const waString = rowWa ? String(rowWa).trim() : '';
          const cleanedWa = waString ? cleanWhatsAppNumber(waString) : null;

          return {
            event_id: eventId,
            organization_id: organization.id,
            nama_lengkap: String(rowNama).trim(),
            jabatan: String(rowJabatan).trim(),
            no_wa: cleanedWa && isValidWhatsAppNumber(cleanedWa) ? cleanedWa : null,
            template_id: batchTemplateId || null
          };
        }).filter((row): row is NonNullable<typeof row> => row !== null); // Buang yang null

        if (toInsert.length === 0) {
          throw new Error('Tidak ada data valid yang ditemukan. Pastikan kolom Nama dan Jabatan ada.');
        }

        const { error } = await supabase.from('committee_members').insert(toInsert);
        if (error) throw error;

        alert(`Berhasil mengimpor ${toInsert.length} data panitia!`);
        load(); // Refresh tabel
        setActiveTab('manual'); 
        
      } catch (err: any) {
        setErrorMsg(err.message || 'Terjadi kesalahan saat memproses file Excel.');
      } finally {
        setSubmitting(false);
        // FIX: Reset input file menggunakan useRef dengan aman
        if (fileInputRef.current) fileInputRef.current.value = ''; 
      }
    };
    
    reader.readAsArrayBuffer(file);
  }

  // --- TABLE ACTIONS ---
  async function removeMember(id: string) {
    if(!confirm('Hapus panitia ini?')) return;
    await supabase.from('committee_members').delete().eq('id', id);
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  async function issueCertificate(member: CommitteeRow) {
    if (!member.template_id) return alert('Pilih template sertifikat untuk panitia ini terlebih dahulu.');
    const { data, error } = await supabase.functions.invoke('generate-committee-certificate', { body: { committee_member_id: member.id } });
    if (error || !data?.success) return alert('Gagal menerbitkan sertifikat: ' + (data?.message || error?.message));
    alert(`Sertifikat berhasil terbit: ${data.certificate_number}`);
  }

  if (loading) return <div className="flex justify-center items-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-all">
          <ArrowLeft className="w-4 h-4" /> Kembali
        </button>

        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-800">Panitia & Jabatan</h2>
          <p className="text-sm text-slate-500 mt-2">Kelola data panitia, tetapkan jabatan, dan terbitkan sertifikat apresiasi.</p>
        </div>

        {/* --- KOTAK INPUT (MANUAL / EXCEL) --- */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header Tab */}
          {/* Header Tab */}
          <div className="flex border-b border-slate-200 bg-slate-50 overflow-hidden">
            <button 
              type="button"
              onClick={() => { setActiveTab('manual'); setErrorMsg(null); }}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-4 text-sm font-medium transition-all duration-200 border-b-2 border-t-0 border-l-0 border-r-0 rounded-none m-0 focus:outline-none focus:ring-0 ${
                activeTab === 'manual' 
                  ? 'border-indigo-600 !text-indigo-700 !bg-white hover:!text-indigo-700 hover:!bg-white shadow-[0_1px_0_0_#4f46e5]' 
                  : 'border-transparent !text-slate-500 !bg-transparent hover:!text-slate-700 hover:!bg-slate-100'
              }`}
              style={{ appearance: 'none', backgroundImage: 'none' }}
            >
              <Users className="w-4 h-4" /> Input Manual
            </button>
            <button 
              type="button"
              onClick={() => { setActiveTab('excel'); setErrorMsg(null); }}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-4 text-sm font-medium transition-all duration-200 border-b-2 border-t-0 border-l-0 border-r-0 rounded-none m-0 focus:outline-none focus:ring-0 ${
                activeTab === 'excel' 
                  ? 'border-indigo-600 !text-indigo-700 !bg-white hover:!text-indigo-700 hover:!bg-white shadow-[0_1px_0_0_#4f46e5]' 
                  : 'border-transparent !text-slate-500 !bg-transparent hover:!text-slate-700 hover:!bg-slate-100'
              }`}
              style={{ appearance: 'none', backgroundImage: 'none' }}
            >
              <FileSpreadsheet className="w-4 h-4" /> Upload Excel
            </button>
          </div>

          <div className="p-5 sm:p-6">
            {errorMsg && <div className="mb-5 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{errorMsg}</div>}

            {/* KONTEN TAB: MANUAL */}
            {activeTab === 'manual' && (
              <form onSubmit={handleAdd} className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Nama Lengkap</label>
                    <input value={nama} onChange={(e) => setNama(e.target.value)} required className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Jabatan</label>
                    <input value={jabatan} onChange={(e) => setJabatan(e.target.value)} placeholder="Ketua Panitia" required className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">No. WA (Opsional)</label>
                    <input value={noWa} onChange={(e) => setNoWa(e.target.value)} placeholder="08xxxxxxxxxx" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Template Sertifikat</label>
                    <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none text-sm">
                      <option value="">— Pilih template —</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>{t.jabatan ? t.jabatan : 'Umum'}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button type="submit" disabled={submitting} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Tambah Panitia
                  </button>
                </div>
              </form>
            )}

            {/* KONTEN TAB: EXCEL */}
            {activeTab === 'excel' && (
              <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-col sm:flex-row gap-4 p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-indigo-900">Cara Import Data</h4>
                    <ul className="mt-2 space-y-1 text-sm text-indigo-800 list-disc list-inside">
                      <li>Download template Excel yang disediakan.</li>
                      <li>Isi data panitia tanpa mengubah baris pertama (Header).</li>
                      <li>Simpan file, lalu unggah kembali di bawah ini.</li>
                    </ul>
                  </div>
                  <div className="flex items-start sm:items-center">
                    <button onClick={downloadTemplate} className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-600 border border-indigo-200 hover:border-indigo-300 hover:bg-indigo-50 rounded-lg text-sm font-medium transition-all shadow-sm whitespace-nowrap">
                      <Download className="w-4 h-4" /> Download Template
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Template Sertifikat Massal <span className="text-slate-400 font-normal">(Opsional)</span></label>
                    <select value={batchTemplateId} onChange={(e) => setBatchTemplateId(e.target.value)} disabled={submitting} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none text-sm">
                      <option value="">— Tetapkan Nanti / Jangan Set Dulu —</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>{t.jabatan ? t.jabatan : 'Umum'}</option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-xs text-slate-500">Template ini akan otomatis diaplikasikan ke semua nama yang diunggah.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Unggah File (XLSX, XLS)</label>
                    <div className="relative">
                      <input 
                        type="file" 
                        ref={fileInputRef} // FIX: Attached ref here
                        accept=".xlsx, .xls"
                        onChange={handleExcelUpload} 
                        disabled={submitting}
                        className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-all cursor-pointer border border-slate-200 rounded-lg p-1 bg-slate-50 disabled:opacity-50" 
                      />
                      {submitting && (
                        <div className="absolute inset-0 bg-white/80 flex items-center gap-2 px-4 text-sm font-medium text-indigo-600 rounded-lg">
                          <Loader2 className="w-4 h-4 animate-spin" /> Sedang Mengimpor...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* --- TABEL DATA --- */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mt-6">
          <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <h3 className="text-lg font-semibold text-slate-800">Daftar Panitia ({members.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-medium">
                <tr>
                  <th className="px-6 py-4 border-b border-slate-200">Nama</th>
                  <th className="px-6 py-4 border-b border-slate-200">Jabatan</th>
                  <th className="px-6 py-4 border-b border-slate-200">No. WA</th>
                  <th className="px-6 py-4 border-b border-slate-200 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {members.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-10 text-center text-slate-500">Belum ada data panitia</td></tr>
                ) : (
                  members.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">{m.nama_lengkap}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{m.jabatan}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{m.no_wa ?? '—'}</td>
                      <td className="px-6 py-4 flex items-center justify-end gap-2">
                        <button onClick={() => issueCertificate(m)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors whitespace-nowrap border border-transparent">
                          <Award className="w-3.5 h-3.5" /> Terbitkan
                        </button>
                        <button onClick={() => removeMember(m.id)} title="Hapus Panitia" className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        
      </div>
    </div>
  );
}