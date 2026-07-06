import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import type { Database } from '@/lib/database.types';
import {
  ArrowLeft,
  Loader2,
  Save,
  Eye,
  EyeOff,
  Type,
  QrCode,
  Hash,
  Signature,
  Briefcase,
} from 'lucide-react';

type TemplateRow = Database['public']['Tables']['certificate_templates']['Row'];

export interface PlaceholderPosition {
  x: number;
  y: number;
  fontSize?: number;
  width?: number;
  height?: number;
  color?: string;
  enabled?: boolean;
  align?: 'left' | 'center' | 'right';
}

type PlaceholderKey = 'nama' | 'jabatan' | 'no_sertifikat' | 'qr_verifikasi' | 'ttd';

const PLACEHOLDER_META: Record<PlaceholderKey, { label: string; icon: typeof Type; isImage?: boolean }> = {
  nama: { label: 'Nama Lengkap', icon: Type },
  jabatan: { label: 'Jabatan (Panitia)', icon: Briefcase },
  no_sertifikat: { label: 'No. Sertifikat', icon: Hash },
  qr_verifikasi: { label: 'QR Verifikasi', icon: QrCode, isImage: true },
  ttd: { label: 'Tanda Tangan (TTD)', icon: Signature, isImage: true },
};

const SAMPLE_VALUES: Record<PlaceholderKey, string> = {
  nama: 'Budi Santoso, S.Kom.',
  jabatan: 'Ketua Panitia',
  no_sertifikat: '0007/CERT/2026',
  qr_verifikasi: 'QR',
  ttd: 'TTD',
};

/**
 * Editor visual drag-and-drop untuk mengatur posisi, ukuran, dan warna
 * placeholder di atas template sertifikat. Gambar template ditampilkan
 * di-scale ke lebar canvas (CSS), tapi koordinat yang DISIMPAN ke database
 * selalu dalam skala ASLI gambar (page_width x page_height dari template),
 * supaya konsisten dengan koordinat yang dipakai saat render PDF di server
 * (supabase/functions/_shared/certificatePdf.ts).
 */
