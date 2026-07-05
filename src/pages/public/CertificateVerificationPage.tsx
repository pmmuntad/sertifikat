import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import {
  Sparkles,
  Loader2,
  ShieldCheck,
  ShieldX,
  Calendar,
  Hash,
  Building2,
  Download,
} from 'lucide-react';

interface VerificationResult {
  valid: boolean;
  nama_lengkap?: string;
  event_name?: string;
  certificate_number?: string;
  issued_at?: string;
  recipient_type?: string;
  jabatan?: string | null;
  file_url?: string;
  message?: string;
}

/**
 * Halaman publik tujuan QR yang tertera di setiap sertifikat. Sengaja TIDAK
 * mengarah langsung ke file PDF mentah — halaman ini menampilkan status
 * keaslian ("Sertifikat Valid") + preview, baru dari sini ada tombol download.
 * Validasi hash dilakukan di Edge Function `verify-certificate` (server-side),
 * bukan hanya query langsung ke tabel certificates dari client.
 */
export function CertificateVerificationPage() {
  const { certificateId } = useParams();
  const [searchParams] = useSearchParams();
  const sig = searchParams.get('sig');

  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!certificateId) return;
    verify();
  }, [certificateId]);

  async function verify() {
    if (!certificateId) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('verify-certificate', {
      body: { certificate_id: certificateId, sig },
    });

    if (error) {
      setResult({ valid: false, message: 'Gagal memverifikasi sertifikat.' });
    } else {
      setResult(data as VerificationResult);
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-gray-50 px-4 py-8 sm:py-12">
      <div className="mb-5 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-purple-700">
          <Sparkles className="h-4 w-4 text-white" />
        </span>
        <span className="text-sm font-bold tracking-tight text-gray-700">SertifikatLive</span>
      </div>

      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-5 shadow-xl shadow-gray-200/50 sm:p-7">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
            <p className="text-sm text-gray-500">Memverifikasi sertifikat...</p>
          </div>
        ) : !result || !result.valid ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-500">
              <ShieldX className="h-8 w-8" />
            </span>
            <h2 className="text-lg font-bold text-gray-900">Sertifikat Tidak Valid</h2>
            <p className="text-sm text-gray-500">
              {result?.message ?? 'Sertifikat tidak ditemukan atau tanda tangan verifikasi tidak cocok.'}
            </p>
          </div>
        ) : (
          <div>
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                <ShieldCheck className="h-8 w-8" />
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                Sertifikat Valid
              </span>
              <div>
                <h2 className="text-lg font-bold text-gray-900">{result.nama_lengkap}</h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  {result.recipient_type === 'panitia' ? `Panitia — ${result.jabatan ?? ''}` : 'Peserta'}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3 rounded-xl bg-gray-50 p-4">
              <DetailRow icon={<Building2 className="h-4 w-4" />} label="Acara" value={result.event_name ?? '-'} />
              <DetailRow
                icon={<Hash className="h-4 w-4" />}
                label="No. Sertifikat"
                value={result.certificate_number ?? '-'}
                mono
              />
              <DetailRow
                icon={<Calendar className="h-4 w-4" />}
                label="Tanggal Terbit"
                value={result.issued_at ? new Date(result.issued_at).toLocaleDateString('id-ID') : '-'}
              />
            </div>

            {result.file_url && (
              <a href={result.file_url} target="_blank" rel="noopener noreferrer" className="mt-5 block">
                <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">
                  <Download className="h-4 w-4" /> Lihat / Unduh Sertifikat
                </button>
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-gray-400">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`truncate text-sm font-medium text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</p>
      </div>
    </div>
  );
}
