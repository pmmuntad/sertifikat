import { useEffect, useState, type ChangeEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import type { CertificateRecipientType, Database } from '@/lib/database.types';
import { 
  ArrowLeft, Loader2, UploadCloud, Trash2, 
  FileImage, Eye, X, Check, XCircle, Settings2
} from 'lucide-react';

type TemplateRow = Database['public']['Tables']['certificate_templates']['Row'];

const PLACEHOLDER_KEYS_PESERTA = ['nama', 'no_sertifikat', 'qr_verifikasi'];
const PLACEHOLDER_KEYS_PANITIA = ['nama', 'jabatan', 'ttd', 'no_sertifikat', 'qr_verifikasi'];

/** Baca dimensi asli sebuah file gambar via Image() browser, tanpa upload dulu. */
function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Gagal membaca dimensi gambar'));
    };
    img.src = url;
  });
}

export function TemplateManagerPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { organization } = useAuth();
  
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  
  // State untuk form upload
  const [recipientType, setRecipientType] = useState<CertificateRecipientType>('peserta');
  const [jabatan, setJabatan] = useState('');
  
  // State untuk file & preview sebelum upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // State untuk Modal Preview (Template terpasang)
  const [previewModal, setPreviewModal] = useState<{ url: string; title: string } | null>(null);

  useEffect(() => {
    if (!eventId) return;
    load();
    
    // Cleanup local object URL to avoid memory leaks
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [eventId]);

  async function load() {
    if (!eventId) return;
    setLoading(true);
    const { data } = await supabase
      .from('certificate_templates')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });
    setTemplates(data ?? []);
    setLoading(false);
  }

  // Handle saat user memilih file gambar
  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl); // Bersihkan URL lama
    setLocalPreviewUrl(URL.createObjectURL(file));
  }

  // Batal upload
  function cancelUpload() {
    setSelectedFile(null);
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(null);
    
    // Reset input file (optional trick)
    const fileInput = document.getElementById('template-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  }

  // Eksekusi upload ke Supabase
  async function handleUpload() {
    if (!selectedFile || !eventId || !organization) return;
    setUploading(true);

    const path = `${organization.id}/${eventId}/template_${recipientType}_${Date.now()}_${selectedFile.name}`;

    const { error: uploadError } = await supabase.storage
      .from('certificate-templates')
      .upload(path, selectedFile, { cacheControl: '3600', upsert: false });

    if (uploadError) {
      alert('Gagal upload template: ' + uploadError.message);
      setUploading(false);
      return;
    }

    const defaultPlaceholders = Object.fromEntries(
      (recipientType === 'panitia' ? PLACEHOLDER_KEYS_PANITIA : PLACEHOLDER_KEYS_PESERTA).map((key, i) => [
        key,
        {
          x: 400,
          y: 250 + i * 60,
          fontSize: 28,
          width: key === 'ttd' || key === 'qr_verifikasi' ? 150 : undefined,
          color: '#000000',
          enabled: true,
          align: 'left' as const,
        },
      ])
    );

    // Ambil dimensi ASLI gambar (bukan di-hardcode 1000x700) supaya PDF nanti
    // dirender 1:1 sesuai rasio gambar yang diupload dosen -- gambar tidak
    // gepeng/distorsi, dan koordinat placeholder di editor visual (task #7)
    // konsisten dengan koordinat saat render PDF di server.
    // Fallback ke 1000x700 kalau browser gagal membaca dimensi (jarang terjadi).
    const dimensions = await getImageDimensions(selectedFile).catch(() => ({ width: 1000, height: 700 }));

    const { data, error } = await supabase.from('certificate_templates').insert({
      event_id: eventId,
      organization_id: organization.id,
      recipient_type: recipientType,
      jabatan: recipientType === 'panitia' ? jabatan || null : null,
      file_path: path,
      placeholders: defaultPlaceholders,
      page_width: dimensions.width,
      page_height: dimensions.height,
    }).select().single();

    if (!error && data) {
      setTemplates((prev) => [data, ...prev]);
      cancelUpload(); // Bersihkan form setelah sukses
      setJabatan('');
    } else if (error) {
      alert('Gagal simpan data template: ' + error.message);
    }
    setUploading(false);
  }

  async function removeTemplate(template: TemplateRow) {
    if(!confirm('Yakin ingin menghapus template ini?')) return;
    await supabase.storage.from('certificate-templates').remove([template.file_path]);
    await supabase.from('certificate_templates').delete().eq('id', template.id);
    setTemplates((prev) => prev.filter((t) => t.id !== template.id));
  }

  // Buka modal preview untuk template yang sudah terpasang.
  // PENTING: bucket 'certificate-templates' bersifat PRIVATE (RLS aktif),
  // jadi getPublicUrl() akan menghasilkan URL yang selalu gagal diakses
  // (403). Harus pakai createSignedUrl() yang menghasilkan URL sementara
  // dengan token akses, sesuai desain keamanan storage di migration 0001.
  async function openPreviewModal(t: TemplateRow) {
    const { data, error } = await supabase.storage
      .from('certificate-templates')
      .createSignedUrl(t.file_path, 60 * 10); // berlaku 10 menit, cukup untuk preview

    if (error || !data) {
      alert('Gagal memuat preview: ' + (error?.message ?? 'URL tidak tersedia'));
      return;
    }

    const title = t.recipient_type === 'peserta' 
      ? 'Sertifikat Peserta' 
      : `Sertifikat Panitia${t.jabatan ? ' — ' + t.jabatan : ' (Umum)'}`;
    
    setPreviewModal({ url: data.signedUrl, title });
  }

  if (loading) return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        <button 
          onClick={() => navigate(-1)} 
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali
        </button>

        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-800">Template Sertifikat</h2>
          <p className="text-sm text-slate-500 mt-2">Upload template untuk peserta dan (opsional) template khusus panitia per jabatan.</p>
        </div>

        {/* --- FORM UPLOAD --- */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-indigo-600" /> Upload Template Baru
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Jenis Penerima</label>
              <select 
                value={recipientType} 
                onChange={(e) => setRecipientType(e.target.value as CertificateRecipientType)} 
                disabled={uploading || !!localPreviewUrl}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none text-sm disabled:opacity-60"
              >
                <option value="peserta">Peserta</option>
                <option value="panitia">Panitia</option>
              </select>
            </div>
            {recipientType === 'panitia' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nama Jabatan <span className="font-normal text-slate-400">(Kosongkan jika Umum)</span></label>
                <input 
                  value={jabatan} 
                  onChange={(e) => setJabatan(e.target.value)} 
                  disabled={uploading || !!localPreviewUrl}
                  placeholder="Contoh: Ketua Panitia" 
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none text-sm disabled:opacity-60" 
                />
              </div>
            )}
          </div>

          {/* Area Pilih & Preview File */}
          {!localPreviewUrl ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">File Template (PNG/JPG Resolusi Tinggi)</label>
              <input 
                id="template-upload"
                type="file" 
                accept="image/*" 
                onChange={handleFileSelect} 
                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-all cursor-pointer border border-slate-200 rounded-lg p-1 bg-slate-50" 
              />
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 animate-in fade-in zoom-in-95 duration-200">
              <p className="text-sm font-medium text-slate-700 mb-3">Preview Template</p>
              <div className="relative w-full rounded-lg overflow-hidden border border-slate-200 shadow-sm bg-white mb-4 flex justify-center">
                <img 
                  src={localPreviewUrl} 
                  alt="Preview" 
                  className="max-h-64 object-contain"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button 
                  onClick={handleUpload} 
                  disabled={uploading}
                  className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-70 shadow-sm"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {uploading ? 'Menyimpan...' : 'Simpan Template Ini'}
                </button>
                <button 
                  onClick={cancelUpload} 
                  disabled={uploading}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white text-slate-600 border border-slate-300 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-70"
                >
                  <XCircle className="w-4 h-4" /> Batal
                </button>
              </div>
            </div>
          )}
        </div>

        {/* --- LIST TEMPLATE TERPASANG --- */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-slate-200 bg-slate-50/50">
            <h3 className="text-lg font-semibold text-slate-800">Template Terpasang</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {templates.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">Belum ada template yang terpasang.</div>
            ) : (
              templates.map((t) => (
                <div key={t.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 flex-shrink-0">
                      <FileImage className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <strong className="text-sm font-semibold text-slate-900 block truncate">
                        {t.recipient_type === 'peserta' ? 'Sertifikat Peserta' : `Sertifikat Panitia${t.jabatan ? ' — ' + t.jabatan : ' (Umum)'}`}
                      </strong>
                      <span className="text-xs text-slate-500 block truncate mt-0.5" title={t.file_path}>
                        {t.file_path.split('/').pop()}
                      </span>
                    </div>
                  </div>
                  
                  {/* Tombol Aksi */}
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => navigate(`/dashboard/events/${eventId}/templates/${t.id}/editor`)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
                    >
                      <Settings2 className="w-4 h-4" /> Atur Posisi
                    </button>
                    <button 
                      onClick={() => openPreviewModal(t)} 
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors shadow-sm"
                    >
                      <Eye className="w-4 h-4" /> Preview
                    </button>
                    <button 
                      onClick={() => removeTemplate(t)} 
                      className="flex items-center justify-center p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-lg transition-colors"
                      title="Hapus Template"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* --- MODAL PREVIEW (LIGHTBOX) --- */}
      {previewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm transition-opacity animate-in fade-in duration-200">
          <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            
            {/* Header Modal */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-800">{previewModal.title}</h3>
              <button 
                onClick={() => setPreviewModal(null)}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Body Modal (Gambar) */}
            <div className="flex-1 overflow-auto p-4 sm:p-6 flex items-center justify-center bg-slate-100/50">
              <img 
                src={previewModal.url} 
                alt={previewModal.title} 
                className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm border border-slate-200"
              />
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}