export function TemplateEditorPage() {
  const { templateId } = useParams();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<TemplateRow | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [placeholders, setPlaceholders] = useState<Record<string, PlaceholderPosition>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedKey, setSelectedKey] = useState<PlaceholderKey | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);

  useEffect(() => {
    if (!templateId) return;
    load();
  }, [templateId]);

  // Ukur lebar canvas render (CSS) untuk menghitung faktor skala terhadap
  // dimensi asli gambar -- dipakai untuk konversi koordinat drag <-> data asli.
  useEffect(() => {
    function measure() {
      if (canvasRef.current) setCanvasWidth(canvasRef.current.clientWidth);
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [imageUrl]);

  async function load() {
    if (!templateId) return;
    setLoading(true);

    const { data: templateData, error } = await supabase
      .from('certificate_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (error || !templateData) {
      setLoading(false);
      return;
    }

    setTemplate(templateData);
    setPlaceholders((templateData.placeholders as Record<string, PlaceholderPosition>) ?? {});

    const { data: signedUrlData } = await supabase.storage
      .from('certificate-templates')
      .createSignedUrl(templateData.file_path, 60 * 30);

    setImageUrl(signedUrlData?.signedUrl ?? null);
    setLoading(false);
  }

  const pageWidth = template?.page_width ?? 1000;
  const pageHeight = template?.page_height ?? 700;
  const scale = canvasWidth > 0 ? canvasWidth / pageWidth : 1;
  const canvasHeight = pageHeight * scale;

  const availableKeys = Object.keys(placeholders) as PlaceholderKey[];

  function updatePlaceholder(key: string, patch: Partial<PlaceholderPosition>) {
    setPlaceholders((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  // ============ Drag-and-drop handling (pointer events, mendukung mouse & touch) ============
  const draggingKeyRef = useRef<string | null>(null);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const key = draggingKeyRef.current;
      if (!key || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const relX = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
      const relY = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
      // Konversi posisi kursor (skala CSS) -> koordinat asli gambar (skala penuh)
      const realX = Math.round(relX / scale);
      const realY = Math.round(relY / scale);
      setPlaceholders((prev) => ({ ...prev, [key]: { ...prev[key], x: realX, y: realY } }));
    },
    [scale]
  );

  const handlePointerUp = useCallback(() => {
    draggingKeyRef.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  }, [handlePointerMove]);

  function startDrag(key: string, e: ReactPointerEvent) {
    e.preventDefault();
    setSelectedKey(key as PlaceholderKey);
    draggingKeyRef.current = key;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  // Safety net: kalau komponen unmount (misal user navigasi keluar) sementara
  // pointer masih ditekan/drag, pastikan listener global ikut dibersihkan
  // supaya tidak menumpuk di memory / memicu setState pada komponen yang
  // sudah tidak ter-mount.
  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  async function handleSave() {
    if (!templateId) return;
    setSaving(true);
    const { error } = await supabase
      .from('certificate_templates')
      .update({ placeholders })
      .eq('id', templateId);
    setSaving(false);
    if (error) {
      alert('Gagal menyimpan: ' + error.message);
    } else {
      navigate(-1);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!template || !imageUrl) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-16 text-center text-gray-500">
        <p>Template tidak ditemukan atau gagal memuat gambar.</p>
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Kembali
        </button>
      </div>
    );
  }

  const selected = selectedKey ? placeholders[selectedKey] : null;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm transition hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali
        </button>

        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Menyimpan...' : 'Simpan Posisi'}
        </button>
      </div>

      <div>
        <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Atur Posisi Placeholder</h2>
        <p className="mt-1 text-sm text-gray-500">
          Seret (drag) label di atas gambar untuk mengatur posisi. Klik salah satu untuk mengubah ukuran & warna di panel kanan.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
        {/* ============ Canvas ============ */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div
            ref={canvasRef}
            className="relative w-full touch-none select-none bg-gray-100"
            style={{ height: canvasHeight || 'auto', aspectRatio: canvasHeight ? undefined : `${pageWidth} / ${pageHeight}` }}
          >
            <img src={imageUrl} alt="Template" className="pointer-events-none absolute inset-0 h-full w-full object-contain" draggable={false} />

            {availableKeys.map((key) => {
              const p = placeholders[key];
              if (!p) return null;
              const meta = PLACEHOLDER_META[key];
              const isSelected = selectedKey === key;
              const disabled = p.enabled === false;

              const left = p.x * scale;
              const top = p.y * scale;

              return (
                <div
                  key={key}
                  onPointerDown={(e) => startDrag(key, e)}
                  className={`absolute cursor-move rounded-md border-2 px-2 py-1 text-xs font-semibold shadow-sm transition-opacity ${
                    disabled
                      ? 'border-dashed border-gray-300 bg-white/70 text-gray-400 opacity-50'
                      : isSelected
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-amber-400 bg-amber-50 text-amber-800'
                  }`}
                  style={{
                    left,
                    top,
                    fontSize: meta.isImage ? undefined : Math.max((p.fontSize ?? 24) * scale, 10),
                    color: !disabled && !isSelected && !meta.isImage ? p.color : undefined,
                    transform:
                      p.align === 'center' ? 'translateX(-50%)' : p.align === 'right' ? 'translateX(-100%)' : undefined,
                  }}
                >
                  {meta.isImage ? `[${meta.label}]` : SAMPLE_VALUES[key]}
                </div>
              );
            })}
          </div>
        </div>

        {/* ============ Panel Kontrol ============ */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Daftar Placeholder</h3>
            <div className="space-y-1.5">
              {availableKeys.map((key) => {
                const meta = PLACEHOLDER_META[key];
                const Icon = meta.icon;
                const p = placeholders[key];
                const enabled = p?.enabled !== false;

                return (
                  <div
                    key={key}
                    onClick={() => setSelectedKey(key)}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                      selectedKey === key ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0 text-gray-500" />
                    <span className={`flex-1 truncate ${enabled ? 'text-gray-800' : 'text-gray-400'}`}>{meta.label}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updatePlaceholder(key, { enabled: !enabled });
                      }}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      title={enabled ? 'Sembunyikan dari sertifikat' : 'Tampilkan di sertifikat'}
                    >
                      {enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {selected && selectedKey && (
            <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900">
                Pengaturan: {PLACEHOLDER_META[selectedKey].label}
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Posisi X</label>
                  <input
                    type="number"
                    value={Math.round(selected.x)}
                    onChange={(e) => updatePlaceholder(selectedKey, { x: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Posisi Y</label>
                  <input
                    type="number"
                    value={Math.round(selected.y)}
                    onChange={(e) => updatePlaceholder(selectedKey, { y: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                  />
                </div>
              </div>

              {PLACEHOLDER_META[selectedKey].isImage ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Ukuran (px)</label>
                  <input
                    type="number"
                    min={20}
                    value={selected.width ?? 100}
                    onChange={(e) => updatePlaceholder(selectedKey, { width: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Ukuran Font</label>
                    <input
                      type="number"
                      min={8}
                      max={120}
                      value={selected.fontSize ?? 24}
                      onChange={(e) => updatePlaceholder(selectedKey, { fontSize: Number(e.target.value) })}
                      className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Warna Teks</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={selected.color ?? '#000000'}
                        onChange={(e) => updatePlaceholder(selectedKey, { color: e.target.value })}
                        className="h-9 w-12 cursor-pointer rounded-lg border border-gray-300"
                      />
                      <input
                        type="text"
                        value={selected.color ?? '#000000'}
                        onChange={(e) => updatePlaceholder(selectedKey, { color: e.target.value })}
                        className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm font-mono focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-600">Perataan</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['left', 'center', 'right'] as const).map((align) => (
                        <button
                          key={align}
                          onClick={() => updatePlaceholder(selectedKey, { align })}
                          className={`rounded-lg border px-2 py-1.5 text-xs font-medium capitalize transition ${
                            (selected.align ?? 'left') === align
                              ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {align === 'left' ? 'Kiri' : align === 'center' ? 'Tengah' : 'Kanan'}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <p className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
            Tampilan di sini adalah perkiraan visual. Hasil akhir PDF sertifikat mungkin sedikit
            berbeda tergantung font yang dipakai server.
          </p>
        </div>
      </div>
    </div>
  );
}
